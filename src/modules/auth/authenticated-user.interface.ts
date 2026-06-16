/**
 * The principal attached to `request.user` by JwtStrategy.validate, and
 * returned by the `@CurrentUser()` decorator.
 *
 * Carries the roles + permissions resolved at request time so the
 * AuthorizationGuard can authorize without another DB round-trip.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  isActive: boolean;
  /** Role names, e.g. ['admin']. */
  roles: string[];
  /** Permission strings, e.g. ['user:read', 'user:create']. */
  permissions: string[];
}
