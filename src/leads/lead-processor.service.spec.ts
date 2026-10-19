import { UnrecoverableError } from 'bullmq';
import { mockRepo, testConfig } from '../test-utils';
import { LeadProcessorService } from './lead-processor.service';

const payload = {
  event: 'lead.generate',
  event_id: 'evt_1',
  timestamp: 1,
  campaign: {
    campaign_id: 'c1',
    campaign_name: 'Spring Sale',
    ad_id: 'a1',
    ad_name: 'Ad',
  },
  form: { form_id: 'f1', form_name: 'Form' },
  lead_data: {
    full_name: 'Nguyễn Văn A',
    email: 'A@B.com',
    phone: '0901234567',
    city: 'HN',
  },
};

function setup() {
  const leads = mockRepo();
  const events = mockRepo();
  const bitrix = {
    addLead: jest.fn().mockResolvedValue(101),
    updateLead: jest.fn().mockResolvedValue(undefined),
    addTimelineComment: jest.fn().mockResolvedValue(undefined),
  };
  const settings = {
    getFieldMapping: jest
      .fn()
      .mockResolvedValue({ 'lead_data.full_name': 'NAME' }),
  };
  const deals = { applyRules: jest.fn().mockResolvedValue(null) };
  const service = new LeadProcessorService(
    leads as any,
    events as any,
    bitrix as any,
    settings as any,
    deals as any,
    testConfig(),
  );
  events.findOneBy.mockResolvedValue({
    id: 'ev-row',
    eventId: 'evt_1',
    status: 'received',
    payload,
  });
  leads.findOneBy.mockResolvedValue(null);
  return { service, leads, events, bitrix, deals };
}

describe('LeadProcessorService', () => {
  it('creates a new lead, syncs to Bitrix24, applies rules and marks the event processed', async () => {
    const { service, leads, events, bitrix, deals } = setup();

    const result = await service.process('evt_1');

    expect(result).toEqual({ leadId: 'generated-id' });
    const saved = leads.save.mock.calls[0][0] as Record<string, any>;
    expect(saved).toMatchObject({
      externalId: 'evt_1',
      name: 'Nguyễn Văn A',
      email: 'a@b.com',
      phone: '+84901234567',
      campaignId: 'c1',
      submissions: 1,
      status: 'new',
    });
    expect(saved.score).toBeGreaterThan(0);
    expect(leads.update).toHaveBeenCalledWith('generated-id', {
      bitrix24Id: 101,
      status: 'synced',
    });
    expect(bitrix.addLead).toHaveBeenCalledWith(
      expect.objectContaining({ NAME: 'Nguyễn Văn A' }),
    );
    expect(bitrix.addTimelineComment).toHaveBeenCalledWith(
      'lead',
      101,
      expect.stringContaining('Lead mới'),
    );
    expect(deals.applyRules).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'generated-id', bitrix24Id: 101 }),
      expect.objectContaining({ answers: {} }),
    );
    expect(events.update).toHaveBeenCalledWith(
      'ev-row',
      expect.objectContaining({ status: 'processed' }),
    );
  });

  it('merges into an existing lead found by phone and updates Bitrix24 without contact fields', async () => {
    const { service, leads, bitrix } = setup();
    const existing = {
      id: 'lead-1',
      name: 'Old name',
      email: null,
      phone: '+84901234567',
      city: 'HCM',
      submissions: 1,
      score: 90,
      bitrix24Id: 55,
      status: 'converted',
      rawData: { event_id: 'evt_0' },
    };
    leads.findOneBy.mockImplementation(({ email, phone }: any) =>
      Promise.resolve(email ? null : phone ? existing : null),
    );

    await service.process('evt_1');

    expect(existing).toMatchObject({
      name: 'Nguyễn Văn A',
      email: 'a@b.com', // bổ sung email còn trống
      city: 'HN',
      submissions: 2,
      score: 90, // giữ điểm cao hơn
      status: 'converted',
    });
    expect(bitrix.addLead).not.toHaveBeenCalled();
    const [id, fields] = bitrix.updateLead.mock.calls[0];
    expect(id).toBe(55);
    expect(fields).not.toHaveProperty('EMAIL');
    expect(fields).not.toHaveProperty('PHONE');
    expect(bitrix.addTimelineComment).toHaveBeenCalledWith(
      'lead',
      55,
      expect.stringContaining('lần 2'),
    );
  });

  it('does not double count submissions when a job is retried', async () => {
    const { service, leads, events } = setup();
    const existing = {
      id: 'lead-1',
      name: 'A',
      email: 'a@b.com',
      phone: null,
      submissions: 1,
      score: 0,
      bitrix24Id: 5,
      status: 'synced',
      rawData: { event_id: 'evt_1' },
    };
    leads.findOneBy.mockResolvedValue(existing);
    events.findOneBy.mockResolvedValue({
      id: 'ev',
      eventId: 'evt_1',
      status: 'received',
      payload: { ...payload, lead_data: { email: 'a@b.com' } },
    });

    await service.process('evt_1');

    expect(existing.submissions).toBe(1);
    expect(existing.name).toBe('A'); // payload không có full_name -> giữ tên cũ
    expect(existing.phone).toBeNull();
  });

  it('skips events that were already processed', async () => {
    const { service, events, leads } = setup();
    events.findOneBy.mockResolvedValue({
      id: 'ev',
      status: 'processed',
      payload,
    });
    await expect(service.process('evt_1')).resolves.toEqual({ skipped: true });
    expect(leads.save).not.toHaveBeenCalled();
  });

  it('throws UnrecoverableError for unknown events or leads without contact info', async () => {
    const { service, events } = setup();
    events.findOneBy.mockResolvedValueOnce(null);
    await expect(service.process('missing')).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    events.findOneBy.mockResolvedValueOnce({
      id: 'ev',
      status: 'received',
      payload: { ...payload, lead_data: { email: 'bad', phone: '1' } },
    });
    await expect(service.process('evt_1')).rejects.toThrow('không có email');
  });

  it('marks failed events', async () => {
    const { service, events } = setup();
    await service.markFailed('evt_1', 'boom');
    expect(events.update).toHaveBeenCalledWith(
      { eventId: 'evt_1' },
      { status: 'failed', error: 'boom' },
    );
  });
});
