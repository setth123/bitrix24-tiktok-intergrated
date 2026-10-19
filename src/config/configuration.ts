const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

/** Toàn bộ cấu hình runtime, đọc từ biến môi trường (xem .env.example). */
export const configuration = () => ({
  port: int(process.env.PORT, 3000),
  apiKey: process.env.API_KEY ?? '',
  defaultCountry: process.env.DEFAULT_PHONE_COUNTRY ?? 'VN',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: int(process.env.DB_PORT, 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'tiktok_bitrix',
    migrationsRun: process.env.DB_MIGRATIONS_RUN !== 'false',
    logging: process.env.DB_LOGGING === 'true',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: int(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: int(process.env.REDIS_DB, 0),
  },
  tiktok: {
    webhookSecret: process.env.TIKTOK_WEBHOOK_SECRET ?? '',
    signatureToleranceSec: int(process.env.TIKTOK_SIGNATURE_TOLERANCE_SEC, 300),
    mode: (process.env.TIKTOK_MODE ?? 'mock') as 'mock' | 'live',
    accessToken: process.env.TIKTOK_ACCESS_TOKEN ?? '',
    eventSourceId: process.env.TIKTOK_EVENT_SOURCE_ID ?? '',
  },
  bitrix24: {
    mode: (process.env.BITRIX24_MODE ?? 'mock') as 'mock' | 'live',
    webhookUrl: process.env.BITRIX24_WEBHOOK_URL ?? '',
    appToken: process.env.BITRIX24_APP_TOKEN ?? '',
    defaultAssignee: process.env.BITRIX24_DEFAULT_ASSIGNEE || null,
  },
  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL ?? '',
});

export type AppConfig = ReturnType<typeof configuration>;
