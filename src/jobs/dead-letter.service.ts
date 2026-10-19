import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { NotificationService } from '../common/notification.service';
import { DeadLetterJob, QUEUES } from './queues';

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    @InjectQueue(QUEUES.deadLetter) private readonly dlq: Queue<DeadLetterJob>,
    @InjectQueue(QUEUES.leads) private readonly leadsQueue: Queue,
    @InjectQueue(QUEUES.tiktokSync) private readonly tiktokQueue: Queue,
  ) {}

  /** Lần thử cuối thất bại (hoặc lỗi không thể retry) -> chuyển job vào DLQ. */
  isFinalFailure(job: Job, err: Error): boolean {
    return (
      err.name === 'UnrecoverableError' ||
      job.attemptsMade >= (job.opts.attempts ?? 1)
    );
  }

  async moveToDeadLetter(
    queue: string,
    job: Job,
    err: Error,
    notifications: NotificationService,
  ): Promise<void> {
    await this.dlq.add(job.name, {
      queue,
      name: job.name,
      data: job.data,
      error: err.message,
      failedAt: new Date().toISOString(),
    });
    this.logger.error(`Job ${queue}/${job.id} -> DLQ: ${err.message}`);
    await notifications.notify(
      'job.dead_letter',
      `Job ${queue}/${job.name} thất bại sau ${job.attemptsMade} lần: ${err.message}`,
      { queue, jobId: job.id, data: job.data },
    );
  }

  async list(limit = 50) {
    const jobs = await this.dlq.getJobs(
      ['waiting', 'delayed', 'prioritized'],
      0,
      limit - 1,
    );
    return jobs.map((j) => ({ id: j.id, ...j.data }));
  }

  count(): Promise<number> {
    return this.dlq.count();
  }

  /** Đưa tất cả job trong DLQ trở lại queue gốc. */
  async retryAll(): Promise<{ retried: number }> {
    const jobs = await this.dlq.getJobs(['waiting', 'delayed', 'prioritized']);
    for (const job of jobs) {
      const target =
        job.data.queue === QUEUES.tiktokSync
          ? this.tiktokQueue
          : this.leadsQueue;
      await target.add(job.data.name, job.data.data);
      await job.remove();
    }
    return { retried: jobs.length };
  }
}
