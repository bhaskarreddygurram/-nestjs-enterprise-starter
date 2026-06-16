import { Injectable } from '@nestjs/common';
import { File, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

/** Data-access for file metadata (soft-delete aware). */
@Injectable()
export class FilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.FileCreateInput): Promise<File> {
    return this.prisma.file.create({ data });
  }

  findById(id: string): Promise<File | null> {
    return this.prisma.file.findFirst({ where: { id, deletedAt: null } });
  }

  findMany(params: { skip: number; take: number }): Promise<File[]> {
    return this.prisma.file.findMany({
      where: { deletedAt: null },
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(): Promise<number> {
    return this.prisma.file.count({ where: { deletedAt: null } });
  }

  softDelete(id: string): Promise<File> {
    return this.prisma.file.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
