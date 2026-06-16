import * as Joi from 'joi';

/**
 * Validates environment variables at boot time.
 * The app fails fast (and loudly) if configuration is missing or malformed,
 * rather than failing later at runtime in an unexpected place.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  API_PREFIX: Joi.string().default('api'),
  API_VERSION: Joi.string().default('v1'),

  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),

  CORS_ORIGINS: Joi.string().default('*'),

  // Database (PostgreSQL) — consumed by Prisma and the app
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).default(0),

  // JWT access tokens
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),

  // Refresh tokens (opaque, DB-backed, rotated)
  JWT_REFRESH_EXPIRES_IN_DAYS: Joi.number().integer().min(1).default(7),

  // Rate limiting (global default; auth routes are stricter via @Throttle)
  THROTTLE_TTL: Joi.number().integer().min(1000).default(60000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),

  // Postgres container credentials (used by docker-compose; optional for the app)
  POSTGRES_USER: Joi.string().optional(),
  POSTGRES_PASSWORD: Joi.string().optional(),
  POSTGRES_DB: Joi.string().optional(),
  POSTGRES_PORT: Joi.number().port().optional(),
});
