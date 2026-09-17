import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { PaginatedReviews, ReviewResponse } from './review-response';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';

@Controller('books/:bookId/reviews')
export class BookReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  list(
    @Param('bookId', new ParseUUIDPipe()) bookId: string,
    @Query() query: ListReviewsQueryDto,
  ): Promise<PaginatedReviews> {
    return this.reviewsService.listForBook(
      bookId,
      query.page ?? 1,
      query.limit ?? 10,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: User,
    @Param('bookId', new ParseUUIDPipe()) bookId: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResponse> {
    return this.reviewsService.create(user.id, bookId, dto);
  }
}

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateReviewDto,
  ): Promise<ReviewResponse> {
    return this.reviewsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.reviewsService.remove({ id: user.id, role: user.role }, id);
  }
}
