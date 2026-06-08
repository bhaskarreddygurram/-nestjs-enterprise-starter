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
});
