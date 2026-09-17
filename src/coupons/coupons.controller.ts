import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CouponsService,
  CouponResponse,
  RedeemResult,
} from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { RedeemCouponDto } from './dto/redeem-coupon.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../entities/user.entity';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  // ---------- Admin ----------

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() admin: User,
    @Body() dto: CreateCouponDto,
  ): Promise<CouponResponse> {
    return this.couponsService.create(admin.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(): Promise<CouponResponse[]> {
    return this.couponsService.findAll();
  }

  // ---------- Customer ----------

  @Post('redeem')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  redeem(
    @CurrentUser() user: User,
    @Body() dto: RedeemCouponDto,
  ): Promise<RedeemResult> {
    return this.couponsService.redeem(user.id, dto.code);
  }
}
