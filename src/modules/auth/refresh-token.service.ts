import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RefreshToken } from '@prisma/client';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { RefreshTokenRepository } from './refresh-token.repository';

/**
 * Owns the refresh-token lifecycle: issue, rotate, verify, revoke.
 *
 * Design:
 *  - The token handed to the client is opaque: `<tokenId>.<secret>`.
 *  - Only SHA-256(secret) is persisted. The secret is 256 bits of entropy,
 *    so a fast hash is sufficient (no need for argon2's slowness here) and it
 *    lets us look the row up by id, then constant-time compare the secret.
 *  - Rotation: every successful refresh revokes the presented token and issues
 *    a new one (linked via replacedById).
 *  - Reuse detection: presenting an already-revoked token means it was
 *    replayed/stolen — we revoke the user's entire active set.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly repository: RefreshTokenRepository,
    private readonly config: ConfigService,
  ) {}

  /** Create a new session token for a user. Returns the raw token string. */
  async issue(userId: string): Promise<string> {
    const secret = randomBytes(32).toString('hex');
    const tokenHash = this.hash(secret);
    const expiresAt = this.expiryDate();

    const row = await this.repository.create({ userId, tokenHash, expiresAt });
    return `${row.id}.${secret}`;
  }

  /**
   * Validate + rotate a refresh token. Returns the userId and a brand-new
   * refresh token. Any failure throws 401.
   */
  async rotate(rawToken: string): Promise<{ userId: string; token: string }> {
    const { id, secret } = this.parse(rawToken);

    // A non-UUID id makes Prisma throw — treat that as an invalid token, not 500.
    let existing: RefreshToken | null;
    try {
      existing = await this.repository.findById(id);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Reuse detection: a revoked token being presented again is a red flag.
    if (existing.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${existing.userId}; revoking all sessions`,
      );
      await this.repository.revokeAllForUser(existing.userId);
      throw new UnauthorizedException('Refresh token already used');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!this.verify(secret, existing.tokenHash)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newToken = await this.issue(existing.userId);
    const newId = this.parse(newToken).id;
    await this.repository.revoke(existing.id, newId);

    return { userId: existing.userId, token: newToken };
  }

  /** Revoke a single session (logout). Silently ignores unknown/expired tokens. */
  async revoke(rawToken: string): Promise<void> {
    let parsed: { id: string; secret: string };
    try {
      parsed = this.parse(rawToken);
    } catch {
      return;
    }
    let existing: RefreshToken | null;
    try {
      existing = await this.repository.findById(parsed.id);
    } catch {
      return; // malformed id → nothing to revoke
    }
    if (existing && !existing.revokedAt) {
      await this.repository.revoke(existing.id);
    }
  }

  /** Revoke every active session for a user (logout-all). */
  async revokeAll(userId: string): Promise<void> {
    await this.repository.revokeAllForUser(userId);
  }

  // --- helpers -----------------------------------------------------------

  private parse(rawToken: string): { id: string; secret: string } {
    const [id, secret] = rawToken.split('.');
    if (!id || !secret) {
      throw new UnauthorizedException('Malformed refresh token');
    }
    return { id, secret };
  }

  private hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private verify(secret: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(secret));
    const expected = Buffer.from(expectedHash);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private expiryDate(): Date {
    const days = this.config.get<number>('jwt.refreshExpiresInDays', 7);
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
