import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { Book } from '../entities/book.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
    @InjectRepository(Book)
    private readonly booksRepo: Repository<Book>,
  ) {}

  /** Public listing — only active categories, alphabetical. */
  findAll(): Promise<Category[]> {
    return this.categoriesRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findByIdOrFail(id: string): Promise<Category> {
    const category = await this.categoriesRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const name = dto.name.trim();

    // Pre-check for a clean 409 instead of letting the raw PG unique
    // constraint error bubble up as a 500.
    const existing = await this.categoriesRepo.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException('Category name is already in use');
    }

    const category = this.categoriesRepo.create({ name, isActive: true });
    return this.categoriesRepo.save(category);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findByIdOrFail(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== category.name) {
        const clash = await this.categoriesRepo.findOne({ where: { name } });
        if (clash) {
          throw new ConflictException('Category name is already in use');
        }
      }
      category.name = name;
    }

    if (dto.isActive !== undefined) {
      category.isActive = dto.isActive;
    }

    return this.categoriesRepo.save(category);
  }

  async softDelete(id: string): Promise<void> {
    const category = await this.findByIdOrFail(id);

    // Spec Section 1: no cascading deletes. Block if any ACTIVE books
    // still reference this category. Soft-deleted books don't block,
    // because they're already invisible to customers.
    const activeBooks = await this.booksRepo.count({
      where: { categoryId: id, isActive: true },
    });
    if (activeBooks > 0) {
      throw new ConflictException(
        `Cannot delete category: ${activeBooks} active book(s) still belong to it`,
      );
    }

    category.isActive = false;
    await this.categoriesRepo.save(category);
  }
}
