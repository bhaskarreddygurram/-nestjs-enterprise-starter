import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // No strength rules here — we validate against the stored hash, not a policy.
  @ApiProperty({ example: 'Admin123!ChangeMe' })
  @IsString()
  @MaxLength(128)
  password!: string;
}
