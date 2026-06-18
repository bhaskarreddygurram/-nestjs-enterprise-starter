import { ApiProperty } from '@nestjs/swagger';

/**
 * Returned by POST /auth/login when the account has 2FA enabled, instead of a
 * token pair. The client must complete login at POST /auth/2fa/authenticate.
 */
export class TwoFactorChallengeDto {
  @ApiProperty({ example: true })
  twoFactorRequired!: true;

  @ApiProperty({
    description:
      'Short-lived token tying the second step to this login attempt',
  })
  challengeToken!: string;
}
