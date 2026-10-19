import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import Redis from 'ioredis';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { REDIS } from '../src/common/redis.provider';
import { signTiktokPayload } from '../src/webhooks/tiktok-signature';
import samplePayload from '../scripts/sample-payload.json';

const API_KEY = process.env.API_KEY!;
const SECRET = process.env.TIKTOK_WEBHOOK_SECRET!;

/** Chờ tới khi điều kiện đúng (job xử lý bất đồng bộ qua BullMQ). */
async function waitFor<T>(
  fn: () => Promise<T | undefined | null | false>,
  timeoutMs = 10_000,
): Promise<T> {
  const started = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('TikTok -> Bitrix24 integration (e2e)', () => {
  let app: INestApplication<App>;
  let db: DataSource;

  const sendWebhook = (payload: object, secret = SECRET) => {
    const body = JSON.stringify(payload);
    return request(app.getHttpServer())
      .post('/webhooks/tiktok/leads')
      .set('Content-Type', 'application/json')
      .set('TikTok-Signature', signTiktokPayload(body, secret))
      .send(body);
  };
  const api = (method: 'get' | 'put' | 'post', path: string) =>
    request(app.getHttpServer())[method](path).set('x-api-key', API_KEY);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true, logger: ['error'] });
    await app.init();
    db = app.get(getDataSourceToken());
    await db.query(
      'TRUNCATE leads, deals, webhook_events, configurations CASCADE',
    );
    await app.get<Redis>(REDIS).flushdb();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health reports database and redis up', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      details: { database: 'up', redis: 'up' },
    });
  });

  it('rejects webhooks with a missing or invalid signature', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/tiktok/leads')
      .send(samplePayload)
      .expect(401);
    await sendWebhook(samplePayload, 'wrong-secret').expect(401);
  });

  it('rejects invalid payloads', async () => {
    const res = await sendWebhook({
      event: 'lead.generate',
      timestamp: 'yesterday',
    }).expect(400);
    expect(res.body.message).toEqual(
      expect.arrayContaining(['event_id must be a string']),
    );
  });

  it('processes a lead end-to-end: webhook -> lead -> Bitrix24 -> rule -> deal', async () => {
    const res = await sendWebhook(samplePayload).expect(202);
    expect(res.body).toEqual({ status: 'queued', event_id: 'evt_1234567890' });

    const [lead] = await waitFor(async () => {
      const rows = await db.query(
        `SELECT * FROM leads WHERE status = 'converted'`,
      );
      return rows.length ? rows : null;
    });
    expect(lead).toMatchObject({
      external_id: 'evt_1234567890',
      name: 'Nguyễn Văn A',
      email: 'nguyenvana@email.com',
      phone: '+84901234567',
      campaign_id: '1234567890123456789',
      submissions: 1,
    });
    expect(lead.bitrix24_id).toEqual(expect.any(Number));
    expect(lead.score).toBeGreaterThan(50);

    // Rule mặc định: campaign_name CONTAINS 'sale' -> deal ở pipeline 1, stage NEW, 30%.
    const deals = await api('get', '/api/v1/deals?status=open').expect(200);
    expect(deals.body.total).toBe(1);
    expect(deals.body.items[0]).toMatchObject({
      leadId: lead.id,
      pipelineId: '1',
      stage: 'NEW',
      probability: 30,
    });

    const [event] = await db.query(
      `SELECT status, lead_id FROM webhook_events WHERE event_id = 'evt_1234567890'`,
    );
    expect(event).toEqual({ status: 'processed', lead_id: lead.id });
  });

  it('is idempotent for repeated events and deduplicates leads by phone', async () => {
    await sendWebhook(samplePayload)
      .expect(202)
      .expect(({ body }) => expect(body.status).toBe('duplicate'));

    await sendWebhook({
      ...samplePayload,
      event: 'form.complete',
      event_id: 'evt_second_submit',
      lead_data: { phone: '0901 234 567', city: 'Đà Nẵng' },
    }).expect(202);
    const lead = await waitFor(async () => {
      const [row] = await db.query(`SELECT * FROM leads WHERE submissions = 2`);
      return row;
    });
    expect(lead).toMatchObject({
      city: 'Đà Nẵng',
      email: 'nguyenvana@email.com',
      name: 'Nguyễn Văn A',
    });
    expect((await api('get', '/api/v1/leads').expect(200)).body.total).toBe(1);
  });

  it('records user.interaction events without creating leads', async () => {
    await sendWebhook({
      event: 'user.interaction',
      event_id: 'evt_view',
      timestamp: 1,
    })
      .expect(202)
      .expect(({ body }) => expect(body.status).toBe('recorded'));
  });

  it('syncs deal stage from Bitrix24 and reports a TikTok conversion when won', async () => {
    const [deal] = await db.query(`SELECT * FROM deals`);
    await request(app.getHttpServer())
      .post('/webhooks/bitrix24/deals')
      .type('form')
      .send(
        `event=ONCRMDEALUPDATE&data[FIELDS][ID]=${deal.bitrix24_id}&auth[application_token]=wrong`,
      )
      .expect(401);
    await request(app.getHttpServer())
      .post('/webhooks/bitrix24/deals')
      .type('form')
      .send(
        `event=ONCRMDEALUPDATE&data[FIELDS][ID]=${deal.bitrix24_id}&data[FIELDS][STAGE_ID]=C1:WON` +
          `&data[FIELDS][OPPORTUNITY]=8000000&auth[application_token]=${process.env.BITRIX24_APP_TOKEN}`,
      )
      .expect(200, { updated: true, status: 'won' });

    const won = await waitFor(async () => {
      const [row] = await db.query(
        `SELECT * FROM deals WHERE tiktok_synced_at IS NOT NULL`,
      );
      return row;
    });
    expect(won).toMatchObject({
      status: 'won',
      stage: 'WON',
      probability: 100,
      amount: '8000000.00',
    });
  });

  it('requires an API key for management endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/leads').expect(401);
  });

  it('serves analytics and exports', async () => {
    const conversion = await api(
      'get',
      '/api/v1/analytics/conversion-rates?date_range=30d',
    ).expect(200);
    expect(conversion.body).toMatchObject({
      leads: 1,
      deals: 1,
      won: 1,
      lead_to_won_rate: 1,
    });

    await api('put', '/api/v1/config/campaign-spend')
      .send({ campaign_spend: { '1234567890123456789': 2_000_000 } })
      .expect(200);
    const campaigns = await api(
      'get',
      '/api/v1/analytics/campaign-performance?date_range=all',
    ).expect(200);
    expect(campaigns.body[0]).toMatchObject({
      leads: 1,
      revenue: 8_000_000,
      spend: 2_000_000,
      cost_per_lead: 2_000_000,
      roi: 3,
    });

    const dashboard = await api('get', '/api/v1/analytics/dashboard').expect(
      200,
    );
    expect(dashboard.body).toMatchObject({
      leads_total: 1,
      deals_by_status: { won: 1 },
    });

    const csv = await api(
      'get',
      '/api/v1/reports/export?format=csv&date_range=7d',
    ).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('nguyenvana@email.com');

    const json = await api('get', '/api/v1/reports/export?format=json').expect(
      200,
    );
    expect(json.body).toHaveLength(1);
  });

  it('validates and stores configuration', async () => {
    await api('put', '/api/v1/config/rules')
      .send({
        deal_rules: [
          {
            condition: 'name LIKE x',
            action: 'create_deal',
            pipeline_id: '0',
            stage_id: 'NEW',
          },
        ],
      })
      .expect(400);
    await api('put', '/api/v1/config/rules')
      .send({
        deal_rules: [
          {
            condition: 'lead.score >= 80',
            action: 'create_deal',
            pipeline_id: '0',
            stage_id: 'NEW',
          },
        ],
      })
      .expect(200);
    const rules = await api('get', '/api/v1/config/rules').expect(200);
    expect(rules.body.deal_rules[0].condition).toBe('lead.score >= 80');
    await api('get', '/api/v1/config/mappings').expect(200);
  });

  it('sends invalid leads to the dead letter queue', async () => {
    await sendWebhook({
      event: 'lead.generate',
      event_id: 'evt_invalid',
      timestamp: 1,
      lead_data: { email: 'nope' },
    }).expect(202);
    const dead = await waitFor(async () => {
      const res = await api('get', '/api/v1/jobs/dead-letters').expect(200);
      return res.body.length ? res.body : null;
    });
    expect(dead[0]).toMatchObject({
      queue: 'leads',
      data: { eventId: 'evt_invalid' },
    });
    const [event] = await db.query(
      `SELECT status FROM webhook_events WHERE event_id = 'evt_invalid'`,
    );
    expect(event.status).toBe('failed');
  });

  it('imports historical leads through the same pipeline', async () => {
    const res = await api('post', '/api/v1/leads/import')
      .send({
        events: [
          {
            ...samplePayload,
            event_id: 'hist_1',
            lead_data: { full_name: 'Old Lead', email: 'old@example.com' },
          },
        ],
      })
      .expect(202);
    expect(res.body).toEqual({ queued: 1, duplicate: 0, recorded: 0 });
    await waitFor(
      async () =>
        (
          await db.query(
            `SELECT 1 FROM leads WHERE email = 'old@example.com' AND bitrix24_id IS NOT NULL`,
          )
        ).length > 0,
    );
  });
});
