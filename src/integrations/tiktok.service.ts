import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { AppConfig } from '../config/configuration';

const EVENTS_API_URL =
  'https://business-api.tiktok.com/open_api/v1.3/event/track/';

export interface ConversionEvent {
  /** Tên event chuẩn TikTok, ví dụ CompletePayment. */
  event: string;
  /** Dùng để TikTok dedupe khi gửi lại. */
  eventId: string;
  email?: string | null;
  phone?: string | null;
  ttclid?: string | null;
  value?: number | null;
  currency?: string;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Đẩy conversion event ngược về TikTok (Events API). TIKTOK_MODE=mock chỉ ghi log. */
@Injectable()
export class TiktokService {
  private readonly logger = new Logger(TiktokService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  buildPayload(evt: ConversionEvent) {
    const { eventSourceId } = this.config.get('tiktok', { infer: true });
    return {
      event_source: 'crm',
      event_source_id: eventSourceId,
      data: [
        {
          event: evt.event,
          event_id: evt.eventId,
          event_time: Math.floor(Date.now() / 1000),
          user: {
            // TikTok yêu cầu hash SHA-256 cho PII.
            email: evt.email
              ? sha256(evt.email.trim().toLowerCase())
              : undefined,
            phone: evt.phone ? sha256(evt.phone) : undefined,
            ttclid: evt.ttclid ?? undefined,
          },
          properties: {
            value: evt.value ?? 0,
            currency: evt.currency ?? 'VND',
          },
        },
      ],
    };
  }

  async sendConversion(evt: ConversionEvent): Promise<void> {
    const { mode, accessToken } = this.config.get('tiktok', { infer: true });
    const payload = this.buildPayload(evt);
    if (mode !== 'live') {
      this.logger.log(`[mock] conversion event ${JSON.stringify(payload)}`);
      return;
    }
    const res = await fetch(EVENTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': accessToken,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
    };
    if (!res.ok || body.code !== 0) {
      // Throw để BullMQ retry.
      throw new Error(
        `TikTok Events API error: ${res.status} ${body.message ?? ''}`,
      );
    }
  }
}
