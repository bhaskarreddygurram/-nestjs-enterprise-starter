/** Claims encoded into the JWT access token. */
export interface JwtPayload {
  /** Subject — the user id. */
  sub: string;
  email: string;
}
