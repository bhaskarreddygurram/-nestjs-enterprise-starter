import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from './authenticated-user.interface';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TwoFactorChallengeDto } from './dto/two-factor-challenge.dto';
import { PasswordResetService } from './password-reset.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  // Stricter limit on credential endpoints to blunt brute-force / abuse.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register a new account and receive an access token',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email already in use' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email + password',
    description:
      'Returns a token pair. If the account has 2FA enabled, returns ' +
      '`{ twoFactorRequired: true, challengeToken }` instead — complete login ' +
      'at POST /auth/2fa/authenticate.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or locked account',
  })
  login(
    @Body() dto: LoginDto,
  ): Promise<AuthResponseDto | TwoFactorChallengeDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired, or reused token' })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a single refresh-token session' })
  @ApiNoContentResponse({ description: 'Session revoked (idempotent)' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Request a password-reset email',
    description:
      'Always returns 204 regardless of whether the email exists (prevents ' +
      'account enumeration). A reset link is emailed only if the account exists.',
  })
  @ApiNoContentResponse({ description: 'Request accepted (always)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.passwordReset.request(dto.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  @ApiNoContentResponse({ description: 'Password reset; all sessions revoked' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.passwordReset.reset(dto.token, dto.password);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change the current password (verifies the existing one)',
  })
  @ApiNoContentResponse({
    description: 'Password changed; all sessions revoked',
  })
  @ApiUnauthorizedResponse({ description: 'Current password incorrect' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the current user with resolved roles + permissions',
  })
  @ApiOkResponse({ description: 'Authenticated principal' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all sessions for the current user' })
  @ApiNoContentResponse({ description: 'All sessions revoked' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  async logoutAll(@CurrentUser('id') userId: string): Promise<void> {
    await this.authService.logoutAll(userId);
  }
}
