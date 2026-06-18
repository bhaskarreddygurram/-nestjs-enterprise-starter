import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  IsStrongPassword,
  PASSWORD_POLICY_DESCRIPTION,
} from '../../../common/validators/is-strong-password.validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The reset token from the password-reset email' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  token!: string;

  @ApiProperty({
    example: 'N3w!Passw0rd',
    description: PASSWORD_POLICY_DESCRIPTION,
  })
  @IsStrongPassword()
  password!: string;
}
