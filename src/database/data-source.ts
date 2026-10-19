import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { DataSource, DataSourceOptions } from 'typeorm';
import { configuration } from '../config/configuration';
import { Deal } from '../deals/deal.entity';
import { Lead } from '../leads/lead.entity';
import { WebhookEvent } from '../leads/webhook-event.entity';
import { Configuration } from '../settings/configuration.entity';

/** Dùng chung cho Nest (TypeOrmModule) và TypeORM CLI (migration). */
export function buildDataSourceOptions(): DataSourceOptions {
  const { db } = configuration();
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.database,
    entities: [Lead, WebhookEvent, Deal, Configuration],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsRun: db.migrationsRun,
    synchronize: false,
    logging: db.logging,
  };
}

/** Nạp .env cho các script chạy ngoài Nest (TypeORM CLI, seed). Không ghi đè biến đã có. */
export function loadDotEnv(file = '.env'): void {
  if (!existsSync(file)) return;
  for (const [key, value] of Object.entries(
    parseEnv(readFileSync(file, 'utf8')),
  )) {
    process.env[key] ??= value;
  }
}

loadDotEnv();

export default new DataSource(buildDataSourceOptions());
