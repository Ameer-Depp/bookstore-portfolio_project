import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService, PaginatedOrders } from './orders.service';
import { OrderResponse } from './order-response';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { ListBooksQueryDto } from '../books/dto/list-books-query.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  checkout(@CurrentUser() user: User): Promise<OrderResponse> {
    return this.ordersService.checkout(user.id);
  }

  @Get()
  findAll(
    @CurrentUser() user: User,
    @Query() query: ListBooksQueryDto,
  ): Promise<PaginatedOrders> {
    return this.ordersService.findAll(
      { id: user.id, role: user.role },
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OrderResponse> {
    return this.ordersService.findOneForCustomer(user.id, id, user.role);
  }
}
