import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * SHA-256 hex digest of the raw token. We use SHA-256 (not bcrypt) here
   * because the raw token is already 256 bits of random entropy — slow hashing
   * would only add cost, not security. Deterministic hashing lets us look up
   * directly by the column with a unique index, unlike bcrypt.
   */
  @Column({ type: 'varchar', length: 64 })
  @Index({ unique: true })
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
