import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../entities/user.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  balance: string;
  isActive: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokensRepo: Repository<PasswordResetToken>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.usersService.create({
      name: dto.name.trim(),
      email,
      passwordHash,
      googleId: null,
      role: UserRole.CUSTOMER,
      balance: '0',
      isActive: true,
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();

    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) {
      // Covers two cases intentionally:
      //  - no such user
      //  - Google-only account (no password set) trying to log in with password
      // Same error for both — do not leak which accounts exist.
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is banned');
    }

    return this.issueTokens(user);
  }

  /**
   * Signs a fresh access + refresh token pair, stores the refresh token's
   * hash on the user, and returns them alongside the sanitized user object.
   */
  private async issueTokens(user: User): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET')!,
      expiresIn: this.config.get<string>(
        'JWT_ACCESS_EXPIRES_IN',
      ) as unknown as number,
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET')!,
      expiresIn: this.config.get<string>(
        'JWT_REFRESH_EXPIRES_IN',
      ) as unknown as number,
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await this.usersService.update(user.id, { refreshTokenHash });

    return {
      accessToken,
      refreshToken,
      user: this.toPublic(user),
    };
  }

  private toPublic(user: User): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      balance: user.balance,
      isActive: user.isActive,
    };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET')!,
      });
    } catch {
      // Covers: bad signature, malformed token, expired token.
      // All produce the same 401 — do not leak which.
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive || !user.refreshTokenHash) {
      // No such user, banned, or user has no active session (already logged out
      // or the hash was rotated away by a newer login). All 401.
      throw new UnauthorizedException('Invalid refresh token');
    }

    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) {
      // Token is signed correctly but does not match the stored hash —
      // e.g. it was rotated out by a newer login. Reject.
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    // Nulling the stored hash invalidates every refresh token ever issued
    // to this user. Access tokens already in flight remain valid until they
    // expire naturally (they are short-lived by design — see Section 13).
    await this.usersService.update(userId, { refreshTokenHash: null });
  }

  /**
   * Issues a password-reset token for the given email.
   *
   * SECURITY: always resolves silently — the caller never learns whether the
   * email corresponds to a real account, whether the account is Google-only,
   * or whether the account is banned. This prevents account enumeration.
   */
  async forgotPassword(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(normalized);

    // Silently no-op for: no such user, banned user, Google-only account
    // (nothing to reset). Same code path as success.
    if (!user || !user.isActive || !user.passwordHash) {
      return;
    }

    const rawToken = randomBytes(32).toString('hex'); // 64-char hex, 256 bits entropy
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.resetTokensRepo.save(
      this.resetTokensRepo.create({
        userId: user.id,
        tokenHash,
        expiresAt,
        usedAt: null,
      }),
    );

    // Section 12 will replace this with a real email send. For now we log
    // the URL so the flow is testable end-to-end locally.
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
    this.logger.log(`Password reset requested for ${user.email}`);
    this.logger.log(`[DEV ONLY] Reset URL: ${resetUrl}`);
    this.logger.log(`[DEV ONLY] Raw token: ${rawToken}`);
  }

  /**
   * Consumes a reset token and sets a new password. On success:
   *   - the token (and every other outstanding token for the user) is marked used
   *   - the user's refresh token chain is invalidated, forcing a fresh login
   *   - access tokens already in flight remain valid until they expire naturally
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const record = await this.resetTokensRepo.findOne({
      where: { tokenHash },
      relations: { user: true },
    });

    const isUsable =
      record &&
      !record.usedAt &&
      record.expiresAt.getTime() > Date.now() &&
      record.user &&
      record.user.isActive;

    if (!isUsable) {
      // Same error for: unknown token, used token, expired token, banned user.
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.usersService.update(record.user.id, {
      passwordHash,
      // Force every existing session to re-authenticate.
      refreshTokenHash: null,
    });

    // Mark this token — and any other unused token for the same user — as used.
    // One query, covers both the "consume current" and "invalidate siblings" cases.
    await this.resetTokensRepo
      .createQueryBuilder()
      .update()
      .set({ usedAt: () => 'now()' })
      .where('userId = :userId', { userId: record.user.id })
      .andWhere('usedAt IS NULL')
      .execute();
  }
}
