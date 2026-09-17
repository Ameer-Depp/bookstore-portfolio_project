import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderItem } from '../entities/order-item.entity';
import { LibraryResponse, toLibraryItems } from './library-response';

@Injectable()
export class LibraryService {
  constructor(
    @InjectRepository(OrderItem)
    private readonly orderItemsRepo: Repository<OrderItem>,
  ) {}

  /**
   * Returns every book the user has purchased, newest purchase first.
   *
   * Derived entirely from OrderItem rows — there is no `library` table
   * (spec Section 1: the library is "a permanent collection derived from
   * purchased books").
   */
  async getLibrary(userId: string): Promise<LibraryResponse> {
    const orderItems = await this.orderItemsRepo
      .createQueryBuilder('oi')
      .innerJoinAndSelect('oi.order', 'o')
      .innerJoinAndSelect('oi.book', 'book')
      .where('o.userId = :userId', { userId })
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('oi.createdAt', 'DESC')
      .getMany();

    const data = toLibraryItems(orderItems);
    return { data, count: data.length };
  }
}
