/** Standard success envelope wrapping every (non-skipped) response body. */
export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T | null;
  meta: unknown;
  timestamp: string;
  path: string;
  requestId?: string;
}

/** Standard error envelope produced by the global exception filter. */
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errorCode: string;
  errors: Array<{ field?: string; message: string }> | null;
  timestamp: string;
  path: string;
  requestId?: string;
}
