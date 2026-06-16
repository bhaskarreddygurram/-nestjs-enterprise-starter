import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ example: 'admin', description: 'Name of the role to assign' })
  @IsString()
  @MaxLength(50)
  role!: string;
}
