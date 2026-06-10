import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Fields clients may sort users by (whitelist — see `parseSort`). */
export const USER_SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'email',
  'firstName',
  'lastName',
] as const;

export class UserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive search across email, firstName, lastName',
    example: 'jane',
  })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by active state', example: true })
  @IsOptional()
  // Explicit transform: implicit conversion would turn the string "false" into `true`.
  @Transform(({ value }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: `Comma-separated sort fields, "-" prefix for descending. Allowed: ${USER_SORTABLE_FIELDS.join(', ')}`,
    example: '-createdAt,email',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sort?: string;
}
