import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class TopUpDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount: number;
}
