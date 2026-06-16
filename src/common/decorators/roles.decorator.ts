import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'requiredRoles';

/**
 * Requires the authenticated user to have AT LEAST ONE of the given roles.
 * Enforced by the global AuthorizationGuard.
 *
 *   @Roles('admin')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
