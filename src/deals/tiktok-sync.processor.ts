import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { NotificationService } from '../common/notification.service';
import { TiktokService } from '../integrations/tiktok.service';
import { DeadLetterService } from '../jobs/dead-letter.service';
import { QUEUES, TiktokSyncJob } from '../jobs/queues';
import { Deal } from './deal.entity';

/** Gửi conversion event (deal won) ngược về TikTok để tối ưu quảng cáo. */
@Processor(QUEUES.tiktokSync)
export class TiktokSyncProcessor extends WorkerHost {
  constructor(
    @InjectRepository(Deal) private readonly deals: Repository<Deal>,
    private readonly tiktok: TiktokService,
    private readonly deadLetters: DeadLetterService,
    private readonly notifications: NotificationService,
  ) {
    super();
  }

  async process(job: Job<TiktokSyncJob>): Promise<void> {
    const deal = await this.deals.findOne({
      where: { id: job.data.dealId },
      relations: { lead: true },
    });
    if (!deal?.lead || deal.tiktokSyncedAt) return;

    await this.tiktok.sendConversion({
      event: 'CompletePayment',
      eventId: `deal_${deal.id}_won`,
      email: deal.lead.email,
      phone: deal.lead.phone,
      ttclid: deal.lead.ttclid,
      value: deal.amount,
      currency: deal.currency,
    });
    await this.deals.update(deal.id, { tiktokSyncedAt: new Date() });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    if (this.deadLetters.isFinalFailure(job, err)) {
      await this.deadLetters.moveToDeadLetter(
        QUEUES.tiktokSync,
        job,
        err,
        this.notifications,
      );
    }
  }
}
