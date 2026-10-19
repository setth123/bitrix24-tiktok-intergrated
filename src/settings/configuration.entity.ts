import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Key-value store cho cấu hình có thể đổi lúc runtime (mapping, rules, ...). */
@Entity('configurations')
export class Configuration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, unique: true })
  key: string;

  @Column({ type: 'jsonb' })
  value: any;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
