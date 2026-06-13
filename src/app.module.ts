import { Module } from '@nestjs/common';
import { AppConfigModule } from './core/config/config.module';
import { PrismaModule } from './core/database/prisma.module';
import { RedisModule } from './core/redis/redis.module';
import { HealthModule } from './core/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Root application module.
 *
 * Wires together core infrastructure (config, database, cache, health)
 * and feature modules from `src/modules/*`.
 *
 * AuthModule registers the global JwtAuthGuard, so every route is protected
 * unless explicitly marked `@Public()`.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
