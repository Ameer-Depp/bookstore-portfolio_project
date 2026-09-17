import { Review } from '../entities/review.entity';

export interface ReviewResponse {
  id: string;
  bookId: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string };
}

export interface PaginatedReviews {
  data: ReviewResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  averageRating: number | null;
}

export function toReviewResponse(review: Review): ReviewResponse {
  return {
    id: review.id,
    bookId: review.bookId,
    userId: review.userId,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    user: { id: review.user.id, name: review.user.name },
  };
}
