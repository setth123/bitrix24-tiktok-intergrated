import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Chữ ký webhook: header `TikTok-Signature: t=<unix>,s=<hex>`
 * với s = HMAC-SHA256(secret, `${t}.${rawBody}`). Timestamp chống replay attack.
 */
export function signTiktokPayload(
  rawBody: string | Buffer,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
  return `t=${timestamp},s=${signature}`;
}

export function verifyTiktokSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  toleranceSec: number,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.trim().split('=') as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!parts.s || !Number.isInteger(timestamp)) return false;
  if (Math.abs(nowSec - timestamp) > toleranceSec) return false;

  const expected = Buffer.from(
    signTiktokPayload(rawBody, secret, timestamp).split('s=')[1],
    'hex',
  );
  const actual = Buffer.from(parts.s, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
