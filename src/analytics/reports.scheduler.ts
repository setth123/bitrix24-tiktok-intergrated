import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from '../common/notification.service';
import { AnalyticsService } from './analytics.service';

/** Báo cáo định kỳ và cảnh báo tự động, gửi qua NotificationService. */
@Injectable()
export class ReportsScheduler {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async dailyReport() {
    const conv = await this.analytics.conversionRates('1d');
    const campaigns = await this.analytics.campaignPerformance('1d');
    const top = campaigns
      .slice(0, 3)
      .map((c) => `${c.campaign_name ?? c.campaign_id}: ${c.leads} leads`)
      .join('; ');
    await this.notifications.notify(
      'report.daily',
      `Báo cáo 24h: ${conv.leads} leads, ${conv.deals} deals, ${conv.won} won. Top: ${top || '-'}`,
      { conversion: conv, campaigns },
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkAlerts() {
    const stats = await this.analytics.dashboard();
    if (stats.queue.dead_letter > 0) {
      await this.notifications.notify(
        'alert.dead_letter',
        `Có ${stats.queue.dead_letter} job trong dead letter queue cần xử lý`,
      );
    }
    if (stats.queue.waiting > 500) {
      await this.notifications.notify(
        'alert.queue_backlog',
        `Queue leads đang tồn ${stats.queue.waiting} job`,
      );
    }
  }
}
