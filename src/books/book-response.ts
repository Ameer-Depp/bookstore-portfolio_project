import { Book } from '../entities/book.entity';

export interface PublicBook {
  id: string;
  title: string;
  description: string;
  isbn: string;
  price: string;
  coverImageUrl: string | null;
  hasPdf: boolean;
  categoryId: string;
  category?: { id: string; name: string };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicBook(book: Book): PublicBook {
  return {
    id: book.id,
    title: book.title,
    description: book.description,
    isbn: book.isbn,
    price: book.price,
    coverImageUrl: book.coverImageUrl,
    // NEVER expose book.fileKey — spec Section 1.
    // Expose only a boolean indicating a PDF is attached.
    hasPdf: book.fileKey !== null,
    categoryId: book.categoryId,
    category: book.category
      ? { id: book.category.id, name: book.category.name }
      : undefined,
    isActive: book.isActive,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}
