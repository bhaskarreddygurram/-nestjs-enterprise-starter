import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../interfaces/api-response.interface';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
};

/**
 * Catches every exception and renders the standard error envelope.
 * - HttpExceptions keep their status/message.
 * - class-validator failures (array message) become `errors` + VALIDATION_ERROR.
 * - Anything else is a 500 with a generic message (details are logged, never leaked).
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: ApiErrorResponse['errors'] = null;
    let errorCode = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else {
        const body = res as { message?: string | string[]; error?: string };
        if (Array.isArray(body.message)) {
          // class-validator: array of constraint messages
          message = 'Validation failed';
          errors = body.message.map((m) => ({ message: m }));
          errorCode = 'VALIDATION_ERROR';
        } else {
          message = body.message ?? exception.message;
        }
      }
      if (errorCode !== 'VALIDATION_ERROR') {
        errorCode = STATUS_CODES[status] ?? 'ERROR';
      }
    } else if (exception instanceof Error) {
      // Unexpected error — log full detail, return a safe generic message.
      this.logger.error(exception.message, exception.stack);
    }

    const payload: ApiErrorResponse = {
      success: false,
      statusCode: status,
      message,
      errorCode,
      errors,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
      requestId: request.headers['x-request-id'] as string | undefined,
    };

    response.status(status).json(payload);
  }
}
