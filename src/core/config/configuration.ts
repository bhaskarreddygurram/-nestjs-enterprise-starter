/**
 * Typed application configuration.
 *
 * Loaded once via `@nestjs/config` and accessed through `ConfigService`
 * using dot-notation keys (e.g. `config.get('api.prefix')`).
 * Raw `process.env` access is intentionally confined to this file.
 */
export interface AppConfig {
  env: string;
  port: number;
  api: {
    prefix: string;
    version: string;
  };
  swagger: {
    enabled: boolean;
  };
  cors: {
    origins: string;
  };
  database: {
    url: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshExpiresInDays: number;
  };
  throttle: {
    ttl: number;
    limit: number;
  };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  api: {
    prefix: process.env.API_PREFIX ?? 'api',
    version: process.env.API_VERSION ?? 'v1',
  },
  swagger: {
    enabled: (process.env.SWAGGER_ENABLED ?? 'true') === 'true',
  },
  cors: {
    origins: process.env.CORS_ORIGINS ?? '*',
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresInDays: parseInt(
      process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? '7',
      10,
    ),
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
});
