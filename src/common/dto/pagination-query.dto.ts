import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Base offset-pagination query params. Feature modules extend this with
 * their own filter/search/sort fields (see `UserQueryDto`).
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: '1-based page number',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  /** Prisma `skip` derived from page/limit. */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
