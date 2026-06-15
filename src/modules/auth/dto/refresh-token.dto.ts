import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description:
      'The refresh token previously issued at login/register/refresh',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  refreshToken!: string;
}
