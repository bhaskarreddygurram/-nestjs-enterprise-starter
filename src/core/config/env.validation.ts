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
});
