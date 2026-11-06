import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { User } from './user.entity.js';

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn({ name: 'job_id' })
  jobId!: number;

  @Column({ name: 'name', type: 'varchar', length: 64, unique: true })
  name!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 64 })
  displayName!: string;

  @OneToMany(() => User, (user) => user.job)
  users?: User[];
}
