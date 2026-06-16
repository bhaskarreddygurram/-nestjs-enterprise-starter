import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { File } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PageMetaDto, PaginatedDto } from '../../common/dto/page-meta.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuditAction } from '../../shared/events/audit.event';
import { AuditEmitter } from '../audit/audit.emitter';
import { FileResponseDto } from './dto/file-response.dto';
import { FilesRepository } from './files.repository';
import { STORAGE_PROVIDER, StorageProvider } from './storage/storage.interface';

@Injectable()
export class FilesService {
  constructor(
    private readonly repository: FilesRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly config: ConfigService,
    private readonly audit: AuditEmitter,
  ) {}

  async upload(
    file: Express.Multer.File,
    uploaderId: string | null,
  ): Promise<FileResponseDto> {
    this.validate(file);

    const storageKey = `${randomUUID()}${extname(file.originalname)}`;
    await this.storage.save(storageKey, file.buffer);

    const record = await this.repository.create({
      originalName: file.originalname,
      storageKey,
      mimeType: file.mimetype,
      size: file.size,
      ...(uploaderId ? { uploader: { connect: { id: uploaderId } } } : {}),
    });

    this.audit.emit({
      action: AuditAction.FILE_UPLOADED,
      resource: 'file',
      resourceId: record.id,
      metadata: { originalName: record.originalName, size: record.size },
    });

    return FileResponseDto.fromEntity(record);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<PaginatedDto<FileResponseDto>> {
    const [items, totalItems] = await Promise.all([
      this.repository.findMany({ skip: query.skip, take: query.limit }),
      this.repository.count(),
    ]);
    return new PaginatedDto(
      items.map((f) => FileResponseDto.fromEntity(f)),
      new PageMetaDto(query.page, query.limit, totalItems),
    );
  }

  async findOne(id: string): Promise<FileResponseDto> {
    return FileResponseDto.fromEntity(await this.getOrThrow(id));
  }

  /** Returns the row + its bytes for streaming a download. */
  async download(id: string): Promise<{ file: File; data: Buffer }> {
    const file = await this.getOrThrow(id);
    const data = await this.storage.read(file.storageKey);
    return { file, data };
  }

  async remove(id: string): Promise<void> {
    const file = await this.getOrThrow(id);
    await this.storage.remove(file.storageKey);
    await this.repository.softDelete(id);
    this.audit.emit({
      action: AuditAction.FILE_DELETED,
      resource: 'file',
      resourceId: id,
    });
  }

  private async getOrThrow(id: string): Promise<File> {
    const file = await this.repository.findById(id);
    if (!file) {
      throw new NotFoundException(`File with id "${id}" not found`);
    }
    return file;
  }

  private validate(file: Express.Multer.File): void {
    const allowed = this.config.get<string[]>('upload.allowedMimeTypes', []);
    const maxSize = this.config.get<number>('upload.maxSizeBytes', 0);

    if (allowed.length > 0 && !allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: ${allowed.join(', ')}`,
      );
    }
    if (maxSize > 0 && file.size > maxSize) {
      throw new BadRequestException(
        `File exceeds the maximum size of ${Math.round(maxSize / 1024 / 1024)}MB`,
      );
    }
  }
}
