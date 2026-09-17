import {
  BadRequestException,
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
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BooksService, PaginatedBooks } from './books.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { ListBooksQueryDto } from './dto/list-books-query.dto';
import { toPublicBook, PublicBook } from './book-response';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';

import type { UploadedFileType } from '../storage/uploaded-file.type';

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  // ---------- Public ----------

  @Get()
  async findAll(@Query() query: ListBooksQueryDto): Promise<{
    data: PublicBook[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    const result: PaginatedBooks = await this.booksService.findAll(query);
    return {
      data: result.data.map(toPublicBook),
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    };
  }

  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PublicBook> {
    const book = await this.booksService.findOnePublic(id);
    return toPublicBook(book);
  }

  // ---------- Admin ----------

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateBookDto): Promise<PublicBook> {
    const book = await this.booksService.create(dto);
    return toPublicBook(book);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBookDto,
  ): Promise<PublicBook> {
    const book = await this.booksService.update(id, dto);
    return toPublicBook(book);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.booksService.softDelete(id);
  }

  @Put(':id/cover')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('cover', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  async uploadCover(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: UploadedFileType,
  ): Promise<PublicBook> {
    if (!file) {
      throw new BadRequestException(
        'No file provided — send a multipart field named "cover"',
      );
    }
    const book = await this.booksService.uploadCover(id, file);
    return toPublicBook(book);
  }

  @Put(':id/file')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    }),
  )
  async uploadFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: UploadedFileType,
  ): Promise<PublicBook> {
    if (!file) {
      throw new BadRequestException(
        'No file provided — send a multipart field named "file"',
      );
    }
    const book = await this.booksService.uploadPdf(id, file);
    return toPublicBook(book);
  }

  @Get(':id/download')
  @UseGuards(JwtAuthGuard)
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    return this.booksService.getDownloadUrl(id, user.id);
  }
}
