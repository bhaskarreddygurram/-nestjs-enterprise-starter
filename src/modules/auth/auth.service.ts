import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuditEmitter } from '../audit/audit.emitter';
import { AuditAction } from '../../shared/events/audit.event';
import { AppEvent, UserRegisteredEvent } from '../../shared/events/app.event';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TwoFactorChallengeDto } from './dto/two-factor-challenge.dto';
import { JwtPayload } from './jwt-payload.interface';
import { RefreshTokenService } from './refresh-token.service';
import { TwoFactorService } from './two-factor.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly twoFactor: TwoFactorService,
    private readonly audit: AuditEmitter,
    private readonly events: EventEmitter2,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // UsersService.create enforces email uniqueness and argon2-hashes the password.
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    this.audit.emit({
      action: AuditAction.AUTH_REGISTER,
      resource: 'auth',
      actorId: user.id,
      resourceId: user.id,
      metadata: { email: user.email },
    });
    // Domain event: notifications (and any future module) react to this.
    this.events.emit(AppEvent.USER_REGISTERED, {
      userId: user.id,
      email: user.email,
      name: user.firstName,
    } satisfies UserRegisteredEvent);
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto | TwoFactorChallengeDto> {
    const user = await this.validateCredentials(dto.email, dto.password);

    // 2FA enabled → don't hand out tokens yet; issue a short-lived challenge
    // that the client redeems at /auth/2fa/authenticate with a TOTP code.
    if (user.twoFactorEnabled) {
      this.audit.emit({
        action: AuditAction.AUTH_2FA_CHALLENGE,
        resource: 'auth',
        actorId: user.id,
        metadata: { email: user.email },
      });
      const challenge = new TwoFactorChallengeDto();
      challenge.twoFactorRequired = true;
      challenge.challengeToken = await this.issueChallengeToken(user);
      return challenge;
    }

    this.audit.emit({
      action: AuditAction.AUTH_LOGIN,
      resource: 'auth',
      actorId: user.id,
      metadata: { email: user.email },
    });
    return this.buildAuthResponse(UserResponseDto.fromEntity(user));
  }

  /**
   * Complete a 2FA login: verify the challenge token + second factor (TOTP or
   * a one-time recovery code), then issue the real token pair.
   */
  async loginSecondFactor(
    challengeToken: string,
    code: string,
  ): Promise<AuthResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(challengeToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired challenge');
    }
    if (payload.typ !== '2fa') {
      throw new UnauthorizedException('Invalid challenge token');
    }

    const entity = await this.usersService.findEntityById(payload.sub);
    if (!entity || !entity.isActive || !entity.twoFactorEnabled) {
      throw new UnauthorizedException('Invalid challenge');
    }
    const ok = await this.twoFactor.verifyCode(entity, code);
    if (!ok) {
      throw new UnauthorizedException('Invalid verification code');
    }

    this.audit.emit({
      action: AuditAction.AUTH_LOGIN,
      resource: 'auth',
      actorId: entity.id,
      metadata: { email: entity.email, via: '2fa' },
    });
    return this.buildAuthResponse(UserResponseDto.fromEntity(entity));
  }

  /**
   * Change the password of an authenticated user. Verifies the current
   * password, then revokes all sessions (forcing re-login everywhere).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const entity = await this.usersService.findEntityById(userId);
    if (!entity) {
      throw new UnauthorizedException('User not found');
    }
    let valid = false;
    try {
      valid = await argon2.verify(entity.passwordHash, currentPassword);
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.usersService.setPassword(userId, newPassword);
    await this.refreshTokens.revokeAll(userId);
    this.audit.emit({
      action: AuditAction.AUTH_PASSWORD_CHANGED,
      resource: 'auth',
      actorId: userId,
      resourceId: userId,
    });
  }

  /**
   * Exchange a valid refresh token for a fresh access + refresh pair.
   * The old refresh token is rotated out (revoked); reuse is detected by
   * RefreshTokenService and revokes the whole session set.
   */
  async refresh(rawRefreshToken: string): Promise<AuthResponseDto> {
    const { userId, token } = await this.refreshTokens.rotate(rawRefreshToken);

    const entity = await this.usersService.findEntityById(userId);
    if (!entity || !entity.isActive) {
      // User deactivated since the token was issued — kill the session set.
      await this.refreshTokens.revokeAll(userId);
      throw new UnauthorizedException('User no longer active');
    }

    const user = UserResponseDto.fromEntity(entity);
    this.audit.emit({
      action: AuditAction.AUTH_TOKEN_REFRESHED,
      resource: 'auth',
      actorId: user.id,
    });
    return this.buildAuthResponse(user, token);
  }

  /** Revoke a single session. */
  async logout(rawRefreshToken: string): Promise<void> {
    await this.refreshTokens.revoke(rawRefreshToken);
    this.audit.emit({ action: AuditAction.AUTH_LOGOUT, resource: 'auth' });
  }

  /** Revoke every session for the user. */
  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAll(userId);
    this.audit.emit({
      action: AuditAction.AUTH_LOGOUT_ALL,
      resource: 'auth',
      actorId: userId,
      resourceId: userId,
    });
  }

  /**
   * Verifies email + password and enforces account lockout. Returns the user
   * entity on success. Failure is the same generic 401 — we never reveal
   * whether the email exists or the password was wrong (prevents enumeration),
   * with one exception: an explicitly locked account gets a clear message.
   */
  private async validateCredentials(
    email: string,
    password: string,
  ): Promise<User> {
    const entity = await this.usersService.findEntityByEmail(email);
    if (!entity || !entity.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (entity.lockedUntil && entity.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException(
        'Account temporarily locked due to too many failed login attempts. Try again later.',
      );
    }

    // argon2.verify throws on a malformed/legacy hash — treat that as a failed
    // login (401), never let it surface as a 500.
    let valid = false;
    try {
      valid = await argon2.verify(entity.passwordHash, password);
    } catch {
      valid = false;
    }

    if (!valid) {
      await this.handleFailedLogin(entity);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful login clears any accumulated failures / lockout.
    if (entity.failedLoginAttempts > 0 || entity.lockedUntil) {
      await this.usersService.clearLoginFailures(entity.id);
    }
    return entity;
  }

  /** Count a failed attempt and lock the account once the threshold is hit. */
  private async handleFailedLogin(entity: User): Promise<void> {
    const max = this.config.get<number>('security.maxLoginAttempts', 5);
    const attempts = await this.usersService.registerFailedLogin(entity.id);
    if (attempts >= max) {
      const minutes = this.config.get<number>('security.lockoutMinutes', 15);
      const until = new Date(Date.now() + minutes * 60_000);
      await this.usersService.lockAccount(entity.id, until);
      this.audit.emit({
        action: AuditAction.AUTH_ACCOUNT_LOCKED,
        resource: 'auth',
        actorId: entity.id,
        resourceId: entity.id,
        metadata: { until: until.toISOString() },
      });
    }
  }

  /** Issue a short-lived '2fa' challenge token for the second login step. */
  private issueChallengeToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      typ: '2fa',
    };
    return this.jwtService.signAsync(payload, {
      expiresIn: this.config.get<string>(
        'security.twoFactorChallengeTtl',
        '5m',
      ) as `${number}m`,
    });
  }

  /**
   * Build the auth response. When `existingRefreshToken` is supplied (the
   * refresh flow), it is reused; otherwise a new session token is issued
   * (login/register).
   */
  private async buildAuthResponse(
    user: UserResponseDto,
    existingRefreshToken?: string,
  ): Promise<AuthResponseDto> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken =
      existingRefreshToken ?? (await this.refreshTokens.issue(user.id));

    const response = new AuthResponseDto();
    response.accessToken = accessToken;
    response.refreshToken = refreshToken;
    response.expiresIn = this.config.get<string>('jwt.accessExpiresIn', '15m');
    response.user = user;
    return response;
  }
}
