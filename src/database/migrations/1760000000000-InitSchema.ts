import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1760000000000 implements MigrationInterface {
  name = 'InitSchema1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        external_id VARCHAR(255) NOT NULL UNIQUE,
        source VARCHAR(50) NOT NULL DEFAULT 'tiktok',
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        city VARCHAR(255),
        campaign_id VARCHAR(255),
        campaign_name VARCHAR(255),
        ad_id VARCHAR(255),
        ad_name VARCHAR(255),
        form_id VARCHAR(255),
        ttclid VARCHAR(255),
        score INTEGER NOT NULL DEFAULT 0,
        submissions INTEGER NOT NULL DEFAULT 1,
        raw_data JSONB,
        bitrix24_id INTEGER,
        status VARCHAR(50) NOT NULL DEFAULT 'new',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    // Unique một phần: là "khóa" dedupe theo email/phone và chặn race condition khi 2 job chạy song song.
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_leads_email ON leads (email) WHERE email IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_leads_phone ON leads (phone) WHERE phone IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_leads_campaign_id ON leads (campaign_id)`,
    );
    await queryRunner.query(`CREATE INDEX idx_leads_status ON leads (status)`);
    await queryRunner.query(
      `CREATE INDEX idx_leads_created_at ON leads (created_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE deals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lead_id UUID NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
        bitrix24_id INTEGER,
        title VARCHAR(255) NOT NULL,
        amount DECIMAL(14,2),
        currency VARCHAR(3) NOT NULL DEFAULT 'VND',
        pipeline_id VARCHAR(50) NOT NULL DEFAULT '0',
        stage VARCHAR(50) NOT NULL,
        probability INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        assigned_to VARCHAR(50),
        closed_at TIMESTAMPTZ,
        tiktok_synced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await queryRunner.query(
      `CREATE INDEX idx_deals_status_assigned ON deals (status, assigned_to)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_deals_bitrix24_id ON deals (bitrix24_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id VARCHAR(255) NOT NULL UNIQUE,
        source VARCHAR(20) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'received',
        error TEXT,
        lead_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      )`);
    await queryRunner.query(
      `CREATE INDEX idx_webhook_events_status ON webhook_events (status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_webhook_events_created_at ON webhook_events (created_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE configurations (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL UNIQUE,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE configurations`);
    await queryRunner.query(`DROP TABLE webhook_events`);
    await queryRunner.query(`DROP TABLE deals`);
    await queryRunner.query(`DROP TABLE leads`);
  }
}
