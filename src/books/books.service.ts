import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Book } from '../entities/book.entity';
import { Category } from '../entities/category.entity';
import { StorageService } from '../storage/storage.service';
import { UploadedFileType } from '../storage/uploaded-file.type';
import { detectImageKind, isPdf } from '../storage/file-validation';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { ListBooksQueryDto } from './dto/list-books-query.dto';
import { OrderItem } from '../entities/order-item.entity';

export interface PaginatedBooks {
  data: Book[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);

  constructor(
    @InjectRepository(Book)
    private readonly booksRepo: Repository<Book>,
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepo: Repository<OrderItem>,
    private readonly storage: StorageService,
  ) {}

  // ---------- Public reads ----------

  async findAll(query: ListBooksQueryDto): Promise<PaginatedBooks> {
    const {
      search,
      categoryId,
      minPrice,
      maxPrice,
      sort = 'createdAt',
      order = 'DESC',
      page = 1,
      limit = 20,
    } = query;

    const qb = this.booksRepo
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.category', 'category')
      .where('book.isActive = :isActive', { isActive: true });

    if (search) {
      qb.andWhere('(book.title ILIKE :search OR book.isbn ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (categoryId) {
      qb.andWhere('book.categoryId = :categoryId', { categoryId });
    }

    // Postgres decimal column compared against a string literal — safe,
    // because toFixed(2) produces a valid numeric literal.
    if (minPrice !== undefined) {
      qb.andWhere('book.price >= :minPrice', { minPrice: minPrice.toFixed(2) });
    }
    if (maxPrice !== undefined) {
      qb.andWhere('book.price <= :maxPrice', { maxPrice: maxPrice.toFixed(2) });
    }

    // sort column is whitelisted by DTO @IsIn, so this is injection-safe.
    qb.orderBy(`book.${sort}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Public detail — returns 404 for soft-deleted books. */
  async findOnePublic(id: string): Promise<Book> {
    const book = await this.booksRepo.findOne({
      where: { id, isActive: true },
      relations: { category: true },
    });
    if (!book) {
      throw new NotFoundException('Book not found');
    }
    return book;
  }

  /** Admin lookup — includes soft-deleted books. */
  async findByIdOrFail(id: string): Promise<Book> {
    const book = await this.booksRepo.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!book) {
      throw new NotFoundException('Book not found');
    }
    return book;
  }

  // ---------- Admin writes ----------

  async create(dto: CreateBookDto): Promise<Book> {
    const isbn = dto.isbn.trim();

    const existing = await this.booksRepo.findOne({ where: { isbn } });
    if (existing) {
      throw new ConflictException('ISBN is already in use');
    }

    await this.assertCategoryExists(dto.categoryId);

    const book = this.booksRepo.create({
      title: dto.title.trim(),
      description: dto.description,
      isbn,
      price: dto.price.toFixed(2),
      categoryId: dto.categoryId,
      isActive: true,
    });
    await this.booksRepo.save(book);
    // Re-fetch with category loaded for a consistent response shape.
    return this.findByIdOrFail(book.id);
  }

  async update(id: string, dto: UpdateBookDto): Promise<Book> {
    const book = await this.findByIdOrFail(id);

    if (dto.isbn !== undefined) {
      const isbn = dto.isbn.trim();
      if (isbn !== book.isbn) {
        const clash = await this.booksRepo.findOne({ where: { isbn } });
        if (clash) {
          throw new ConflictException('ISBN is already in use');
        }
      }
      book.isbn = isbn;
    }

    if (dto.categoryId !== undefined && dto.categoryId !== book.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
      book.categoryId = dto.categoryId;
    }

    if (dto.title !== undefined) book.title = dto.title.trim();
    if (dto.description !== undefined) book.description = dto.description;
    if (dto.price !== undefined) book.price = dto.price.toFixed(2);
    if (dto.isActive !== undefined) book.isActive = dto.isActive;

    await this.booksRepo.save(book);
    return this.findByIdOrFail(id);
  }

  async softDelete(id: string): Promise<void> {
    const book = await this.findByIdOrFail(id);
    book.isActive = false;
    await this.booksRepo.save(book);
  }

  async uploadCover(id: string, file: UploadedFileType): Promise<Book> {
    const book = await this.findByIdOrFail(id);

    const kind = detectImageKind(file.buffer);
    if (!kind) {
      throw new BadRequestException(
        'Cover must be a valid JPEG, PNG, or WebP image',
      );
    }

    const oldKey = book.coverImageUrl
      ? this.storage.keyFromUrl(book.coverImageUrl)
      : null;

    const { url } = await this.storage.uploadCover(file.buffer, kind);
    book.coverImageUrl = url;
    await this.booksRepo.save(book);

    if (oldKey) {
      try {
        await this.storage.deleteObject(oldKey);
      } catch (err) {
        // Best-effort: a failed delete should not fail the upload.
        this.logger.warn(
          `Failed to delete old cover ${oldKey}: ${(err as Error).message}`,
        );
      }
    }

    return this.findByIdOrFail(id);
  }

  async uploadPdf(id: string, file: UploadedFileType): Promise<Book> {
    const book = await this.findByIdOrFail(id);

    if (!isPdf(file.buffer)) {
      throw new BadRequestException('File must be a valid PDF');
    }

    const oldKey = book.fileKey;

    const { key } = await this.storage.uploadPdf(file.buffer);
    book.fileKey = key;
    await this.booksRepo.save(book);

    if (oldKey) {
      try {
        await this.storage.deleteObject(oldKey);
      } catch (err) {
        this.logger.warn(
          `Failed to delete old PDF ${oldKey}: ${(err as Error).message}`,
        );
      }
    }

    return this.findByIdOrFail(id);
  }

  /**
   * Returns a short-lived signed URL for a purchased book's PDF.
   *
   * Order of checks matters:
   *   1. Book exists and is active (404 if not — the book, not the purchase, is what's missing).
   *   2. Book has a PDF attached (409 if not — this is a server-side data problem).
   *   3. Requesting user has an OrderItem for this book (403 if not — the purchase gate).
   *   4. Generate a 5-minute signed URL.
   *
   * The 403 (not 404) for "not purchased" is deliberate: the book exists publicly,
   * so pretending it doesn't would be misleading. What's denied is *download access*.
   */
  async getDownloadUrl(
    bookId: string,
    userId: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const book = await this.findOnePublic(bookId);

    if (!book.fileKey) {
      throw new ConflictException(
        'This book does not have a downloadable file yet',
      );
    }

    const owns = await this.orderItemsRepo
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .where('o.userId = :userId', { userId })
      .andWhere('oi.bookId = :bookId', { bookId })
      .getOne();

    if (!owns) {
      throw new ForbiddenException(
        'You must purchase this book before downloading it',
      );
    }

    const expiresInSeconds = 300; // 5 minutes
    const url = await this.storage.getSignedDownloadUrl(
      book.fileKey,
      expiresInSeconds,
    );
    return { url, expiresInSeconds };
  }

  // ---------- Internal helpers ----------

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.categoriesRepo.findOne({
      where: { id: categoryId, isActive: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }
}
