import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DeadLetterService } from './dead-letter.service';
import { JobsController } from './jobs.controller';
import { DEFAULT_JOB_OPTIONS, QUEUES } from './queues';

const queues = BullModule.registerQueue(
  { name: QUEUES.leads, defaultJobOptions: DEFAULT_JOB_OPTIONS },
  { name: QUEUES.tiktokSync, defaultJobOptions: DEFAULT_JOB_OPTIONS },
  { name: QUEUES.deadLetter },
);

/** Đăng ký queue một chỗ và export cho các module khác dùng. */
@Module({
  imports: [queues],
  controllers: [JobsController],
  providers: [DeadLetterService],
  exports: [queues, DeadLetterService],
})
export class JobsModule {}
