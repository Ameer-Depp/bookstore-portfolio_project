import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from './category.entity';
import { CartItem } from './cart-item.entity';
import { OrderItem } from './order-item.entity';
import { Review } from './review.entity';

@Entity('books')
export class Book {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column({ unique: true })
  isbn: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: string;

  @Column({ type: 'varchar', nullable: true })
  coverImageUrl: string | null; // public S3 URL

  @Column({ type: 'varchar', nullable: true })
  fileKey: string | null; // private S3 key — never returned to clients directly

  @Column()
  categoryId: string;

  @ManyToOne(() => Category, (category) => category.books)
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column({ default: true })
  @Index()
  isActive: boolean;

  @OneToMany(() => CartItem, (item) => item.book)
  cartItems: CartItem[];

  @OneToMany(() => OrderItem, (item) => item.book)
  orderItems: OrderItem[];

  @OneToMany(() => Review, (review) => review.book)
  reviews: Review[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
