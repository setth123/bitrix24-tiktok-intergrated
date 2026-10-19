import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type LeadStatus = 'new' | 'synced' | 'converted';

@Entity('leads')
@Index('uq_leads_email', ['email'], {
  unique: true,
  where: 'email IS NOT NULL',
})
@Index('uq_leads_phone', ['phone'], {
  unique: true,
  where: 'phone IS NOT NULL',
})
@Index('idx_leads_campaign_id', ['campaignId'])
@Index('idx_leads_status', ['status'])
@Index('idx_leads_created_at', ['createdAt'])
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** event_id của webhook đầu tiên tạo ra lead này. */
  @Column({ name: 'external_id', length: 255, unique: true })
  externalId: string;

  @Column({ length: 50, default: 'tiktok' })
  source: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  /** Số điện thoại chuẩn E.164, ví dụ +84901234567. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  city: string | null;

  @Column({ name: 'campaign_id', type: 'varchar', length: 255, nullable: true })
  campaignId: string | null;

  @Column({
    name: 'campaign_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  campaignName: string | null;

  @Column({ name: 'ad_id', type: 'varchar', length: 255, nullable: true })
  adId: string | null;

  @Column({ name: 'ad_name', type: 'varchar', length: 255, nullable: true })
  adName: string | null;

  @Column({ name: 'form_id', type: 'varchar', length: 255, nullable: true })
  formId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ttclid: string | null;

  /** Điểm chất lượng lead 0-100. */
  @Column({ type: 'int', default: 0 })
  score: number;

  /** Số lần người dùng gửi form (tăng khi bị dedupe). */
  @Column({ type: 'int', default: 1 })
  submissions: number;

  /** Payload gốc của lần submit gần nhất. */
  @Column({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData: Record<string, any> | null;

  @Column({ name: 'bitrix24_id', type: 'int', nullable: true })
  bitrix24Id: number | null;

  @Column({ type: 'varchar', length: 50, default: 'new' })
  status: LeadStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
