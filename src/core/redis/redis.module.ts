import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

/**
 * Global Redis module. Creates a single shared ioredis client from typed
 * config and exposes it via `RedisService`.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const logger = new Logger('RedisModule');
        const url = config.get<string>('redis.url');
        const useTls = config.get<boolean>('redis.tls', false);
        const baseOptions = { maxRetriesPerRequest: null, lazyConnect: false };

        // A full URL (managed providers usually give one) carries host, port,
        // password and — via rediss:// — TLS, so it takes precedence over the
        // discrete REDIS_* fields.
        const client = url
          ? new Redis(url, baseOptions)
          : new Redis({
              host: config.get<string>('redis.host', 'localhost'),
              port: config.get<number>('redis.port', 6379),
              password: config.get<string>('redis.password') || undefined,
              db: config.get<number>('redis.db', 0),
              ...baseOptions,
              // Enable TLS for managed providers (Upstash, Redis Cloud, …).
              ...(useTls ? { tls: {} } : {}),
            });

        client.on('connect', () => logger.log('Connected to Redis'));
        client.on('error', (err) =>
          logger.error(`Redis error: ${err.message}`),
        );

        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
