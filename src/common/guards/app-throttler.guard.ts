import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global rate-limit guard. Skips enforcement under NODE_ENV=test so the e2e
 * suite (many logins from one host) isn't throttled; enforced everywhere else.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(): Promise<boolean> {
    return Promise.resolve(process.env.NODE_ENV === 'test');
  }
}
