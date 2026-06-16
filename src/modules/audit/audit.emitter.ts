import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClsService } from 'nestjs-cls';
import {
  CLS_ACTOR_ID,
  CLS_IP,
  CLS_REQUEST_ID,
} from '../../common/cls.constants';
import { AUDIT_EVENT, AuditEvent } from '../../shared/events/audit.event';

/**
 * The thin, typed seam emitters depend on (Auth/Users/RBAC inject this — never
 * AuditService). Enriches the event with request context (actor, ip, request
 * id) from CLS at emit time, then fires it on the AUDIT_EVENT channel.
 *
 * Reading CLS here (synchronously, inside the request handler) avoids any
 * async-context loss that could happen inside the downstream listener.
 */
@Injectable()
export class AuditEmitter {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly cls: ClsService,
  ) {}

  emit(
    event: Pick<AuditEvent, 'action' | 'resource'> & Partial<AuditEvent>,
  ): void {
    const enriched: AuditEvent = {
      resourceId: null,
      metadata: null,
      ...event,
      actorId: event.actorId ?? this.cls.get<string>(CLS_ACTOR_ID) ?? null,
      ipAddress: event.ipAddress ?? this.cls.get<string>(CLS_IP) ?? null,
      requestId:
        event.requestId ?? this.cls.get<string>(CLS_REQUEST_ID) ?? null,
    };
    this.eventEmitter.emit(AUDIT_EVENT, enriched);
  }
}
