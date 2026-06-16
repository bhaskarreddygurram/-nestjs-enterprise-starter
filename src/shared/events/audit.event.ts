/** Single channel all audit events flow through. */
export const AUDIT_EVENT = 'audit.event';

/** Canonical action names recorded in the audit trail. */
export const AuditAction = {
  AUTH_LOGIN: 'auth.login',
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_LOGOUT_ALL: 'auth.logout_all',
  AUTH_TOKEN_REFRESHED: 'auth.token_refreshed',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  ROLE_ASSIGNED: 'role.assigned',
  ROLE_REMOVED: 'role.removed',
  FILE_UPLOADED: 'file.uploaded',
  FILE_DELETED: 'file.deleted',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

/** Payload emitted on the AUDIT_EVENT channel and persisted by the listener. */
export interface AuditEvent {
  action: string;
  resource: string;
  resourceId?: string | null;
  /** Explicit actor; when omitted the emitter fills it from request context. */
  actorId?: string | null;
  ipAddress?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}
