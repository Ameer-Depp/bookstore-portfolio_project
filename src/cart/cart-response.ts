import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';

export interface CartItemResponse {
  id: string;
  bookId: string;
  book: {
    id: string;
    title: string;
    isbn: string;
    price: string;
    coverImageUrl: string | null;
    hasPdf: boolean;
  };
  addedAt: Date;
}

export interface CartResponse {
  id: string | null;
  items: CartItemResponse[];
  itemCount: number;
  total: string;
}

/**
 * `total` is computed with explicit Number() conversion because Postgres
 * decimal columns return as strings via the pg driver (spec Section 1).
 * Never do arithmetic on `book.price` directly.
 */
export function toCartResponse(cart: Cart | null): CartResponse {
  if (!cart || cart.items.length === 0) {
    return {
      id: cart?.id ?? null,
      items: [],
      itemCount: 0,
      total: '0.00',
    };
  }

  const items: CartItemResponse[] = cart.items.map((item: CartItem) => ({
    id: item.id,
    bookId: item.bookId,
    book: {
      id: item.book.id,
      title: item.book.title,
      isbn: item.book.isbn,
      price: item.book.price,
      coverImageUrl: item.book.coverImageUrl,
      hasPdf: item.book.fileKey !== null,
    },
    addedAt: item.createdAt,
  }));

  const total = cart.items.reduce(
    (sum, item) => sum + Number(item.book.price),
    0,
  );

  return {
    id: cart.id,
    items,
    itemCount: items.length,
    total: total.toFixed(2),
  };
}
