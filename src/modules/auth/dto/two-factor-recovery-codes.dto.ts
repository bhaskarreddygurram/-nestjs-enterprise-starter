import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorRecoveryCodesDto {
  @ApiProperty({
    type: [String],
    description:
      'One-time recovery codes. Shown ONCE — store them safely; each works as a 2FA code exactly once.',
  })
  recoveryCodes!: string[];
}
