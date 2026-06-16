import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_RESPONSE_TRANSFORM_KEY } from '../decorators/skip-response-transform.decorator';
import { PaginatedDto } from '../dto/page-meta.dto';
import { ApiResponse } from '../interfaces/api-response.interface';

/**
 * Wraps successful responses in the standard success envelope. Paginated
 * results ({ data, meta }) are unwrapped so `meta` sits at the envelope level.
 * `void`/204 responses pass through untouched (no body).
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | T> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_TRANSFORM_KEY,
      [context.getHandler(), context.getClass()],
    );

    const http = context.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    return next.handle().pipe(
      map((data): ApiResponse<T> | T => {
        // No body (e.g. 204) or explicitly skipped → leave untouched.
        if (skip || data === undefined || data === null) {
          return data;
        }

        let payload: unknown = data;
        let meta: unknown = null;
        if (data instanceof PaginatedDto) {
          payload = data.data;
          meta = data.meta;
        }

        return {
          success: true,
          statusCode: response.statusCode,
          message: 'Success',
          data: payload as T,
          meta,
          timestamp: new Date().toISOString(),
          path: request.originalUrl,
          requestId: request.headers['x-request-id'] as string | undefined,
        };
      }),
    );
  }
}
