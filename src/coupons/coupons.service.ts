import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CouponCode } from '../entities/coupon-code.entity';
import { User } from '../entities/user.entity';
import { CreateCouponDto } from './dto/create-coupon.dto';

export interface CouponResponse {
  id: string;
  code: string;
  value: string;
  redeemed: boolean;
  redeemedByUserId: string | null;
  redeemedAt: Date | null;
  createdAt: Date;
}

export interface RedeemResult {
  balance: string;
  credited: string;
  code: string;
}

function toCouponResponse(c: CouponCode): CouponResponse {
  return {
    id: c.id,
    code: c.code,
    value: c.value,
    redeemed: c.redeemed,
    redeemedByUserId: c.redeemedByUserId,
    redeemedAt: c.redeemedAt,
    createdAt: c.createdAt,
  };
}

@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(
    @InjectRepository(CouponCode)
    private readonly couponsRepo: Repository<CouponCode>,
    // DataSource injected directly — the redemption spans two tables
    // (coupon_codes + users) and must be atomic. See spec Section 9.
    private readonly dataSource: DataSource,
  ) {}

  async create(adminId: string, dto: CreateCouponDto): Promise<CouponResponse> {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.couponsRepo.findOne({ where: { code } });
    if (existing) {
      // Even redeemed codes block reuse — the row is permanent (audit).
      throw new ConflictException('Coupon code is already in use');
    }

    const coupon = this.couponsRepo.create({
      code,
      value: dto.value.toFixed(2),
      createdByAdminId: adminId,
      redeemed: false,
      redeemedByUserId: null,
      redeemedAt: null,
    });
    await this.couponsRepo.save(coupon);

    this.logger.log(
      `Coupon ${code} created by admin ${adminId} for value ${coupon.value}`,
    );
    return toCouponResponse(coupon);
  }

  /** Admin listing — useful for auditing. Not required by spec but cheap. */
  async findAll(): Promise<CouponResponse[]> {
    const coupons = await this.couponsRepo.find({
      order: { createdAt: 'DESC' },
    });
    return coupons.map(toCouponResponse);
  }

  /**
   * Atomic coupon redemption.
   *
   * The only way this is safe under concurrency is the conditional UPDATE
   * on `redeemed = false`. Postgres serializes the two concurrent UPDATEs
   * on the same row: exactly one sees `affected = 1`, the other sees 0.
   * No read-then-write anywhere.
   *
   * The balance credit happens in the same transaction, so if it fails
   * the coupon is not marked redeemed (all-or-nothing).
   */
  async redeem(userId: string, rawCode: string): Promise<RedeemResult> {
    const code = rawCode.trim().toUpperCase();

    return this.dataSource.transaction(async (manager) => {
      // STEP 1 — conditional UPDATE, the concurrency guard.
      const result = await manager
        .createQueryBuilder()
        .update(CouponCode)
        .set({
          redeemed: true,
          redeemedByUserId: userId,
          redeemedAt: () => 'now()',
        })
        .where('code = :code AND redeemed = false', { code })
        .execute();

      if (result.affected === 0) {
        // Covers: unknown code, already-redeemed code, and (under race)
        // the loser of two simultaneous redemptions. Same error for all —
        // we don't reveal which case it was.
        throw new BadRequestException('Coupon is invalid or already used');
      }

      // STEP 2 — fetch the coupon for its value. Safe now: we hold the
      // row lock from the UPDATE above until this transaction commits.
      const coupon = await manager.findOneOrFail(CouponCode, {
        where: { code },
      });

      // STEP 3 — credit the user. Parameterized raw SQL because TypeORM's
      // `.set({ balance: () => ... })` builder doesn't bind parameters
      // inside the SQL function. `$1` is the value (a decimal string,
      // which Postgres casts to numeric implicitly).
      await manager.query(
        'UPDATE users SET balance = balance + $1::numeric WHERE id = $2',
        [coupon.value, userId],
      );

      // STEP 4 — return the updated balance.
      const updated = await manager.findOneOrFail(User, {
        where: { id: userId },
      });

      return {
        balance: updated.balance,
        credited: coupon.value,
        code: coupon.code,
      };
    });
  }
}
