import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type WebhookEventStatus =
  'received' | 'processed' | 'recorded' | 'failed';

/** Lưu nguyên văn mọi webhook nhận được để audit/debug và để đảm bảo idempotency. */
@Entity('webhook_events')
@Index('idx_webhook_events_status', ['status'])
@Index('idx_webhook_events_created_at', ['createdAt'])
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', length: 255, unique: true })
  eventId: string;

  @Column({ length: 20 })
  source: 'tiktok' | 'bitrix24';

  @Column({ name: 'event_type', length: 100 })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({ type: 'varchar', length: 20, default: 'received' })
  status: WebhookEventStatus;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
