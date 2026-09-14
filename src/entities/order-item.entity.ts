import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Book } from './book.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column()
  @Index()
  bookId: string;

  @ManyToOne(() => Book, (book) => book.orderItems)
  @JoinColumn({ name: 'bookId' })
  book: Book;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: string; // price snapshot at time of purchase

  @CreateDateColumn()
  createdAt: Date;

  // No quantity column — see spec Section 1.
}
