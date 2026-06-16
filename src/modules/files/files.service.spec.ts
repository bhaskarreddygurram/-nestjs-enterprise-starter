import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { File } from '@prisma/client';
import { AuditEmitter } from '../audit/audit.emitter';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';
import { STORAGE_PROVIDER } from './storage/storage.interface';

const fileRow: File = {
  id: 'f1',
  originalName: 'doc.pdf',
  storageKey: 'key.pdf',
  mimeType: 'application/pdf',
  size: 1234,
  uploaderId: 'u1',
  createdAt: new Date(),
  deletedAt: null,
};

const multerFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File =>
  ({
    originalname: 'doc.pdf',
    mimetype: 'application/pdf',
    size: 1234,
    buffer: Buffer.from('hello'),
    ...overrides,
  }) as Express.Multer.File;

describe('FilesService', () => {
  let service: FilesService;
  let repo: jest.Mocked<FilesRepository>;
  let storage: { save: jest.Mock; read: jest.Mock; remove: jest.Mock };

  beforeEach(async () => {
    storage = { save: jest.fn(), read: jest.fn(), remove: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        {
          provide: FilesRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            softDelete: jest.fn(),
          },
        },
        { provide: STORAGE_PROVIDER, useValue: storage },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'upload.allowedMimeTypes'
                ? ['application/pdf', 'image/png']
                : 5 * 1024 * 1024,
            ),
          },
        },
        { provide: AuditEmitter, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(FilesService);
    repo = module.get(FilesRepository);
  });

  describe('upload', () => {
    it('stores the bytes and persists metadata', async () => {
      repo.create.mockResolvedValue(fileRow);
      const result = await service.upload(multerFile(), 'u1');

      expect(storage.save).toHaveBeenCalledTimes(1);
      const [key, buf] = storage.save.mock.calls[0] as [string, Buffer];
      expect(key.endsWith('.pdf')).toBe(true); // uuid + ext, not the original name
      expect(buf).toBeInstanceOf(Buffer);
      expect(result.id).toBe('f1');
      expect(result).not.toHaveProperty('storageKey'); // key never exposed
    });

    it('rejects a disallowed mime type with 400 (and never touches storage)', async () => {
      await expect(
        service.upload(
          multerFile({ mimetype: 'application/x-msdownload' }),
          'u1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects an oversized file with 400', async () => {
      await expect(
        service.upload(multerFile({ size: 6 * 1024 * 1024 }), 'u1'),
      ).rejects.toThrow(/maximum size/);
      expect(storage.save).not.toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it('returns the row and its bytes', async () => {
      repo.findById.mockResolvedValue(fileRow);
      storage.read.mockResolvedValue(Buffer.from('data'));

      const { file, data } = await service.download('f1');
      expect(file.id).toBe('f1');
      expect(data.toString()).toBe('data');
    });

    it('throws 404 when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.download('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('removes the object then soft-deletes the row', async () => {
      repo.findById.mockResolvedValue(fileRow);
      repo.softDelete.mockResolvedValue({ ...fileRow, deletedAt: new Date() });

      await service.remove('f1');
      expect(storage.remove).toHaveBeenCalledWith('key.pdf');
      expect(repo.softDelete).toHaveBeenCalledWith('f1');
    });

    it('throws 404 when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
