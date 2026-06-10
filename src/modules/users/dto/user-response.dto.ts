import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '@prisma/client';

/**
 * Public representation of a user. The mapping is explicit (allowlist) so a
 * sensitive column added to the model later can never leak by default —
 * `passwordHash` and `deletedAt` simply do not exist here.
 */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  email!: string;

  @ApiPropertyOptional({ example: 'Jane', nullable: true })
  firstName!: string | null;

  @ApiPropertyOptional({ example: 'Doe', nullable: true })
  lastName!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: false })
  twoFactorEnabled!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.isActive = user.isActive;
    dto.twoFactorEnabled = user.twoFactorEnabled;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
