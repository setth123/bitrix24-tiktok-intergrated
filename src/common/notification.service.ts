import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

/**
 * Gửi thông báo sự kiện quan trọng: luôn ghi log, và POST JSON tới NOTIFY_WEBHOOK_URL
 * (Slack/Teams/Google Chat incoming webhook...) nếu được cấu hình. Không bao giờ throw.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async notify(
    type: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(`[${type}] ${message}`);
    const url = this.config.get('notifyWebhookUrl', { infer: true });
    if (!url) return;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, text: message, data }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) this.logger.warn(`Notify webhook responded ${res.status}`);
    } catch (err) {
      this.logger.warn(`Notify webhook failed: ${String(err)}`);
    }
  }
}
