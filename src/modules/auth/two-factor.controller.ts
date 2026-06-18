import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { TwoFactorAuthenticateDto } from './dto/two-factor-authenticate.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { TwoFactorRecoveryCodesDto } from './dto/two-factor-recovery-codes.dto';
import { TwoFactorSetupResponseDto } from './dto/two-factor-setup-response.dto';
import { TwoFactorService } from './two-factor.service';

@ApiTags('Auth · 2FA')
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(
    private readonly twoFactor: TwoFactorService,
    private readonly authService: AuthService,
  ) {}

  @Post('setup')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Begin 2FA enrollment — returns a secret + QR code',
    description:
      'Generates a pending TOTP secret. Scan the QR (or enter the secret) in ' +
      'an authenticator app, then confirm with POST /auth/2fa/enable.',
  })
  @ApiOkResponse({ type: TwoFactorSetupResponseDto })
  setup(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TwoFactorSetupResponseDto> {
    return this.twoFactor.setup(user.id, user.email);
  }

  @Post('enable')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm + activate 2FA, returning one-time recovery codes',
  })
  @ApiOkResponse({ type: TwoFactorRecoveryCodesDto })
  async enable(
    @CurrentUser('id') userId: string,
    @Body() dto: TwoFactorCodeDto,
  ): Promise<TwoFactorRecoveryCodesDto> {
    const recoveryCodes = await this.twoFactor.enable(userId, dto.code);
    const response = new TwoFactorRecoveryCodesDto();
    response.recoveryCodes = recoveryCodes;
    return response;
  }

  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Disable 2FA (requires a valid TOTP or recovery code)',
  })
  @ApiNoContentResponse({ description: '2FA disabled' })
  async disable(
    @CurrentUser('id') userId: string,
    @Body() dto: TwoFactorCodeDto,
  ): Promise<void> {
    await this.twoFactor.disable(userId, dto.code);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a 2FA login: exchange a challenge + code for tokens',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid challenge or code' })
  authenticate(
    @Body() dto: TwoFactorAuthenticateDto,
  ): Promise<AuthResponseDto> {
    return this.authService.loginSecondFactor(dto.challengeToken, dto.code);
  }
}
