/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User } from '../../entities/user.entity';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = User>(
    err: any,
    user: any,
    _info: any,
    _context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    const u = user as User;
    if (!u.isActive) {
      // Distinct from 401 — the caller *is* authenticated, just banned.
      throw new ForbiddenException('Account is banned');
    }
    return u as TUser;
  }
}
