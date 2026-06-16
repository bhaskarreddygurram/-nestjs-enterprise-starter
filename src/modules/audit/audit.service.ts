import { Injectable, Logger } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PageMetaDto, PaginatedDto } from '../../common/dto/page-meta.dto';
import { AuditEvent } from '../../shared/events/audit.event';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditRepository } from './audit.repository';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly repository: AuditRepository) {}

  /**
   * Persists an audit event. Never throws into the caller: a failed audit
   * write must not break the user-facing request that triggered it.
   */
  async record(event: AuditEvent): Promise<void> {
    try {
      await this.repository.create({
        actorId: event.actorId ?? null,
        action: event.action,
        resource: event.resource,
        resourceId: event.resourceId ?? null,
        ipAddress: event.ipAddress ?? null,
        requestId: event.requestId ?? null,
        metadata: (event.metadata ?? undefined) as Prisma.InputJsonValue,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record audit event "${event.action}": ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  async findAll(query: AuditQueryDto): Promise<PaginatedDto<AuditLog>> {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) {
      where.action = query.action;
    }
    if (query.actorId) {
      where.actorId = query.actorId;
    }

    const [items, totalItems] = await Promise.all([
      this.repository.findMany({ skip: query.skip, take: query.limit, where }),
      this.repository.count(where),
    ]);

    return new PaginatedDto(
      items,
      new PageMetaDto(query.page, query.limit, totalItems),
    );
  }
}
