import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Data-access for the audit trail. Deliberately exposes only create + read —
 * audit rows are append-only (never updated or deleted).
 */
@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.AuditLogCreateInput): Promise<AuditLog> {
    return this.prisma.auditLog.create({ data });
  }

  findMany(params: {
    skip: number;
    take: number;
    where: Prisma.AuditLogWhereInput;
  }): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      ...params,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(where: Prisma.AuditLogWhereInput): Promise<number> {
    return this.prisma.auditLog.count({ where });
  }
}
