import type { JobsOptions } from 'bullmq';

export const QUEUES = {
  leads: 'leads',
  tiktokSync: 'tiktok-sync',
  deadLetter: 'dead-letter',
} as const;

/** Retry 5 lần với exponential backoff (2s, 4s, 8s, ...), hết lượt thì chuyển vào DLQ. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export interface LeadJob {
  eventId: string;
}

export interface TiktokSyncJob {
  dealId: string;
}

export interface DeadLetterJob {
  queue: string;
  name: string;
  data: unknown;
  error: string;
  failedAt: string;
}

/** BullMQ không cho phép ':' trong custom job id. */
export const toJobId = (id: string) => id.replace(/:/g, '_');
