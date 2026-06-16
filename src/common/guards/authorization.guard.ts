import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthenticatedUser } from '../../modules/auth/authenticated-user.interface';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Globally-registered guard that runs AFTER JwtAuthGuard. It enforces the
 * `@Roles()` / `@Permissions()` metadata against the principal loaded onto
 * the request:
 *   - roles:       user needs ANY of the required roles
 *   - permissions: user needs ALL of the required permissions
 *
 * Routes with neither decorator are allowed for any authenticated user.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const needsRoles = requiredRoles && requiredRoles.length > 0;
    const needsPermissions =
      requiredPermissions && requiredPermissions.length > 0;

    // No authorization constraints → being authenticated is enough.
    if (!needsRoles && !needsPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    if (needsRoles) {
      const hasRole = requiredRoles.some((role) => user.roles.includes(role));
      if (!hasRole) {
        throw new ForbiddenException(
          `Requires one of roles: ${requiredRoles.join(', ')}`,
        );
      }
    }

    if (needsPermissions) {
      const hasAll = requiredPermissions.every((perm) =>
        user.permissions.includes(perm),
      );
      if (!hasAll) {
        throw new ForbiddenException(
          `Requires permissions: ${requiredPermissions.join(', ')}`,
        );
      }
    }

    return true;
  }
}
