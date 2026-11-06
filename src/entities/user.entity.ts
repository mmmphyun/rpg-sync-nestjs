import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import type { Job } from './job.entity.js';
import type { MagicToken } from './magic-token.entity.js';

@Entity('users')
export class User {
  @PrimaryColumn({ name: 'discord_id', type: 'varchar', length: 32 })
  discordId!: string;

  @Column({ name: 'nickname', type: 'varchar', length: 64 })
  nickname!: string;

  @Column({ name: 'server_role', type: 'varchar', length: 32, default: '유저' })
  serverRole!: string;

  @Column({ name: 'current_job_id', type: 'int', nullable: true })
  currentJobId?: number | null;

  @Column({ name: 'is_guide_completed', type: 'boolean', default: false })
  isGuideCompleted!: boolean;

  @Column({ name: 'minecraft_uuid', type: 'varchar', length: 64, nullable: true })
  minecraftUuid?: string | null;

  @Column({ name: 'minecraft_username', type: 'varchar', length: 64, nullable: true })
  minecraftUsername?: string | null;

  @Column({ name: 'bypass_voice_check', type: 'boolean', default: false })
  bypassVoiceCheck!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne('Job', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_job_id' })
  job?: Job | null;

  @OneToMany('MagicToken', 'user')
  magicTokens?: MagicToken[];
}
