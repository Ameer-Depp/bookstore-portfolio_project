import { IsUUID } from 'class-validator';

export class AddCartItemDto {
  @IsUUID()
  bookId: string;
}
