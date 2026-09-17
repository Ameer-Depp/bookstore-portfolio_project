/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

export interface PaginatedUsers {
  data: User[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  /**
   * Throws NotFoundException if the user doesn't exist.
   * Use this in admin routes where "no such user" should be a 404,
   * not a silent null.
   */
  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  create(data: Partial<User>): Promise<User> {
    const user = this.usersRepo.create(data);
    return this.usersRepo.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<void> {
    await this.usersRepo.update(id, data);
  }

  async findAll(page: number, limit: number): Promise<PaginatedUsers> {
    const [data, total] = await this.usersRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Direct admin balance credit. No code, no coupon — this is the
   * spec's "admin issuing a direct top-up" (Section 1).
   *
   * Parameterized raw SQL for the same reason as coupon redemption:
   * decimal arithmetic must happen in the database, not in JS strings.
   */
  async topUp(userId: string, amount: number): Promise<User> {
    const user = await this.findByIdOrFail(userId);

    // Ensure the amount is expressed as a two-decimal string. Passing a
    // JS number to the query risks locale/precision surprises; a string
    // is what Postgres's numeric type expects.
    const amountStr = amount.toFixed(2);

    await this.usersRepo.query(
      'UPDATE users SET balance = balance + $1::numeric WHERE id = $2',
      [amountStr, userId],
    );

    return this.findByIdOrFail(userId);
  }
}
