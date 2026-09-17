import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService, PaginatedUsers } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { TopUpDto } from './dto/top-up.dto';

interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  balance: string;
  isActive: boolean;
  createdAt: Date;
}

function toPublic(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    balance: user.balance,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ---------- Customer routes (self) ----------

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User): PublicUser {
    return toPublic(user);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    if (dto.name !== undefined) {
      await this.usersService.update(user.id, { name: dto.name.trim() });
    }
    const fresh = await this.usersService.findByIdOrFail(user.id);
    return toPublic(fresh);
  }

  // ---------- Admin routes ----------

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async list(@Query() query: ListUsersQueryDto): Promise<{
    data: PublicUser[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }> {
    const result: PaginatedUsers = await this.usersService.findAll(
      query.page ?? 1,
      query.limit ?? 20,
    );
    return {
      data: result.data.map(toPublic),
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PublicUser> {
    const user = await this.usersService.findByIdOrFail(id);
    return toPublic(user);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<PublicUser> {
    const user = await this.usersService.findByIdOrFail(id);
    if (user.isActive !== dto.isActive) {
      await this.usersService.update(id, { isActive: dto.isActive });
      // When banning, also invalidate the refresh chain so the user
      // can't just silently keep refreshing. Access tokens already in
      // flight will be rejected by JwtAuthGuard on the next request.
      if (!dto.isActive) {
        await this.usersService.update(id, { refreshTokenHash: null });
      }
    }
    const fresh = await this.usersService.findByIdOrFail(id);
    return toPublic(fresh);
  }

  @Post(':id/balance/top-up')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async topUp(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: TopUpDto,
  ): Promise<PublicUser> {
    const user = await this.usersService.topUp(id, dto.amount);
    return toPublic(user);
  }
}
