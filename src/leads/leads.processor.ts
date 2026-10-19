import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationService } from '../common/notification.service';
import { DeadLetterService } from '../jobs/dead-letter.service';
import { LeadJob, QUEUES } from '../jobs/queues';
import { LeadProcessorService } from './lead-processor.service';

@Processor(QUEUES.leads, { concurrency: 5 })
export class LeadsProcessor extends WorkerHost {
  constructor(
    private readonly processor: LeadProcessorService,
    private readonly deadLetters: DeadLetterService,
    private readonly notifications: NotificationService,
  ) {
    super();
  }

  process(job: Job<LeadJob>) {
    return this.processor.process(job.data.eventId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<LeadJob>, err: Error) {
    if (!this.deadLetters.isFinalFailure(job, err)) return;
    await this.processor.markFailed(job.data.eventId, err.message);
    await this.deadLetters.moveToDeadLetter(
      QUEUES.leads,
      job,
      err,
      this.notifications,
    );
  }
}
