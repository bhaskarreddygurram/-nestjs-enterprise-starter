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
  upload: {
    dir: string;
    maxSizeBytes: number;
    allowedMimeTypes: string[];
  };
  mail: {
    from: string;
  };
  security: {
    maxLoginAttempts: number;
    lockoutMinutes: number;
    passwordResetTtlMinutes: number;
    appWebUrl: string;
    twoFactorIssuer: string;
    twoFactorChallengeTtl: string;
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
  upload: {
    dir: process.env.UPLOAD_DIR ?? './uploads',
    maxSizeBytes:
      parseInt(process.env.UPLOAD_MAX_SIZE_MB ?? '5', 10) * 1024 * 1024,
    allowedMimeTypes: (
      process.env.UPLOAD_ALLOWED_MIME ??
      'image/png,image/jpeg,image/gif,application/pdf,text/plain'
    )
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  },
  mail: {
    from: process.env.MAIL_FROM ?? 'no-reply@enterprise.local',
  },
  security: {
    maxLoginAttempts: parseInt(
      process.env.SECURITY_MAX_LOGIN_ATTEMPTS ?? '5',
      10,
    ),
    lockoutMinutes: parseInt(process.env.SECURITY_LOCKOUT_MINUTES ?? '15', 10),
    passwordResetTtlMinutes: parseInt(
      process.env.PASSWORD_RESET_TTL_MINUTES ?? '30',
      10,
    ),
    appWebUrl: process.env.APP_WEB_URL ?? 'http://localhost:3000',
    twoFactorIssuer: process.env.TWO_FACTOR_ISSUER ?? 'Enterprise Starter',
    twoFactorChallengeTtl: process.env.TWO_FACTOR_CHALLENGE_TTL ?? '5m',
  },
});
