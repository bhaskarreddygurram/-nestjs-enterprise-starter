import { Module } from '@nestjs/common';
import { AppConfigModule } from './core/config/config.module';
import { HealthModule } from './core/health/health.module';

/**
 * Root application module.
 *
 * Wires together core infrastructure (config, health) for Phase 0.
 * Future phases register feature modules from `src/modules/*` here.
 */
@Module({
  imports: [AppConfigModule, HealthModule],
})
export class AppModule {}
