import { Type } from 'class-transformer';
import {
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  // Alphanumeric + dash only: keeps codes URL-safe, casing-stable, and avoids
  // accidental whitespace/unicode issues when copy-pasted.
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'code may only contain letters, numbers, and dashes',
  })
  code: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000) // sanity cap — reject absurd values before they hit the DB
  value: number;
}
