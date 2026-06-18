/** Claims encoded into the JWT access token. */
export interface JwtPayload {
  /** Subject — the user id. */
  sub: string;
  email: string;
  /**
   * Token type. Absent (or 'access') on normal access tokens. The two-step 2FA
   * login issues a short-lived '2fa' challenge token that must NOT be accepted
   * as an access token — the JwtStrategy rejects anything that isn't 'access'.
   */
  typ?: 'access' | '2fa';
}
