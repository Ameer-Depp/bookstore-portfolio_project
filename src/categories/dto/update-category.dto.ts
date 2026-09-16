import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  // Allows an admin to reactivate a soft-deleted category.
  // Without this, a soft-deleted name would be permanently unusable
  // because the unique constraint on `name` also blocks re-creation.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
