import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { PageMetaDto, PaginatedDto } from '../dto/page-meta.dto';
import { SKIP_RESPONSE_TRANSFORM_KEY } from '../decorators/skip-response-transform.decorator';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  let reflector: Reflector;
  let interceptor: TransformInterceptor<unknown>;

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getResponse: () => ({ statusCode: 200 }),
      getRequest: () => ({
        originalUrl: '/api/v1/x',
        headers: { 'x-request-id': 'rid-1' },
      }),
    }),
  } as unknown as ExecutionContext;

  const handlerOf = (value: unknown): CallHandler => ({
    handle: () => of(value),
  });

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new TransformInterceptor(reflector);
  });

  it('wraps a plain object in the success envelope', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const result = (await lastValueFrom(
      interceptor.intercept(context, handlerOf({ id: 1 })),
    )) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      statusCode: 200,
      data: { id: 1 },
      meta: null,
      path: '/api/v1/x',
      requestId: 'rid-1',
    });
  });

  it('lifts pagination meta to the envelope level', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const paginated = new PaginatedDto([{ id: 1 }], new PageMetaDto(1, 20, 1));

    const result = (await lastValueFrom(
      interceptor.intercept(context, handlerOf(paginated)),
    )) as Record<string, unknown>;

    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.meta).toMatchObject({ page: 1, limit: 20, totalItems: 1 });
  });

  it('does not wrap when @SkipResponseTransform is set', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key) => key === SKIP_RESPONSE_TRANSFORM_KEY);

    const value = { status: 'ok' };
    const result = await lastValueFrom(
      interceptor.intercept(context, handlerOf(value)),
    );
    expect(result).toBe(value);
  });

  it('passes through undefined (204 / no body)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const result = await lastValueFrom(
      interceptor.intercept(context, handlerOf(undefined)),
    );
    expect(result).toBeUndefined();
  });
});
