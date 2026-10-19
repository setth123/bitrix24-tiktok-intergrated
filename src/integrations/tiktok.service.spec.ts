import { createHash } from 'node:crypto';
import { testConfig } from '../test-utils';
import { TiktokService } from './tiktok.service';

const evt = {
  event: 'CompletePayment',
  eventId: 'e1',
  email: ' A@B.com ',
  phone: '+84901234567',
  ttclid: 'TT',
  value: 5,
};
const tiktokConfig = (mode: string) =>
  testConfig({ tiktok: { mode, accessToken: 'tok', eventSourceId: 'src' } });

describe('TiktokService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('hashes PII in the Events API payload', () => {
    const payload = new TiktokService(tiktokConfig('mock')).buildPayload(evt);
    expect(payload.event_source_id).toBe('src');
    expect(payload.data[0].user.email).toBe(
      createHash('sha256').update('a@b.com').digest('hex'),
    );
    expect(payload.data[0].properties).toEqual({ value: 5, currency: 'VND' });
    const empty = new TiktokService(tiktokConfig('mock')).buildPayload({
      event: 'X',
      eventId: 'e',
    });
    expect(empty.data[0].user).toEqual({
      email: undefined,
      phone: undefined,
      ttclid: undefined,
    });
  });

  it('only logs in mock mode', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await new TiktokService(tiktokConfig('mock')).sendConversion(evt);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the Events API in live mode and throws on errors', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ code: 0 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ code: 40001, message: 'bad' }),
      } as Response);
    const service = new TiktokService(tiktokConfig('live'));
    await service.sendConversion(evt);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { 'Access-Token': 'tok' },
    });
    await expect(service.sendConversion(evt)).rejects.toThrow(
      'TikTok Events API error',
    );
  });
});
