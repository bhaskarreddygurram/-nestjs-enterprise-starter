import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppConfigModule } from './core/config/config.module';
import { PrismaModule } from './core/database/prisma.module';
import { RedisModule } from './core/redis/redis.module';
import { HealthModule } from './core/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Root application module.
 *
 * Wires core infrastructure + feature modules, and registers the
 * cross-cutting concerns (Phase 6): rate limiting, a consistent response
 * envelope, request logging, and the global exception filter.
 */
@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl', 60000),
            limit: config.get<number>('throttle.limit', 100),
          },
        ],
      }),
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    UsersModule,
    RbacModule,
    AuthModule,
  ],
  providers: [
    // Rate limiting (skips under NODE_ENV=test).
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    // Consistent error envelope for every thrown exception.
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // Outermost interceptor: wraps successful bodies in the success envelope.
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    // Per-request logging with the correlation id.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestIdMiddleware).forRoutes('*');
  }
}
