import { Module } from '@nestjs/common';
import { AppConfigModule } from './core/config/config.module';
import { PrismaModule } from './core/database/prisma.module';
import { RedisModule } from './core/redis/redis.module';
import { HealthModule } from './core/health/health.module';

/**
 * Root application module.
 *
 * Wires together core infrastructure (config, database, cache, health).
 * Future phases register feature modules from `src/modules/*` here.
 */
@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule, HealthModule],
})
export class AppModule {}
