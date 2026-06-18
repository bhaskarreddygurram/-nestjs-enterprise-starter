import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import {
  IsStrongPassword,
  PASSWORD_POLICY_DESCRIPTION,
} from '../../../common/validators/is-strong-password.validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'The current password' })
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({
    example: 'N3w!Passw0rd',
    description: PASSWORD_POLICY_DESCRIPTION,
  })
  @IsStrongPassword()
  newPassword!: string;
}
