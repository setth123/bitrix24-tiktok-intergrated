import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Lead } from '../leads/lead.entity';

export type DealStatus = 'open' | 'won' | 'lost';

@Entity('deals')
@Index('idx_deals_status_assigned', ['status', 'assignedTo'])
@Index('idx_deals_bitrix24_id', ['bitrix24Id'])
export class Deal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Mỗi lead chỉ convert thành tối đa 1 deal. */
  @Column({ name: 'lead_id', type: 'uuid', unique: true })
  leadId: string;

  @ManyToOne(() => Lead, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead?: Lead;

  @Column({ name: 'bitrix24_id', type: 'int', nullable: true })
  bitrix24Id: number | null;

  @Column({ length: 255 })
  title: string;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v?: number | null) => v,
      from: (v?: string | null) => (v == null ? null : Number(v)),
    },
  })
  amount: number | null;

  @Column({ length: 3, default: 'VND' })
  currency: string;

  @Column({ name: 'pipeline_id', type: 'varchar', length: 50, default: '0' })
  pipelineId: string;

  @Column({ type: 'varchar', length: 50 })
  stage: string;

  @Column({ type: 'int', default: 0 })
  probability: number;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: DealStatus;

  /** ID user Bitrix24 phụ trách deal. */
  @Column({ name: 'assigned_to', type: 'varchar', length: 50, nullable: true })
  assignedTo: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'tiktok_synced_at', type: 'timestamptz', nullable: true })
  tiktokSyncedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
