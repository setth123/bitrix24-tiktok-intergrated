import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { compact } from '../common/object-path';
import { LeadJob, QUEUES, toJobId } from '../jobs/queues';
import { ListLeadsDto } from './dto/list-leads.dto';
import { TiktokWebhookDto } from './dto/tiktok-webhook.dto';
import { Lead, LeadStatus } from './lead.entity';
import { WebhookEvent } from './webhook-event.entity';

/** Các event chứa dữ liệu lead cần xử lý; event khác (user.interaction...) chỉ lưu để audit. */
export const LEAD_EVENTS = new Set([
  'lead.generate',
  'lead.submit',
  'form.complete',
]);

export type IngestStatus = 'queued' | 'duplicate' | 'recorded';

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(WebhookEvent)
    private readonly events: Repository<WebhookEvent>,
    @InjectQueue(QUEUES.leads) private readonly queue: Queue<LeadJob>,
  ) {}

  /**
   * Lưu raw event (idempotent theo event_id) rồi đẩy vào queue để xử lý bất đồng bộ,
   * giúp webhook trả về nhanh và không mất dữ liệu khi Bitrix24 chậm/lỗi.
   */
  async ingest(
    dto: TiktokWebhookDto,
    raw: Record<string, any>,
  ): Promise<IngestStatus> {
    const isLead = LEAD_EVENTS.has(dto.event);
    const inserted = await this.events
      .createQueryBuilder()
      .insert()
      .values({
        eventId: dto.event_id,
        source: 'tiktok',
        eventType: dto.event,
        payload: raw,
        status: isLead ? 'received' : 'recorded',
      })
      .orIgnore()
      .execute();

    if ((inserted.raw as unknown[]).length === 0) {
      // Đã nhận event này. Nếu lần trước chưa kịp vào queue (VD Redis lỗi) thì enqueue lại.
      const existing = await this.events.findOneBy({ eventId: dto.event_id });
      if (existing?.status !== 'received') return 'duplicate';
    }
    if (!isLead) return 'recorded';

    // jobId = event_id: BullMQ tự bỏ qua job trùng.
    await this.queue.add(
      'process',
      { eventId: dto.event_id },
      { jobId: toJobId(dto.event_id) },
    );
    return 'queued';
  }

  /** Batch import dữ liệu lịch sử (cùng pipeline với webhook). */
  async importHistorical(events: TiktokWebhookDto[]) {
    const summary: Record<IngestStatus, number> = {
      queued: 0,
      duplicate: 0,
      recorded: 0,
    };
    for (const event of events) {
      summary[await this.ingest(event, { ...event, imported: true })]++;
    }
    return summary;
  }

  async list(query: ListLeadsDto) {
    const [items, total] = await this.leads.findAndCount({
      where: compact({
        source: query.source,
        status: query.status as LeadStatus | undefined,
        campaignId: query.campaign_id,
      }),
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items, total, page: query.page, limit: query.limit };
  }
}
