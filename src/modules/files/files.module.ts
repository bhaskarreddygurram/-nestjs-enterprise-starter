import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';
import { LocalStorageProvider } from './storage/local-storage.provider';
import { STORAGE_PROVIDER } from './storage/storage.interface';

/**
 * File management. The storage backend is bound via the STORAGE_PROVIDER token
 * — swap LocalStorageProvider for an S3 provider here and nothing else changes.
 */
@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    FilesRepository,
    { provide: STORAGE_PROVIDER, useClass: LocalStorageProvider },
  ],
})
export class FilesModule {}
