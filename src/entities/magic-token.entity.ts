import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { User } from './user.entity.js';

@Entity('magic_tokens')
export class MagicToken {
  @PrimaryColumn({ name: 'token', type: 'varchar', length: 64 })
  token!: string;

  @Column({ name: 'discord_id', type: 'varchar', length: 32 })
  @Index('idx_magic_tokens_discord_id')
  discordId!: string;

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne('User', 'magicTokens', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'discord_id' })
  user?: User;
}
