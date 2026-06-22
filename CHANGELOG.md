# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Phase 12 — CI/CD & Release.** GitHub Actions pipeline
  (lint → typecheck → unit tests + coverage gate → e2e → build → Docker image),
  with Postgres + Redis service containers; coverage threshold enforced in Jest;
  Docker image built on every run and published to GHCR on `main`; this changelog.

## [0.1.0] — 2026-06-22

The foundational build of the enterprise NestJS starter kit (Phases 0–11). Each
phase has a hands-on testing guide in [`docs/`](docs).

### Added

- **Phase 0 — Foundation.** NestJS 11 + TypeScript (strict) scaffold; typed
  configuration with fail-fast Joi env validation; global `/api/v1` prefix + URI
  versioning; global `ValidationPipe`; Helmet + CORS; liveness health check;
  Swagger/OpenAPI; ESLint (flat) + Prettier.
- **Phase 1 — Database Infrastructure.** PostgreSQL 16 + Redis 7 via
  docker-compose (health-checked); Prisma ORM (schema, migrations, generated
  client); lifecycle-bound `PrismaService` + `RedisService`; idempotent seed;
  readiness health check (DB + Redis).
- **Phase 2 — User Module.** User CRUD with argon2id hashing (hash never
  returned), pagination/sort/search/filter, email uniqueness, soft deletes;
  layered controller → service → repository.
- **Phase 3 — Authentication.** JWT access tokens, register/login, global
  `JwtAuthGuard` (opt-out via `@Public()`), `@CurrentUser()`, `/auth/me`.
- **Phase 4 — Refresh Tokens & Sessions.** Opaque, hashed, rotating refresh
  tokens with reuse detection; logout + logout-all.
- **Phase 5 — Authorization (RBAC).** Roles + permissions (`resource:action`),
  per-request permission resolution, `AuthorizationGuard`, `@Roles()` /
  `@Permissions()`, role-assignment endpoints.
- **Phase 6 — Cross-cutting Hardening.** Consistent success/error response
  envelopes, global exception filter, `x-request-id` correlation (CLS),
  Helmet, and rate limiting (`@nestjs/throttler`).
- **Phase 7 — Audit Logging.** Event-driven, append-only audit trail
  (`EventEmitter` → listener), with no FK to users so records survive deletion.
- **Phase 8 — File Management.** Multipart upload/download with a swappable
  storage adapter (local disk → S3), file metadata, soft deletes.
- **Phase 9 — Notifications.** In-app + email notifications, event-driven
  (welcome on registration), with a swappable mail transport.
- **Phase 10 — Security Depth.** Centralised password policy, account lockout,
  single-use/expiring password reset, change password, and TOTP 2FA (RFC 6238,
  implemented on Node `crypto`) with QR enrollment + one-time recovery codes.
- **Phase 11 — Observability & DevOps.** Structured logging (Pino) with
  request-id correlation and redaction; Prometheus `/metrics`; graceful
  shutdown; multi-stage `Dockerfile` + opt-in compose `app` service.

[Unreleased]: https://github.com/bhaskarreddygurram/-nestjs-enterprise-starter/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bhaskarreddygurram/-nestjs-enterprise-starter/releases/tag/v0.1.0
