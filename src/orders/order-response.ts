import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';

export interface OrderItemResponse {
  id: string;
  bookId: string;
  unitPrice: string;
  book: {
    id: string;
    title: string;
    isbn: string;
    coverImageUrl: string | null;
  };
  createdAt: Date;
}

export interface OrderResponse {
  id: string;
  userId: string;
  totalAmount: string;
  itemCount: number;
  items: OrderItemResponse[];
  createdAt: Date;
}

export function toOrderResponse(order: Order): OrderResponse {
  const items: OrderItemResponse[] = (order.items ?? []).map(
    (item: OrderItem) => ({
      id: item.id,
      bookId: item.bookId,
      unitPrice: item.unitPrice,
      book: {
        id: item.book.id,
        title: item.book.title,
        isbn: item.book.isbn,
        coverImageUrl: item.book.coverImageUrl,
      },
      createdAt: item.createdAt,
    }),
  );

  return {
    id: order.id,
    userId: order.userId,
    totalAmount: order.totalAmount,
    itemCount: items.length,
    items,
    createdAt: order.createdAt,
  };
}
