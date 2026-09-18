import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { applyRateLimits } from './common/rate-limit.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());

  // Tighten CORS — explicit allow-list from env, comma-separated.
  // Falls back to localhost:3000 (the default frontend dev origin).
  const corsOrigins = (
    config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  applyRateLimits(app);

  // ── Swagger ──
  // Available at /api/v1/docs in every environment. If you want it
  // disabled in production, wrap this block in a `NODE_ENV !== 'production'`
  // check.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Online Bookstore API')
    .setDescription(
      'REST API for a digital bookstore: auth, catalog, cart, checkout, library, reviews.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // keeps the token across page refreshes
    },
  });

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  logger.log(`Application listening on http://localhost:${port}/api/v1`);
  logger.log(`Swagger docs at http://localhost:${port}/api/v1/docs`);
}

bootstrap();
