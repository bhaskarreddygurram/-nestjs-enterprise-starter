import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock<void, [unknown]>;

  const hostFor = (): ArgumentsHost => {
    jsonMock = jest.fn<void, [unknown]>();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    return {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => ({
          originalUrl: '/api/v1/x',
          headers: { 'x-request-id': 'rid-1' },
        }),
      }),
    } as unknown as ArgumentsHost;
  };

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it('maps a ConflictException to the error envelope', () => {
    filter.catch(new ConflictException('Email in use'), hostFor());

    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 409,
        message: 'Email in use',
        errorCode: 'CONFLICT',
        errors: null,
        path: '/api/v1/x',
        requestId: 'rid-1',
      }),
    );
  });

  it('turns class-validator array messages into VALIDATION_ERROR + errors[]', () => {
    filter.catch(
      new BadRequestException({
        message: ['email must be an email', 'password too short'],
        error: 'Bad Request',
      }),
      hostFor(),
    );

    const payload = jsonMock.mock.calls[0][0] as {
      errorCode: string;
      errors: Array<{ message: string }>;
    };
    expect(payload.errorCode).toBe('VALIDATION_ERROR');
    expect(payload.errors).toEqual([
      { message: 'email must be an email' },
      { message: 'password too short' },
    ]);
  });

  it('hides details of unexpected (non-HTTP) errors behind a 500', () => {
    filter.catch(new Error('db exploded'), hostFor());

    expect(statusMock).toHaveBeenCalledWith(500);
    const payload = jsonMock.mock.calls[0][0] as {
      message: string;
      errorCode: string;
    };
    expect(payload.message).toBe('Internal server error');
    expect(payload.errorCode).toBe('INTERNAL_ERROR');
  });

  it('maps a generic HttpException status to a code', () => {
    filter.catch(new HttpException('teapot', 418), hostFor());
    const payload = jsonMock.mock.calls[0][0] as { errorCode: string };
    expect(payload.errorCode).toBe('ERROR');
  });
});
