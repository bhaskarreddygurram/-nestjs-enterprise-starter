import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class TwoFactorCodeDto {
  @ApiProperty({
    example: '123456',
    description: '6-digit TOTP code from the authenticator app',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;
}
