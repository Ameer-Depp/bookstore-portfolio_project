import { OrderItem } from '../entities/order-item.entity';

export interface LibraryItem {
  bookId: string;
  title: string;
  isbn: string;
  coverImageUrl: string | null;
  hasPdf: boolean;
  purchasedAt: Date;
  unitPriceAtPurchase: string;
  orderId: string;
}

export interface LibraryResponse {
  data: LibraryItem[];
  count: number;
}

export function toLibraryItems(orderItems: OrderItem[]): LibraryItem[] {
  return orderItems.map((oi) => ({
    bookId: oi.bookId,
    title: oi.book.title,
    isbn: oi.book.isbn,
    coverImageUrl: oi.book.coverImageUrl,
    // Only expose a boolean — never the fileKey itself (spec Section 1).
    hasPdf: oi.book.fileKey !== null,
    purchasedAt: oi.order.createdAt,
    unitPriceAtPurchase: oi.unitPrice,
    orderId: oi.orderId,
  }));
}
