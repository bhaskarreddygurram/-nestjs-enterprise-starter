import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorSetupResponseDto {
  @ApiProperty({
    description:
      'Base32 TOTP secret — enter manually if you cannot scan the QR code',
  })
  secret!: string;

  @ApiProperty({
    description: 'otpauth:// URI; encode it as a QR code in any authenticator',
  })
  otpauthUrl!: string;

  @ApiProperty({
    description: 'The otpauth URI rendered as a scannable QR code (data URL)',
  })
  qrCodeDataUrl!: string;
}
