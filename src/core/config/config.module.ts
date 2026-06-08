import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { envValidationSchema } from './env.validation';

/**
 * Global configuration module.
 *
 * Wraps `@nestjs/config` with:
 *  - a typed configuration factory (`configuration.ts`)
 *  - boot-time env validation (`env.validation.ts`)
 *
 * Imported once in the root module; `ConfigService` is then available
 * everywhere via dependency injection.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
  ],
})
export class AppConfigModule {}
