import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { CartResponse } from './cart-response';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: User): Promise<CartResponse> {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  addItem(
    @CurrentUser() user: User,
    @Body() dto: AddCartItemDto,
  ): Promise<CartResponse> {
    return this.cartService.addItem(user.id, dto.bookId);
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.OK)
  removeItem(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CartResponse> {
    return this.cartService.removeItem(user.id, id);
  }
}
