import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { CacheService } from '../common/cache.service';
import { DeadLetterService } from '../jobs/dead-letter.service';
import { QUEUES } from '../jobs/queues';
import { SettingsService } from '../settings/settings.service';
import { parseDateRange, ratio } from './report-utils';

const CACHE_TTL_SEC = 60;

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(QUEUES.leads) private readonly leadsQueue: Queue,
    private readonly deadLetters: DeadLetterService,
    private readonly settings: SettingsService,
    private readonly cache: CacheService,
  ) {}

  /** Funnel TikTok lead -> deal -> won (theo lead tạo trong khoảng thời gian). */
  conversionRates(range = '30d') {
    const since = parseDateRange(range);
    return this.cache.getOrSet(
      `analytics:conversion:${range}`,
      CACHE_TTL_SEC,
      async () => {
        const [row] = await this.db.query<Record<string, string>[]>(
          `SELECT COUNT(l.id)                                   AS leads,
                COUNT(d.id)                                   AS deals,
                COUNT(d.id) FILTER (WHERE d.status = 'won')   AS won,
                COUNT(d.id) FILTER (WHERE d.status = 'lost')  AS lost
           FROM leads l LEFT JOIN deals d ON d.lead_id = l.id
          WHERE l.created_at >= $1`,
          [since],
        );
        const [leads, deals, won, lost] = [
          row.leads,
          row.deals,
          row.won,
          row.lost,
        ].map(Number);
        return {
          date_range: range,
          leads,
          deals,
          won,
          lost,
          lead_to_deal_rate: ratio(deals, leads),
          deal_win_rate: ratio(won, won + lost),
          lead_to_won_rate: ratio(won, leads),
        };
      },
    );
  }

  /** Hiệu quả từng campaign: số lead, chất lượng, doanh thu, cost per lead, ROI. */
  campaignPerformance(range = '30d') {
    const since = parseDateRange(range);
    return this.cache.getOrSet(
      `analytics:campaigns:${range}`,
      CACHE_TTL_SEC,
      async () => {
        const [rows, spend] = await Promise.all([
          this.db.query<Record<string, string | null>[]>(
            `SELECT l.campaign_id,
                  MAX(l.campaign_name)                                         AS campaign_name,
                  COUNT(l.id)                                                  AS leads,
                  ROUND(AVG(l.score), 1)                                       AS avg_score,
                  COUNT(d.id)                                                  AS deals,
                  COUNT(d.id) FILTER (WHERE d.status = 'won')                  AS won,
                  COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'won'), 0)   AS revenue
             FROM leads l LEFT JOIN deals d ON d.lead_id = l.id
            WHERE l.created_at >= $1
            GROUP BY l.campaign_id
            ORDER BY leads DESC`,
            [since],
          ),
          this.settings.getCampaignSpend(),
        ]);
        return rows.map((r) => {
          const leads = Number(r.leads);
          const revenue = Number(r.revenue);
          const cost = r.campaign_id ? (spend[r.campaign_id] ?? null) : null;
          return {
            campaign_id: r.campaign_id,
            campaign_name: r.campaign_name,
            leads,
            avg_score: Number(r.avg_score),
            deals: Number(r.deals),
            won: Number(r.won),
            conversion_rate: ratio(Number(r.won), leads),
            revenue,
            spend: cost,
            cost_per_lead:
              cost !== null && leads > 0 ? Math.round(cost / leads) : null,
            roi: cost ? ratio(revenue - cost, cost) : null,
          };
        });
      },
    );
  }

  /** Số liệu real-time cho dashboard (không cache). */
  async dashboard() {
    const [[stats], byStatus, queue, deadLetters] = await Promise.all([
      this.db.query<Record<string, string>[]>(
        `SELECT COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW()))  AS leads_today,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS leads_24h,
                COUNT(*)                                                        AS leads_total,
                COALESCE(ROUND(AVG(score), 1), 0)                               AS avg_score
           FROM leads`,
      ),
      this.db.query<{ status: string; count: string }[]>(
        `SELECT status, COUNT(*) AS count FROM deals GROUP BY status`,
      ),
      this.leadsQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      this.deadLetters.count(),
    ]);
    return {
      leads_today: Number(stats.leads_today),
      leads_last_24h: Number(stats.leads_24h),
      leads_total: Number(stats.leads_total),
      avg_lead_score: Number(stats.avg_score),
      deals_by_status: Object.fromEntries(
        byStatus.map((r) => [r.status, Number(r.count)]),
      ),
      queue: {
        waiting: queue.waiting ?? 0,
        active: queue.active ?? 0,
        delayed: queue.delayed ?? 0,
        failed: queue.failed ?? 0,
        dead_letter: deadLetters,
      },
      generated_at: new Date().toISOString(),
    };
  }

  /** Dữ liệu lead (kèm deal) cho export. */
  exportLeads(range = '30d') {
    return this.db.query<Record<string, unknown>[]>(
      `SELECT l.id, l.name, l.email, l.phone, l.city, l.campaign_id, l.campaign_name, l.ad_id,
              l.ad_name, l.form_id, l.score, l.submissions, l.status, l.bitrix24_id,
              d.bitrix24_id AS deal_bitrix24_id, d.stage AS deal_stage, d.status AS deal_status,
              d.amount AS deal_amount, d.assigned_to AS deal_assigned_to, l.created_at
         FROM leads l LEFT JOIN deals d ON d.lead_id = l.id
        WHERE l.created_at >= $1
        ORDER BY l.created_at DESC`,
      [parseDateRange(range)],
    );
  }
}
