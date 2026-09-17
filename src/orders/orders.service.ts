import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { User, UserRole } from '../entities/user.entity';
import { InsufficientBalanceException } from './errors/insufficient-balance.exception';
import { OrderResponse, toOrderResponse } from './order-response';

export interface PaginatedOrders {
  data: OrderResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    // DataSource injected directly — checkout spans carts, cart_items,
    // orders, order_items, and users. All-or-nothing, per spec Section 9.
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Atomic checkout. See spec Section 9 for the reference implementation.
   *
   * Steps, all inside one transaction:
   *   1. Load the cart with items + books; 400 if empty.
   *   2. Reject if any book is already owned by this user.
   *   3. Compute total from CURRENT book prices (never a cached price).
   *   4. Load the user; 402 if balance < total.
   *   5. Deduct balance, create Order, create OrderItems (price snapshot),
   *      clear cart items.
   *   6. Return the created order.
   *
   * The confirmation email is sent AFTER commit, best-effort. Section 12
   * wires the real mailer; for now it's a log line.
   */
  async checkout(userId: string): Promise<OrderResponse> {
    const order = await this.dataSource.transaction(async (manager) => {
      // ────────────────────────────────────────────────────────────────
      // STEP 0 — serialize per-user checkouts.
      //
      // Lock the user row FOR UPDATE. Under Postgres's default READ
      // COMMITTED isolation, this makes a second concurrent checkout for
      // the SAME user block until the first commits. When it unblocks,
      // its subsequent reads (cart, already-owned, balance) all see the
      // post-commit state — which is an empty cart, so it throws
      // "Cart is empty" instead of processing a second order.
      //
      // Without this lock, two concurrent checkouts both pass the
      // already-owned and balance checks, and both create orders.
      // ────────────────────────────────────────────────────────────────
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // STEP 1 — load cart (now guaranteed fresh, thanks to the lock)
      const cart = await manager.findOne(Cart, {
        where: { userId },
        relations: { items: { book: true } },
      });

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      const bookIds = cart.items.map((i) => i.bookId);

      // STEP 2 — already-owned check
      const alreadyOwned = await manager
        .createQueryBuilder(OrderItem, 'oi')
        .innerJoin('oi.order', 'o')
        .where('o.userId = :userId', { userId })
        .andWhere('oi.bookId IN (:...bookIds)', { bookIds })
        .getMany();

      if (alreadyOwned.length > 0) {
        throw new ConflictException(
          'One or more books in your cart are already owned',
        );
      }

      // STEP 3 — server-side total from CURRENT prices
      const total = cart.items.reduce(
        (sum, item) => sum + Number(item.book.price),
        0,
      );
      const totalStr = total.toFixed(2);

      // STEP 4 — balance check (user object was locked in STEP 0,
      // so its `balance` is the post-lock value)
      if (Number(user.balance) < total) {
        throw new InsufficientBalanceException(totalStr, user.balance);
      }

      // STEP 5a — deduct balance
      await manager.query(
        'UPDATE users SET balance = balance - $1::numeric WHERE id = $2',
        [totalStr, userId],
      );

      // STEP 5b — create order
      const newOrder = manager.create(Order, {
        userId,
        totalAmount: totalStr,
      });
      await manager.save(newOrder);

      // STEP 5c — create order items with price snapshots
      const orderItems = cart.items.map((item) =>
        manager.create(OrderItem, {
          orderId: newOrder.id,
          bookId: item.bookId,
          unitPrice: item.book.price,
        }),
      );
      await manager.save(orderItems);

      // STEP 5d — clear the cart
      await manager.delete(CartItem, { cartId: cart.id });

      return newOrder;
    });

    this.logger.log(
      `Order ${order.id} placed by user ${userId} for ${order.totalAmount}`,
    );

    return this.findOneForCustomer(userId, order.id, UserRole.CUSTOMER);
  }

  /**
   * Listing for both roles:
   *  - Customer: own orders only.
   *  - Admin: every order.
   */
  async findAll(
    requestingUser: { id: string; role: UserRole },
    page: number,
    limit: number,
  ): Promise<PaginatedOrders> {
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('item.book', 'book');

    if (requestingUser.role !== UserRole.ADMIN) {
      qb.where('order.userId = :userId', { userId: requestingUser.id });
    }

    qb.orderBy('order.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [orders, total] = await qb.getManyAndCount();
    return {
      data: orders.map(toOrderResponse),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Single-order view.
   *
   * Customers can only see their own orders — any other ID returns 404
   * (not 403) to avoid confirming the resource exists (spec Section 5).
   * Admins can view any order.
   */
  async findOneForCustomer(
    requestingUserId: string,
    orderId: string,
    role: UserRole,
  ): Promise<OrderResponse> {
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('item.book', 'book')
      .where('order.id = :orderId', { orderId });

    if (role !== UserRole.ADMIN) {
      qb.andWhere('order.userId = :userId', { userId: requestingUserId });
    }

    const order = await qb.getOne();
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return toOrderResponse(order);
  }
}
