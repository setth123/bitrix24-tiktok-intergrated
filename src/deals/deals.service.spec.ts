import { ConflictException, NotFoundException } from '@nestjs/common';
import { DEFAULT_PIPELINE_STAGES } from '../settings/defaults';
import { mockQueue, mockRepo, testConfig } from '../test-utils';
import {
  DealsService,
  fromBitrixStage,
  stageStatus,
  toBitrixStage,
} from './deals.service';

const lead = {
  id: 'lead-1',
  name: 'Nguyễn Văn A',
  bitrix24Id: 101,
  campaignName: 'Spring Sale',
  score: 70,
  rawData: { campaign: { campaign_name: 'Spring Sale' } },
} as any;

function setup() {
  const deals = mockRepo();
  const leads = mockRepo();
  const queue = mockQueue();
  const redis = { incr: jest.fn() };
  const bitrix = {
    addDeal: jest.fn().mockResolvedValue(900),
    getDeal: jest.fn(),
    addTimelineComment: jest.fn().mockResolvedValue(undefined),
    notifyUser: jest.fn().mockResolvedValue(undefined),
  };
  const settings = {
    getRules: jest.fn().mockResolvedValue({
      deal_rules: [
        {
          condition: "campaign.campaign_name CONTAINS 'sale'",
          action: 'create_deal',
          pipeline_id: '1',
          stage_id: 'NEW',
          probability: 30,
          assigned_to: ['5', '7'],
        },
      ],
      pipeline_stages: DEFAULT_PIPELINE_STAGES,
    }),
  };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const service = new DealsService(
    deals as any,
    leads as any,
    queue as any,
    redis as any,
    bitrix as any,
    settings as any,
    notifications as any,
    testConfig({ bitrix24: { defaultAssignee: '1' } }),
  );
  deals.findOneBy.mockResolvedValue(null);
  return {
    service,
    deals,
    leads,
    queue,
    redis,
    bitrix,
    settings,
    notifications,
  };
}

describe('stage helpers', () => {
  it('converts stage ids between local and Bitrix24 format', () => {
    expect(toBitrixStage('1', 'NEW')).toBe('C1:NEW');
    expect(toBitrixStage('0', 'NEW')).toBe('NEW');
    expect(fromBitrixStage('C1:WON')).toBe('WON');
  });

  it('maps stages to status', () => {
    expect(stageStatus('WON', DEFAULT_PIPELINE_STAGES)).toBe('won');
    expect(stageStatus('LOSE', [])).toBe('lost');
    expect(stageStatus('WON', [])).toBe('won');
    expect(stageStatus('NEW', DEFAULT_PIPELINE_STAGES)).toBe('open');
  });
});

