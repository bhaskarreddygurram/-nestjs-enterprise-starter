import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Requires the authenticated user to hold ALL of the given permissions
 * (format: `resource:action`, e.g. 'user:create'). Enforced by the global
 * AuthorizationGuard.
 *
 *   @Permissions('user:create')
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
