import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class TwoFactorAuthenticateDto {
  @ApiProperty({
    description: 'The challenge token returned by POST /auth/login',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  challengeToken!: string;

  @ApiProperty({
    example: '123456',
    description: 'A 6-digit TOTP code, or one of your one-time recovery codes',
  })
  @IsString()
  @MinLength(6)
  @MaxLength(40)
  code!: string;
}
