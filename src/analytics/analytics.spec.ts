import { mockQueue } from '../test-utils';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ReportsScheduler } from './reports.scheduler';

function setup() {
  const db = { query: jest.fn() };
  const queue = mockQueue();
  const deadLetters = { count: jest.fn().mockResolvedValue(3) };
  const settings = {
    getCampaignSpend: jest.fn().mockResolvedValue({ c1: 1_000_000 }),
  };
  const cache = {
    getOrSet: jest.fn((_k: string, _t: number, load: () => unknown) => load()),
  };
  const service = new AnalyticsService(
    db as any,
    queue as any,
    deadLetters as any,
    settings as any,
    cache as any,
  );
  return { service, db, cache };
}

describe('AnalyticsService', () => {
  it('computes conversion rates', async () => {
    const { service, db, cache } = setup();
    db.query.mockResolvedValue([
      { leads: '10', deals: '4', won: '2', lost: '1' },
    ]);
    await expect(service.conversionRates('7d')).resolves.toEqual({
      date_range: '7d',
      leads: 10,
      deals: 4,
      won: 2,
      lost: 1,
      lead_to_deal_rate: 0.4,
      deal_win_rate: 0.6667,
      lead_to_won_rate: 0.2,
    });
    expect(cache.getOrSet).toHaveBeenCalledWith(
      'analytics:conversion:7d',
      60,
      expect.any(Function),
    );
  });

  it('computes CPL and ROI per campaign', async () => {
    const { service, db } = setup();
    db.query.mockResolvedValue([
      {
        campaign_id: 'c1',
        campaign_name: 'Sale',
        leads: '4',
        avg_score: '55.5',
        deals: '2',
        won: '1',
        revenue: '3000000',
      },
      {
        campaign_id: null,
        campaign_name: null,
        leads: '1',
        avg_score: '10',
        deals: '0',
        won: '0',
        revenue: '0',
      },
    ]);
    const [c1, unknown] = await service.campaignPerformance();
    expect(c1).toEqual({
      campaign_id: 'c1',
      campaign_name: 'Sale',
      leads: 4,
      avg_score: 55.5,
      deals: 2,
      won: 1,
      conversion_rate: 0.25,
      revenue: 3_000_000,
      spend: 1_000_000,
      cost_per_lead: 250_000,
      roi: 2,
    });
    expect(unknown).toMatchObject({
      spend: null,
      cost_per_lead: null,
      roi: null,
    });
  });

  it('builds the realtime dashboard', async () => {
    const { service, db } = setup();
    db.query
      .mockResolvedValueOnce([
        {
          leads_today: '2',
          leads_24h: '3',
          leads_total: '30',
          avg_score: '61.2',
        },
      ])
      .mockResolvedValueOnce([
        { status: 'open', count: '5' },
        { status: 'won', count: '2' },
      ]);
    await expect(service.dashboard()).resolves.toMatchObject({
      leads_today: 2,
      leads_last_24h: 3,
      leads_total: 30,
      avg_lead_score: 61.2,
      deals_by_status: { open: 5, won: 2 },
      queue: { waiting: 1, active: 0, delayed: 0, failed: 2, dead_letter: 3 },
    });
  });

  it('exports lead rows', async () => {
    const { service, db } = setup();
    db.query.mockResolvedValue([{ id: '1' }]);
    await expect(service.exportLeads('all')).resolves.toEqual([{ id: '1' }]);
  });
});

describe('AnalyticsController', () => {
  const analytics = {
    conversionRates: jest.fn().mockResolvedValue({}),
    campaignPerformance: jest.fn().mockResolvedValue([]),
    dashboard: jest.fn().mockResolvedValue({}),
    exportLeads: jest.fn().mockResolvedValue([{ name: 'A', email: 'a@b.com' }]),
  };
  const controller = new AnalyticsController(analytics as any);

  it('delegates analytics endpoints', async () => {
    await controller.conversionRates('7d');
    await controller.campaignPerformance('7d');
    await controller.dashboard();
    expect(analytics.conversionRates).toHaveBeenCalledWith('7d');
    expect(analytics.campaignPerformance).toHaveBeenCalledWith('7d');
  });

  it('exports CSV with download headers, or JSON', async () => {
    const res = { setHeader: jest.fn() };
    await expect(controller.export(res as any, 'csv', '30d')).resolves.toBe(
      '\uFEFFname,email\r\nA,a@b.com',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    await expect(controller.export(res as any, 'json')).resolves.toEqual([
      { name: 'A', email: 'a@b.com' },
    ]);
  });
});

describe('ReportsScheduler', () => {
  const analytics = {
    conversionRates: jest
      .fn()
      .mockResolvedValue({ leads: 5, deals: 2, won: 1 }),
    campaignPerformance: jest
      .fn()
      .mockResolvedValue([
        { campaign_id: 'c1', campaign_name: null, leads: 5 },
      ]),
    dashboard: jest.fn(),
  };
  const notifications = { notify: jest.fn() };
  const scheduler = new ReportsScheduler(
    analytics as any,
    notifications as any,
  );
  beforeEach(() => notifications.notify.mockClear());

  it('sends the daily report', async () => {
    await scheduler.dailyReport();
    expect(notifications.notify).toHaveBeenCalledWith(
      'report.daily',
      expect.stringContaining('c1: 5 leads'),
      expect.any(Object),
    );
    analytics.campaignPerformance.mockResolvedValueOnce([]);
    await scheduler.dailyReport();
    expect(notifications.notify).toHaveBeenLastCalledWith(
      'report.daily',
      expect.stringContaining('Top: -'),
      expect.any(Object),
    );
  });

  it('alerts on dead letters and queue backlog', async () => {
    analytics.dashboard.mockResolvedValueOnce({
      queue: { dead_letter: 0, waiting: 0 },
    });
    await scheduler.checkAlerts();
    expect(notifications.notify).not.toHaveBeenCalled();
    analytics.dashboard.mockResolvedValueOnce({
      queue: { dead_letter: 2, waiting: 501 },
    });
    await scheduler.checkAlerts();
    expect(notifications.notify).toHaveBeenCalledWith(
      'alert.dead_letter',
      expect.any(String),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      'alert.queue_backlog',
      expect.any(String),
    );
  });
});
