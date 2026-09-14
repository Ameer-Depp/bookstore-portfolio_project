import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('coupon_codes')
export class CouponCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value: string;

  @Column()
  createdByAdminId: string;

  @ManyToOne(() => User, (user) => user.createdCoupons)
  @JoinColumn({ name: 'createdByAdminId' })
  createdByAdmin: User;

  @Column({ default: false })
  redeemed: boolean;

  @Column({ type: 'varchar', nullable: true })
  redeemedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'redeemedByUserId' })
  redeemedByUser: User | null;

  @Column({ type: 'timestamp', nullable: true })
  redeemedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  // Never deleted on redemption — see spec Section 1.
}
