import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { StorageProvider } from './storage.interface';

/**
 * Local-filesystem storage backend. Files are written under `upload.dir`.
 * Keys are validated to stay inside the base directory (no path traversal).
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    this.baseDir = resolve(config.get<string>('upload.dir', './uploads'));
  }

  private pathFor(key: string): string {
    const target = resolve(this.baseDir, key);
    if (!target.startsWith(this.baseDir)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return target;
  }

  async save(key: string, data: Buffer): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.writeFile(this.pathFor(key), data);
  }

  read(key: string): Promise<Buffer> {
    return fs.readFile(this.pathFor(key));
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.pathFor(key));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(`Failed to remove ${key}: ${String(code)}`);
      }
    }
  }
}
