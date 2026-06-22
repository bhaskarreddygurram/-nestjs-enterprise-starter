import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { MetricsService } from './metrics.service';

/**
 * Records HTTP duration + count for every request. Uses the matched route
 * *pattern* (e.g. `/api/v1/users/:id`) rather than the concrete URL, so path
 * parameters don't explode label cardinality.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private readonly enabled: boolean;

  constructor(
    private readonly metrics: MetricsService,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('metrics.enabled', true);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.enabled || context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // Don't measure the scrape endpoint itself.
    if (request.path === '/metrics') {
      return next.handle();
    }

    // Record on `finish` so the status code is final (after the exception
    // filter has run) and the matched route pattern is populated.
    const start = process.hrtime.bigint();
    response.once('finish', () => {
      const routePath =
        (request.route as { path?: string } | undefined)?.path ?? '';
      const route = `${request.baseUrl ?? ''}${routePath}` || 'unknown';
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.recordHttpRequest(
        request.method,
        route,
        response.statusCode,
        seconds,
      );
    });

    return next.handle();
  }
}
