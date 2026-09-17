import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { Book } from '../entities/book.entity';
import { OrderItem } from '../entities/order-item.entity';
import { CartResponse, toCartResponse } from './cart-response';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartsRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemsRepo: Repository<CartItem>,
    @InjectRepository(Book)
    private readonly booksRepo: Repository<Book>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepo: Repository<OrderItem>,
  ) {}

  /**
   * Returns the user's cart with all items and a server-computed total.
   * If the user has never added anything, returns an empty cart shape
   * (id = null) rather than 404 — a cart is a per-user singleton concept.
   */
  async getCart(userId: string): Promise<CartResponse> {
    const cart = await this.cartsRepo.findOne({
      where: { userId },
      relations: { items: { book: true } },
      order: { items: { createdAt: 'DESC' } },
    });
    return toCartResponse(cart);
  }

  async addItem(userId: string, bookId: string): Promise<CartResponse> {
    // 1. Book must exist and be active.
    const book = await this.booksRepo.findOne({
      where: { id: bookId, isActive: true },
    });
    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // 2. Spec Section 6: already-owned books cannot be added to the cart.
    //    This mirrors the checkout guard so the customer gets immediate
    //    feedback rather than being surprised at checkout time.
    const alreadyOwned = await this.orderItemsRepo
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .where('o.userId = :userId', { userId })
      .andWhere('oi.bookId = :bookId', { bookId })
      .getOne();
    if (alreadyOwned) {
      throw new ConflictException('You already own this book');
    }

    // 3. Get-or-create the cart for this user.
    let cart = await this.cartsRepo.findOne({ where: { userId } });
    if (!cart) {
      cart = await this.cartsRepo.save(this.cartsRepo.create({ userId }));
    }

    // 4. Reject if the book is already in the cart.
    const existingItem = await this.cartItemsRepo.findOne({
      where: { cartId: cart.id, bookId },
    });
    if (existingItem) {
      throw new ConflictException('Book is already in your cart');
    }

    // 5. Insert.
    await this.cartItemsRepo.save(
      this.cartItemsRepo.create({ cartId: cart.id, bookId }),
    );

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartResponse> {
    // Scope by the user's cart — if the item belongs to another user,
    // this returns 404, matching the spec's ownership rule (Section 5:
    // "Accessing another customer's order returns 404, not 403").
    const item = await this.cartItemsRepo
      .createQueryBuilder('ci')
      .innerJoin('ci.cart', 'c')
      .where('ci.id = :itemId', { itemId })
      .andWhere('c.userId = :userId', { userId })
      .getOne();

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.cartItemsRepo.delete(item.id);
    return this.getCart(userId);
  }
}
