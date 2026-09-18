import { INestApplication } from '@nestjs/common';
import rateLimit from 'express-rate-limit';

/**
 * Applies per-route rate limits using express-rate-limit.
 *
 * express-rate-limit works at the Express middleware level, so we attach
 * it in main.ts via app.use() rather than through NestJS guards. This
 * avoids the peer-dependency conflict @nestjs/throttler has with
 * @nestjs/common@12.
 */
export function applyRateLimits(app: INestApplication): void {
  // Auth-sensitive routes — tight limits (per IP).
  const loginLimiter = rateLimit({
    windowMs: 60_000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      statusCode: 429,
      message: 'Too many requests — please try again later',
      error: 'Too Many Requests',
    },
  });

  const registerLimiter = rateLimit({
    windowMs: 60_000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      statusCode: 429,
      message: 'Too many requests — please try again later',
      error: 'Too Many Requests',
    },
  });

  const forgotPasswordLimiter = rateLimit({
    windowMs: 60_000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      statusCode: 429,
      message: 'Too many requests — please try again later',
      error: 'Too Many Requests',
    },
  });

  const googleLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      statusCode: 429,
      message: 'Too many requests — please try again later',
      error: 'Too Many Requests',
    },
  });

  const redeemLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      statusCode: 429,
      message: 'Too many requests — please try again later',
      error: 'Too Many Requests',
    },
  });

  // Global default — 100 req/min per IP on everything else.
  const globalLimiter = rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      statusCode: 429,
      message: 'Too many requests — please try again later',
      error: 'Too Many Requests',
    },
  });

  // Order matters: specific paths BEFORE the global catch-all.
  app.use('/api/v1/auth/login', loginLimiter);
  app.use('/api/v1/auth/register', registerLimiter);
  app.use('/api/v1/auth/forgot-password', forgotPasswordLimiter);
  app.use('/api/v1/auth/google', googleLimiter);
  app.use('/api/v1/coupons/redeem', redeemLimiter);
  app.use('/api/v1', globalLimiter);
}
