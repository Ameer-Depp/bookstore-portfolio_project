import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const buildTypeOrmOptions = (
  config: ConfigService,
): TypeOrmModuleOptions => {
  const useSsl = config.get<string>('DB_SSL') === 'true';

  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST'),
    port: config.get<number>('DB_PORT'),
    username: config.get<string>('DB_USERNAME'),
    password: config.get<string>('DB_PASSWORD'),
    database: config.get<string>('DB_DATABASE'),
    // Neon (and most managed Postgres) require SSL.
    // rejectUnauthorized: false is required because Neon uses a
    // certificate chain that Node doesn't recognise out of the box.
    ...(useSsl && { ssl: { rejectUnauthorized: false } }),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    synchronize: false,
    autoLoadEntities: true,
    logging:
      config.get<string>('NODE_ENV') === 'development'
        ? ['error', 'warn']
        : ['error'],
  };
};
