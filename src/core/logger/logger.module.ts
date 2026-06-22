import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IncomingMessage, ServerResponse } from 'http';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

/**
 * Structured logging via Pino.
 *
 *  - JSON logs in production (machine-parseable, ship to Loki/ELK/Datadog).
 *  - Pretty-printed in development; silenced under `test`.
 *  - Every log line carries the request id (`reqId`), reusing the inbound
 *    `x-request-id` header so logs correlate with the response envelope, the
 *    audit trail (CLS), and across services.
 *  - Sensitive headers are redacted.
 *
 * This must be imported FIRST in the root module so its middleware runs before
 * the CLS middleware, which then reuses the same request id.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const env = config.get<string>('env', 'development');
        const isDev = env === 'development';
        const isTest = env === 'test';

        return {
          pinoHttp: {
            level: isTest ? 'silent' : config.get<string>('log.level', 'info'),
            // Pretty output for humans in dev; raw JSON everywhere else.
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    colorize: true,
                    translateTime: 'SYS:HH:MM:ss.l',
                    ignore: 'pid,hostname',
                  },
                }
              : undefined,
            // Reuse the inbound request id (or mint one) and echo it back.
            genReqId: (req: IncomingMessage, res: ServerResponse): string => {
              const header = req.headers['x-request-id'];
              const id =
                typeof header === 'string' && header.length > 0
                  ? header
                  : randomUUID();
              req.headers['x-request-id'] = id;
              res.setHeader('x-request-id', id);
              return id;
            },
            // Keep request/response log objects lean.
            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res: { statusCode: number }) => ({
                statusCode: res.statusCode,
              }),
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-api-key"]',
              ],
              remove: true,
            },
            // /health and /metrics are scraped constantly — don't log them.
            autoLogging: {
              ignore: (req: IncomingMessage) =>
                req.url === '/metrics' ||
                req.url?.startsWith('/api/v1/health') === true,
            },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
