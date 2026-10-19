import dataSource from './data-source';
import { Configuration } from '../settings/configuration.entity';
import {
  CONFIG_KEYS,
  DEFAULT_DEAL_RULES,
  DEFAULT_FIELD_MAPPING,
  DEFAULT_PIPELINE_STAGES,
} from '../settings/defaults';

const CAMPAIGNS = [
  { id: '1234567890123456789', name: 'Spring Sale 2024', spend: 15_000_000 },
  { id: '2234567890123456789', name: 'Brand Awareness Q2', spend: 8_000_000 },
  { id: '3234567890123456789', name: 'Summer Sale 2024', spend: 12_000_000 },
];
const STAGES = ['NEW', 'PREPARATION', 'EXECUTING', 'WON', 'WON', 'LOSE'];

/** Seed cấu hình mặc định + 30 lead/deal mẫu để demo analytics. Chạy lại nhiều lần vẫn an toàn. */
async function seed() {
  await dataSource.initialize();
  await dataSource.runMigrations();

  const configs: Record<string, object> = {
    [CONFIG_KEYS.fieldMapping]: DEFAULT_FIELD_MAPPING,
    [CONFIG_KEYS.dealRules]: DEFAULT_DEAL_RULES,
    [CONFIG_KEYS.pipelineStages]: DEFAULT_PIPELINE_STAGES,
    [CONFIG_KEYS.campaignSpend]: Object.fromEntries(
      CAMPAIGNS.map((c) => [c.id, c.spend]),
    ),
  };
  for (const [key, value] of Object.entries(configs)) {
    await dataSource
      .getRepository(Configuration)
      .createQueryBuilder()
      .insert()
      .values({ key, value })
      .orIgnore()
      .execute();
  }

  for (let i = 1; i <= 30; i++) {
    const campaign = CAMPAIGNS[i % CAMPAIGNS.length];
    const createdAt = new Date(Date.now() - (i % 25) * 86_400_000);
    const [lead] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO leads (external_id, name, email, phone, city, campaign_id, campaign_name, ad_id, ad_name,
                          form_id, score, status, raw_data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Hà Nội', $5, $6, '9876543210987654321', 'Product Demo Video',
               'form_abc123', $7, $8, '{"seed": true}', $9, $9)
       ON CONFLICT (external_id) DO NOTHING
       RETURNING id`,
      [
        `seed_${i}`,
        `Khách hàng mẫu ${i}`,
        `seed${i}@example.com`,
        `+849${String(10000000 + i).padStart(8, '0')}`,
        campaign.id,
        campaign.name,
        40 + ((i * 7) % 60),
        i % 3 === 0 ? 'synced' : 'converted',
        createdAt,
      ],
    );
    if (!lead || i % 3 === 0) continue;

    const stage = STAGES[i % STAGES.length];
    const status = stage === 'WON' ? 'won' : stage === 'LOSE' ? 'lost' : 'open';
    await dataSource.query(
      `INSERT INTO deals (lead_id, title, amount, pipeline_id, stage, probability, status, assigned_to, closed_at, created_at)
       VALUES ($1, $2, $3, '1', $4, $5, $6, $7, $8, $9)`,
      [
        lead.id,
        `TikTok: Khách hàng mẫu ${i}`,
        (5 + (i % 6)) * 1_000_000,
        stage,
        DEFAULT_PIPELINE_STAGES.find((s) => s.id === stage)?.probability ?? 0,
        status,
        String(1 + (i % 3)),
        status === 'open' ? null : createdAt,
        createdAt,
      ],
    );
  }

  console.log('Seed xong: cấu hình mặc định + dữ liệu mẫu.');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
