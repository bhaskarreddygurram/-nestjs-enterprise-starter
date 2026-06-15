import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt-payload.interface';
import { RefreshTokenService } from './refresh-token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // UsersService.create enforces email uniqueness and argon2-hashes the password.
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.validateCredentials(dto.email, dto.password);
    return this.buildAuthResponse(user);
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
    return this.buildAuthResponse(user, token);
  }

  /** Revoke a single session. */
  async logout(rawRefreshToken: string): Promise<void> {
    await this.refreshTokens.revoke(rawRefreshToken);
  }

  /** Revoke every session for the user. */
  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAll(userId);
  }

  /**
   * Verifies email + password. Returns a sanitized user on success.
   * Failure is always the same generic 401 — we never reveal whether the
   * email exists or the password was wrong (prevents user enumeration).
   */
  private async validateCredentials(
    email: string,
    password: string,
  ): Promise<UserResponseDto> {
    const entity = await this.usersService.findEntityByEmail(email);
    if (!entity || !entity.isActive) {
      throw new UnauthorizedException('Invalid credentials');
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
      throw new UnauthorizedException('Invalid credentials');
    }
    return UserResponseDto.fromEntity(entity);
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
