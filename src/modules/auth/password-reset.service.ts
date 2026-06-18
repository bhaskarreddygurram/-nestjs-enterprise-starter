import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { AuditEmitter } from '../audit/audit.emitter';
import { AuditAction } from '../../shared/events/audit.event';
import { MAIL_PROVIDER, MailProvider } from '../mail/mail.interface';
import { UsersService } from '../users/users.service';
import { authMailTemplates } from './auth-mail.templates';
import { PasswordResetRepository } from './password-reset.repository';
import { RefreshTokenService } from './refresh-token.service';

/**
 * Self-service password reset via a signed, expiring, single-use token emailed
 * to the user.
 *
 * Privacy: `request()` never reveals whether an email exists — it always
 * resolves the same way, so the endpoint can return a generic 204.
 * Security: only SHA-256(token) is stored; a successful reset revokes every
 * active session and invalidates all outstanding reset tokens.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly users: UsersService,
    private readonly repository: PasswordResetRepository,
    private readonly refreshTokens: RefreshTokenService,
    private readonly config: ConfigService,
    private readonly audit: AuditEmitter,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  /** Issue + email a reset token. Always resolves (no user enumeration). */
  async request(email: string): Promise<void> {
    const user = await this.users.findEntityByEmail(email);
    if (!user || !user.isActive) {
      // Same outcome whether or not the account exists.
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const ttlMinutes = this.config.get<number>(
      'security.passwordResetTtlMinutes',
      30,
    );
    await this.repository.create({
      userId: user.id,
      tokenHash: this.hash(rawToken),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    });

    const baseUrl = this.config.get<string>(
      'security.appWebUrl',
      'http://localhost:3000',
    );
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
    const rendered = authMailTemplates.passwordReset(resetUrl, ttlMinutes);
    try {
      await this.mail.send({
        to: user.email,
        subject: rendered.subject,
        body: rendered.body,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send password-reset email: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    this.audit.emit({
      action: AuditAction.AUTH_PASSWORD_RESET_REQUESTED,
      resource: 'auth',
      actorId: user.id,
      resourceId: user.id,
    });
  }

  /** Consume a token and set the new password. Throws 400 on any invalid token. */
  async reset(rawToken: string, newPassword: string): Promise<void> {
    const record = await this.repository.findByHash(this.hash(rawToken));
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.users.setPassword(record.userId, newPassword);
    await this.repository.markUsed(record.id);
    await this.repository.invalidateAllForUser(record.userId);
    // Force re-authentication everywhere — a reset implies the old sessions
    // may be compromised.
    await this.refreshTokens.revokeAll(record.userId);

    this.audit.emit({
      action: AuditAction.AUTH_PASSWORD_RESET,
      resource: 'auth',
      actorId: record.userId,
      resourceId: record.userId,
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
