// Biến môi trường cho e2e test. Giá trị có sẵn trong env (CI) được ưu tiên.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  API_KEY: 'test-api-key',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'postgres',
  DB_PASSWORD: 'postgres',
  DB_NAME: 'tiktok_bitrix_test',
  DB_MIGRATIONS_RUN: 'true',
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
  REDIS_DB: '15',
  TIKTOK_WEBHOOK_SECRET: 'test-secret',
  TIKTOK_MODE: 'mock',
  BITRIX24_MODE: 'mock',
  BITRIX24_APP_TOKEN: 'test-bitrix-token',
  BITRIX24_DEFAULT_ASSIGNEE: '1',
  NOTIFY_WEBHOOK_URL: '',
};
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;
