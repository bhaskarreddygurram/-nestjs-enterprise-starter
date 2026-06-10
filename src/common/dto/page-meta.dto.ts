import { ApiProperty } from '@nestjs/swagger';

/** Pagination metadata returned alongside every paginated list. */
export class PageMetaDto {
  @ApiProperty({ example: 1 })
  readonly page: number;

  @ApiProperty({ example: 20 })
  readonly limit: number;

  @ApiProperty({ example: 137 })
  readonly totalItems: number;

  @ApiProperty({ example: 7 })
  readonly totalPages: number;

  @ApiProperty({ example: true })
  readonly hasNext: boolean;

  @ApiProperty({ example: false })
  readonly hasPrev: boolean;

  constructor(page: number, limit: number, totalItems: number) {
    this.page = page;
    this.limit = limit;
    this.totalItems = totalItems;
    this.totalPages = Math.max(1, Math.ceil(totalItems / limit));
    this.hasNext = page < this.totalPages;
    this.hasPrev = page > 1;
  }
}

/** Generic paginated result envelope: `{ data, meta }`. */
export class PaginatedDto<T> {
  readonly data: T[];

  @ApiProperty({ type: PageMetaDto })
  readonly meta: PageMetaDto;

  constructor(data: T[], meta: PageMetaDto) {
    this.data = data;
    this.meta = meta;
  }
}
