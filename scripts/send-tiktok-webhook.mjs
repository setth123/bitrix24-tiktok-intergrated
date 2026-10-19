#!/usr/bin/env node
/**
 * Mock TikTok: ký payload bằng HMAC-SHA256 và gửi tới webhook endpoint.
 *
 *   node scripts/send-tiktok-webhook.mjs                 # gửi sample-payload.json (event_id ngẫu nhiên)
 *   node scripts/send-tiktok-webhook.mjs --count 20      # gửi 20 lead ngẫu nhiên
 *   node scripts/send-tiktok-webhook.mjs --file x.json   # gửi payload tùy ý (giữ nguyên event_id)
 *   node scripts/send-tiktok-webhook.mjs --bad-signature # kiểm tra webhook từ chối chữ ký sai
 *
 * Biến môi trường: WEBHOOK_URL (mặc định http://localhost:3000/webhooks/tiktok/leads),
 * TIKTOK_WEBHOOK_SECRET (mặc định đọc từ .env).
 */
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';

const env = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const url = process.env.WEBHOOK_URL ?? 'http://localhost:3000/webhooks/tiktok/leads';
const secret = process.env.TIKTOK_WEBHOOK_SECRET ?? env.TIKTOK_WEBHOOK_SECRET ?? 'change-me-tiktok-secret';

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '1' },
    file: { type: 'string' },
    'bad-signature': { type: 'boolean', default: false },
  },
});

const sample = JSON.parse(
  readFileSync(new URL('./sample-payload.json', import.meta.url), 'utf8'),
);
const CAMPAIGNS = [
  ['1234567890123456789', 'Spring Sale 2024'],
  ['2234567890123456789', 'Brand Awareness Q2'],
  ['3234567890123456789', 'Summer Sale 2024'],
];
const NAMES = ['Nguyễn Văn A', 'Trần Thị B', 'Lê Văn C', 'Phạm Thị D', 'Hoàng Văn E'];

function randomPayload(i) {
  const [campaign_id, campaign_name] = CAMPAIGNS[i % CAMPAIGNS.length];
  const n = Math.floor(Math.random() * 1e7);
  return {
    ...sample,
    event_id: `evt_${randomUUID()}`,
    timestamp: Math.floor(Date.now() / 1000),
    campaign: { ...sample.campaign, campaign_id, campaign_name },
    lead_data: {
      ...sample.lead_data,
      full_name: NAMES[i % NAMES.length],
      email: `lead${n}@example.com`,
      phone: `09${String(n).padStart(8, '0')}`, // số nội địa -> sẽ được chuẩn hóa thành +84...
      ttclid: `TT-${n}`,
    },
  };
}

function sign(body) {
  const t = Math.floor(Date.now() / 1000);
  const s = createHmac('sha256', values['bad-signature'] ? 'wrong-secret' : secret)
    .update(`${t}.${body}`)
    .digest('hex');
  return `t=${t},s=${s}`;
}

const payloads = values.file
  ? [JSON.parse(readFileSync(values.file, 'utf8'))]
  : Number(values.count) === 1
    ? [{ ...sample, event_id: `evt_${randomUUID()}`, timestamp: Math.floor(Date.now() / 1000) }]
    : Array.from({ length: Number(values.count) }, (_, i) => randomPayload(i));

for (const payload of payloads) {
  const body = JSON.stringify(payload);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'TikTok-Signature': sign(body) },
    body,
  });
  console.log(res.status, await res.text());
}
