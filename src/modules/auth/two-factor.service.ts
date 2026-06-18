import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { buildOtpAuthUrl, generateSecret, verifyTotp } from './totp.util';
import { AuditEmitter } from '../audit/audit.emitter';
import { AuditAction } from '../../shared/events/audit.event';
import { UsersService } from '../users/users.service';
import { TwoFactorSetupResponseDto } from './dto/two-factor-setup-response.dto';
import { TwoFactorRepository } from './two-factor.repository';

const RECOVERY_CODE_COUNT = 10;

/**
 * TOTP-based two-factor authentication (RFC 6238) with single-use recovery
 * codes.
 *
 * Lifecycle: setup() enrolls a pending secret + QR; enable() confirms it with a
 * live code and returns one-time recovery codes; verifyCode() is called during
 * the two-step login; disable() turns it off (requires a valid second factor).
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly users: UsersService,
    private readonly repository: TwoFactorRepository,
    private readonly config: ConfigService,
    private readonly audit: AuditEmitter,
  ) {}

  /** Begin enrollment: generate + store a pending secret, return the QR/URI. */
  async setup(
    userId: string,
    email: string,
  ): Promise<TwoFactorSetupResponseDto> {
    const secret = generateSecret();
    await this.users.setTwoFactorSecret(userId, secret);

    const issuer = this.config.get<string>(
      'security.twoFactorIssuer',
      'Enterprise Starter',
    );
    const otpauthUrl = buildOtpAuthUrl(issuer, email, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    const dto = new TwoFactorSetupResponseDto();
    dto.secret = secret;
    dto.otpauthUrl = otpauthUrl;
    dto.qrCodeDataUrl = qrCodeDataUrl;
    return dto;
  }

  /** Confirm enrollment with a live TOTP code; returns one-time recovery codes. */
  async enable(userId: string, code: string): Promise<string[]> {
    const user = await this.requireUser(userId);
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Start 2FA setup first');
    }
    if (!verifyTotp(user.twoFactorSecret, code)) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.users.setTwoFactorEnabled(userId, true);
    const recoveryCodes = this.generateRecoveryCodes();
    const hashes = await Promise.all(recoveryCodes.map((c) => argon2.hash(c)));
    await this.repository.replaceCodes(userId, hashes);

    this.audit.emit({
      action: AuditAction.AUTH_2FA_ENABLED,
      resource: 'auth',
      actorId: userId,
      resourceId: userId,
    });
    return recoveryCodes;
  }

  /** Disable 2FA. Requires a valid current second factor (TOTP or recovery). */
  async disable(userId: string, code: string): Promise<void> {
    const user = await this.requireUser(userId);
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }
    const ok = await this.verifyCode(user, code);
    if (!ok) {
      throw new BadRequestException('Invalid verification code');
    }

    await this.users.setTwoFactorEnabled(userId, false); // also clears the secret
    await this.repository.deleteAllForUser(userId);

    this.audit.emit({
      action: AuditAction.AUTH_2FA_DISABLED,
      resource: 'auth',
      actorId: userId,
      resourceId: userId,
    });
  }

  /**
   * Verify a code during login: a 6-digit TOTP, or a one-time recovery code.
   * A matched recovery code is consumed (marked used).
   */
  async verifyCode(user: User, code: string): Promise<boolean> {
    if (!user.twoFactorSecret) {
      return false;
    }
    const normalized = code.trim();
    if (
      /^\d{6}$/.test(normalized) &&
      verifyTotp(user.twoFactorSecret, normalized)
    ) {
      return true;
    }
    return this.consumeRecoveryCode(user.id, normalized.toLowerCase());
  }

  private async consumeRecoveryCode(
    userId: string,
    candidate: string,
  ): Promise<boolean> {
    const codes = await this.repository.findUnusedForUser(userId);
    for (const row of codes) {
      if (await argon2.verify(row.codeHash, candidate)) {
        await this.repository.markUsed(row.id);
        return true;
      }
    }
    return false;
  }

  private generateRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const raw = randomBytes(5).toString('hex'); // 10 hex chars
      return `${raw.slice(0, 5)}-${raw.slice(5)}`; // e.g. "a1b2c-3d4e5"
    });
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findEntityById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return user;
  }
}
