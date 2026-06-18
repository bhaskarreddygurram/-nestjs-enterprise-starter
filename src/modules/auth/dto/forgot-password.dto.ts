import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
