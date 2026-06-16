import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { File } from '@prisma/client';

/** Public representation of an uploaded file (never exposes the storage key). */
export class FileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'invoice.pdf' })
  originalName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 20481, description: 'Size in bytes' })
  size!: number;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  uploaderId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(file: File): FileResponseDto {
    const dto = new FileResponseDto();
    dto.id = file.id;
    dto.originalName = file.originalName;
    dto.mimeType = file.mimeType;
    dto.size = file.size;
    dto.uploaderId = file.uploaderId;
    dto.createdAt = file.createdAt;
    return dto;
  }
}
