import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  IsStrongPassword,
  PASSWORD_POLICY_DESCRIPTION,
} from '../../../common/validators/is-strong-password.validator';

export class RegisterDto {
  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: 'Str0ng!Passw0rd',
    description: PASSWORD_POLICY_DESCRIPTION,
  })
  @IsStrongPassword()
  password!: string;

  @ApiPropertyOptional({ example: 'Jane' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}
