import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AUDIT_EVENT, AuditEvent } from '../../shared/events/audit.event';
import { AuditService } from './audit.service';

/**
 * Bridges the event bus to persistence. This is the ONLY consumer of audit
 * events, so emitters (Auth/Users/RBAC) stay fully decoupled from how — or
 * whether — auditing is stored.
 */
@Injectable()
export class AuditListener {
  constructor(private readonly auditService: AuditService) {}

  @OnEvent(AUDIT_EVENT)
  async handle(event: AuditEvent): Promise<void> {
    await this.auditService.record(event);
  }
}
