import {
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  isbn: string;

  // Money input arrives as a number; stored as decimal(10,2) string.
  // @Type coerces string inputs (e.g. "9.99") because global ValidationPipe
  // runs transform: true.
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01) // spec: Book.price must be greater than 0
  price: number;

  @IsUUID()
  categoryId: string;
}
