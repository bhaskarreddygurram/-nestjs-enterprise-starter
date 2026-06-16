import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Ensures every request carries an `x-request-id` (honoring an inbound one,
 * else generating a UUID) and echoes it on the response. The id flows into
 * logs and both response envelopes for end-to-end correlation.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && incoming.length > 0
      ? incoming
      : randomUUID();
  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
