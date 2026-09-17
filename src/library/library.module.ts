import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from '../entities/order-item.entity';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderItem])],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
