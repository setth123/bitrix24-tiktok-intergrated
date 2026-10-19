import { Bitrix24Service } from './bitrix24.service';
import {
  Bitrix24Error,
  Bitrix24HttpTransport,
  Bitrix24MockTransport,
} from './bitrix24.transport';

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as Response;

describe('Bitrix24HttpTransport', () => {
  const transport = new Bitrix24HttpTransport(
    'https://portal.bitrix24.com/rest/1/token/',
  );
  afterEach(() => jest.restoreAllMocks());

  it('posts JSON to <webhook>/<method>.json and returns result', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, { result: 42 }));
    await expect(
      transport.call('crm.lead.add', { fields: { NAME: 'A' } }),
    ).resolves.toBe(42);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://portal.bitrix24.com/rest/1/token/crm.lead.add.json',
      expect.objectContaining({
        method: 'POST',
        body: '{"fields":{"NAME":"A"}}',
      }),
    );
  });

  it.each([
    [jsonResponse(503, {}), 'HTTP_503', true],
    [
      jsonResponse(400, { error: 'QUERY_LIMIT_EXCEEDED' }),
      'QUERY_LIMIT_EXCEEDED',
      true,
    ],
    [
      jsonResponse(200, { error: 'ACCESS_DENIED', error_description: 'no' }),
      'ACCESS_DENIED',
      false,
    ],
  ])('maps API errors (%#)', async (response, code, retryable) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response);
    await expect(transport.call('crm.lead.add', {})).rejects.toMatchObject({
      code,
      retryable,
    });
  });

  it('treats network failures as retryable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(transport.call('crm.lead.add', {})).rejects.toMatchObject({
      code: 'NETWORK',
      retryable: true,
    });
  });

  it('handles non-JSON bodies', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('x')),
    } as unknown as Response);
    await expect(transport.call('m', {})).rejects.toBeInstanceOf(Bitrix24Error);
  });
});

describe('Bitrix24Service with mock transport', () => {
  const transport = new Bitrix24MockTransport();
  const service = new Bitrix24Service(transport);

  it('supports the CRM operations used by the app', async () => {
    const leadId = await service.addLead({ NAME: 'A' });
    await service.updateLead(leadId, { CITY: 'HN' });
    expect(transport.leads.get(leadId)).toEqual({ NAME: 'A', CITY: 'HN' });

    const dealId = await service.addDeal({ TITLE: 'D', STAGE_ID: 'NEW' });
    await transport.call('crm.deal.update', {
      id: dealId,
      fields: { STAGE_ID: 'WON' },
    });
    await expect(service.getDeal(dealId)).resolves.toEqual({
      ID: String(dealId),
      TITLE: 'D',
      STAGE_ID: 'WON',
    });
    await expect(service.getDeal(-1)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await service.addTimelineComment('lead', leadId, 'hello');
    await service.notifyUser('1', 'msg');
    expect(transport.calls.map((c) => c.method)).toEqual([
      'crm.lead.add',
      'crm.lead.update',
      'crm.deal.add',
      'crm.deal.update',
      'crm.deal.get',
      'crm.deal.get',
      'crm.timeline.comment.add',
      'im.notify.system.add',
    ]);
    await expect(transport.call('unknown.method', {})).rejects.toMatchObject({
      code: 'METHOD_NOT_FOUND',
    });
  });

  it('never throws from notifyUser', async () => {
    const failing = new Bitrix24Service({
      call: jest.fn().mockRejectedValue(new Error('down')),
    });
    await expect(failing.notifyUser('1', 'x')).resolves.toBeUndefined();
  });
});
