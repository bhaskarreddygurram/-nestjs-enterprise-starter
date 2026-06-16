import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_TRANSFORM_KEY = 'skipResponseTransform';

/**
 * Opts a route/controller out of the global success-envelope transform.
 * Used for endpoints with their own contract (e.g. Terminus health checks).
 */
export const SkipResponseTransform = () =>
  SetMetadata(SKIP_RESPONSE_TRANSFORM_KEY, true);