describe('DealsService', () => {
  it('creates a deal from the matching rule with round-robin assignment', async () => {
    const { service, deals, leads, bitrix, redis, notifications } = setup();
    redis.incr.mockResolvedValue(2);

    const deal = await service.applyRules(lead, lead.rawData);

    expect(deals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        pipelineId: '1',
        stage: 'NEW',
        probability: 30,
        assignedTo: '7',
        status: 'open',
      }),
    );
    expect(bitrix.addDeal).toHaveBeenCalledWith(
      expect.objectContaining({
        CATEGORY_ID: '1',
        STAGE_ID: 'C1:NEW',
        LEAD_ID: 101,
        ASSIGNED_BY_ID: '7',
        PROBABILITY: 30,
      }),
    );
    expect(deal?.bitrix24Id).toBe(900);
    expect(deals.update).toHaveBeenCalledWith('generated-id', {
      bitrix24Id: 900,
    });
    expect(leads.update).toHaveBeenCalledWith('lead-1', {
      status: 'converted',
    });
    expect(bitrix.notifyUser).toHaveBeenCalledWith('7', expect.any(String));
    expect(notifications.notify).toHaveBeenCalledWith(
      'deal.created',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('returns null when no rule matches', async () => {
    const { service, bitrix } = setup();
    await expect(
      service.applyRules(lead, { campaign: { campaign_name: 'Brand' } }),
    ).resolves.toBeNull();
    expect(bitrix.addDeal).not.toHaveBeenCalled();
  });

  it('is idempotent: returns an existing synced deal, finishes an unsynced one', async () => {
    const { service, deals, bitrix } = setup();
    deals.findOneBy.mockResolvedValueOnce({ id: 'd1', bitrix24Id: 5 });
    await expect(
      service.createFromLead(lead, { pipeline_id: '0', stage_id: 'NEW' }),
    ).resolves.toEqual({ id: 'd1', bitrix24Id: 5 });
    expect(bitrix.addDeal).not.toHaveBeenCalled();

    deals.findOneBy.mockResolvedValueOnce({
      id: 'd2',
      bitrix24Id: null,
      title: 'T',
      pipelineId: '0',
      stage: 'NEW',
      probability: 10,
      amount: null,
      currency: 'VND',
      assignedTo: null,
    });
    const deal = await service.createFromLead(lead, {
      pipeline_id: '0',
      stage_id: 'NEW',
    });
    expect(deals.save).not.toHaveBeenCalled();
    expect(deal.bitrix24Id).toBe(900);
  });

  it('uses stage probability and default assignee when the rule does not specify them', async () => {
    const { service, deals, bitrix } = setup();
    await service.createFromLead(lead, {
      pipeline_id: '0',
      stage_id: 'EXECUTING',
    });
    expect(deals.create).toHaveBeenCalledWith(
      expect.objectContaining({ probability: 70, assignedTo: '1' }),
    );
    expect(bitrix.addDeal).toHaveBeenCalledWith(
      expect.objectContaining({ STAGE_ID: 'EXECUTING' }),
    );

    await service.createFromLead(lead, {
      pipeline_id: '0',
      stage_id: 'CUSTOM',
      assigned_to: '9',
    });
    expect(deals.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ probability: 0, assignedTo: '9' }),
    );
  });

  it('refuses to create a deal for a lead not synced to Bitrix24', async () => {
    const { service } = setup();
    await expect(
      service.createFromLead(
        { ...lead, bitrix24Id: null },
        { pipeline_id: '0', stage_id: 'NEW' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('converts a lead manually with overrides', async () => {
    const { service, leads, deals, redis } = setup();
    redis.incr.mockResolvedValue(1);
    leads.findOneBy.mockResolvedValueOnce(null);
    await expect(service.convertLead('x', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );

    leads.findOneBy.mockResolvedValueOnce(lead);
    await service.convertLead('lead-1', {
      stage_id: 'PREPARATION',
      amount: 5_000_000,
      probability: undefined,
    });
    expect(deals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineId: '1',
        stage: 'PREPARATION',
        amount: 5_000_000,
        probability: 30,
        assignedTo: '5',
      }),
    );
  });

  it('converts with defaults when no rule matches', async () => {
    const { service, leads, deals } = setup();
    leads.findOneBy.mockResolvedValueOnce({ ...lead, rawData: null });
    await service.convertLead('lead-1', {});
    expect(deals.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineId: '0',
        stage: 'NEW',
        probability: 10,
      }),
    );
  });

  it('lists deals with filters', async () => {
    const { service, deals } = setup();
    deals.findAndCount.mockResolvedValue([[], 0]);
    await service.list({ page: 2, limit: 5, status: 'open', assigned_to: '7' });
    expect(deals.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'open', assignedTo: '7' },
        skip: 5,
        take: 5,
      }),
    );
  });

  describe('applyBitrixUpdate', () => {
    const open = {
      id: 'd1',
      title: 'Deal',
      status: 'open',
      probability: 30,
      amount: null,
      closedAt: null,
    };

    it('ignores unknown deals', async () => {
      const { service } = setup();
      await expect(service.applyBitrixUpdate(1, 'WON')).resolves.toEqual({
        updated: false,
      });
    });

    it('marks deal won, enqueues TikTok conversion and notifies', async () => {
      const { service, deals, queue, notifications } = setup();
      deals.findOneBy.mockResolvedValueOnce({ ...open });
      await expect(
        service.applyBitrixUpdate(900, 'C1:WON', '8000000'),
      ).resolves.toEqual({ updated: true, status: 'won' });
      expect(deals.update).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({
          stage: 'WON',
          status: 'won',
          probability: 100,
          amount: 8_000_000,
          closedAt: expect.any(Date),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'conversion',
        { dealId: 'd1' },
        { jobId: 'won_d1' },
      );
      expect(notifications.notify).toHaveBeenCalledWith(
        'deal.won',
        expect.any(String),
        expect.any(Object),
      );
    });

    it('fetches stage from Bitrix24 when the webhook does not include it', async () => {
      const { service, deals, bitrix, queue } = setup();
      deals.findOneBy.mockResolvedValueOnce({ ...open, amount: 100 });
      bitrix.getDeal.mockResolvedValue({ STAGE_ID: 'C1:EXECUTING' });
      await service.applyBitrixUpdate(900);
      expect(deals.update).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({
          stage: 'EXECUTING',
          status: 'open',
          probability: 70,
          amount: 100,
          closedAt: null,
        }),
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('keeps probability for unknown stages', async () => {
      const { service, deals } = setup();
      deals.findOneBy.mockResolvedValueOnce({ ...open });
      await service.applyBitrixUpdate(900, 'CUSTOM_STAGE', '');
      expect(deals.update).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({ probability: 30, amount: null }),
      );
    });
  });
});
