import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token (send as: Authorization: Bearer <token>)',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Opaque refresh token — exchange at POST /auth/refresh',
  })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType = 'Bearer';

  @ApiProperty({
    example: '15m',
    description: 'Configured access-token lifetime',
  })
  expiresIn!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
