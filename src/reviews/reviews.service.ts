import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../entities/review.entity';
import { Book } from '../entities/book.entity';
import { OrderItem } from '../entities/order-item.entity';
import { UserRole } from '../entities/user.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import {
  PaginatedReviews,
  ReviewResponse,
  toReviewResponse,
} from './review-response';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewsRepo: Repository<Review>,
    @InjectRepository(Book)
    private readonly booksRepo: Repository<Book>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepo: Repository<OrderItem>,
  ) {}

  async listForBook(
    bookId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedReviews> {
    const book = await this.booksRepo.findOne({
      where: { id: bookId, isActive: true },
    });
    if (!book) throw new NotFoundException('Book not found');

    const qb = this.reviewsRepo
      .createQueryBuilder('review')
      .innerJoinAndSelect('review.user', 'user')
      .where('review.bookId = :bookId', { bookId })
      .orderBy('review.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [reviews, total] = await qb.getManyAndCount();

    const avgResult = await this.reviewsRepo
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'avg')
      .where('review.bookId = :bookId', { bookId })
      .getRawOne<{ avg: string | null }>();

    const averageRating =
      avgResult?.avg !== null && avgResult?.avg !== undefined
        ? Number(Number(avgResult.avg).toFixed(2))
        : null;

    return {
      data: reviews.map(toReviewResponse),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      averageRating,
    };
  }

  async create(
    userId: string,
    bookId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponse> {
    const book = await this.booksRepo.findOne({
      where: { id: bookId, isActive: true },
    });
    if (!book) throw new NotFoundException('Book not found');

    const owns = await this.orderItemsRepo
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .where('o.userId = :userId', { userId })
      .andWhere('oi.bookId = :bookId', { bookId })
      .getOne();
    if (!owns) {
      throw new ForbiddenException(
        'You must purchase this book before reviewing it',
      );
    }

    const existing = await this.reviewsRepo.findOne({
      where: { bookId, userId },
    });
    if (existing)
      throw new ConflictException('You have already reviewed this book');

    const review = this.reviewsRepo.create({
      bookId,
      userId,
      rating: dto.rating,
      comment: dto.comment ?? null,
    });

    try {
      await this.reviewsRepo.save(review);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('You have already reviewed this book');
      }
      throw err;
    }

    return this.loadResponse(review.id);
  }

  async update(
    requestingUserId: string,
    reviewId: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewResponse> {
    const review = await this.reviewsRepo.findOne({
      where: { id: reviewId, userId: requestingUserId },
    });
    if (!review) throw new NotFoundException('Review not found');

    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.comment !== undefined) review.comment = dto.comment;

    await this.reviewsRepo.save(review);
    return this.loadResponse(review.id);
  }

  async remove(
    requestingUser: { id: string; role: UserRole },
    reviewId: string,
  ): Promise<void> {
    const review = await this.reviewsRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');

    const isOwner = review.userId === requestingUser.id;
    const isAdmin = requestingUser.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new NotFoundException('Review not found');
    }

    await this.reviewsRepo.delete(review.id);
  }

  private async loadResponse(reviewId: string): Promise<ReviewResponse> {
    const review = await this.reviewsRepo.findOne({
      where: { id: reviewId },
      relations: { user: true },
    });
    if (!review) throw new NotFoundException('Review not found');
    return toReviewResponse(review);
  }
}
