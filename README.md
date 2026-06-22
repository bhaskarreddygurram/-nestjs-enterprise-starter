# Enterprise NestJS Backend Starter Kit

A reusable, production-grade backend platform built with **NestJS + TypeScript + PostgreSQL + Prisma + Redis**, designed to be the foundation for any application (CRM, ERP, HR, Inventory, SaaS, E-commerce, Booking, Property Management).

> 📐 Architecture & full roadmap: [`docs/ARCHITECTURE-ROADMAP.md`](docs/ARCHITECTURE-ROADMAP.md)
> 🚀 How to run (full guide — setup, Docker, DB, troubleshooting): [`docs/RUNNING-THE-PROJECT.md`](docs/RUNNING-THE-PROJECT.md)

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Project Foundation | ✅ Complete |
| 1 | Database Infrastructure (Prisma + Postgres + Redis) | ✅ Complete |
| 2 | User Module (CRUD, pagination, argon2 hashing) | ✅ Complete |
| 3 | Authentication (JWT login/register, global guard) | ✅ Complete |
| 4 | Refresh Tokens & Sessions (rotation + reuse detection) | ✅ Complete |
| 5 | Authorization (RBAC: roles + permissions) | ✅ Complete |
| 6 | Cross-cutting Hardening (envelopes, Helmet, rate limit) | ✅ Complete |
| 7 | Audit Logging (event-driven, immutable trail) | ✅ Complete |
| 8 | File Management (upload/download, storage adapter) | ✅ Complete |
| 9 | Notifications (in-app + email, event-driven) | ✅ Complete |
| 10 | Security Depth (2FA, password policy, lockout, reset) | ✅ Complete |
| 11 | Observability & DevOps (Pino logs, metrics, Docker) | ✅ Complete |
| 12 | CI/CD & Release | ⏳ Next |

## Tech Stack

- **Runtime:** Node.js 20+ / TypeScript 5 (strict)
- **Framework:** NestJS 11
- **Docs:** Swagger / OpenAPI
- **Validation:** class-validator + Joi (env)
- **Testing:** Jest + Supertest
- **Tooling:** ESLint (flat config) + Prettier

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Create your local environment file
cp .env.example .env

# 3. Start PostgreSQL + Redis
npm run docker:up

# 4. Generate the Prisma client and apply migrations
npm run prisma:generate
npm run prisma:migrate

# 5. (Optional) seed a baseline admin user
npm run db:seed

# 6. Run in watch mode
npm run start:dev
```

The API boots at `http://localhost:8000/api`.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/v1/health` | public | Liveness (process up) |
| `GET /api/v1/health/readiness` | public | Readiness (PostgreSQL + Redis reachable) |
| `GET /metrics` | public | Prometheus metrics (root path, no envelope) |
| `POST /api/v1/auth/register` | public | Create account, returns access + refresh token |
| `POST /api/v1/auth/login` | public | Log in, returns access + refresh token |
| `POST /api/v1/auth/refresh` | public | Rotate refresh token → new token pair |
| `POST /api/v1/auth/logout` | public | Revoke one refresh-token session |
| `POST /api/v1/auth/logout-all` | 🔒 Bearer | Revoke all sessions for the user |
| `GET /api/v1/auth/me` | 🔒 Bearer | Current user + resolved roles/permissions |
| `POST /api/v1/auth/forgot-password` | public | Email a password-reset link (always 204) |
| `POST /api/v1/auth/reset-password` | public | Set a new password using a reset token |
| `POST /api/v1/auth/change-password` | 🔒 Bearer | Change password (verifies current) |
| `POST /api/v1/auth/2fa/setup` | 🔒 Bearer | Begin TOTP enrollment (secret + QR) |
| `POST /api/v1/auth/2fa/enable` | 🔒 Bearer | Confirm 2FA, get recovery codes |
| `POST /api/v1/auth/2fa/disable` | 🔒 Bearer | Disable 2FA (needs a valid code) |
| `POST /api/v1/auth/2fa/authenticate` | public | Complete 2FA login (challenge + code → tokens) |
| `… /api/v1/users` | 🔒 + `user:*` | User CRUD — each route needs a permission |
| `GET /api/v1/roles` | 🔒 + `role:read` | List roles |
| `POST /api/v1/users/:id/roles` | 🔒 + `role:assign` | Assign a role to a user |
| `DELETE /api/v1/users/:id/roles/:role` | 🔒 + `role:assign` | Remove a role from a user |
| `GET /api/v1/audit-logs` | 🔒 + `audit:read` | List the audit trail (paginated, filterable) |
| `POST /api/v1/files` | 🔒 + `file:create` | Upload a file (multipart) |
| `GET /api/v1/files` | 🔒 + `file:read` | List files (paginated) |
| `GET /api/v1/files/:id/download` | 🔒 + `file:read` | Download file contents |
| `DELETE /api/v1/files/:id` | 🔒 + `file:delete` | Delete a file |
| `GET /api/v1/notifications` | 🔒 Bearer | List your notifications (paginated) |
| `GET /api/v1/notifications/unread-count` | 🔒 Bearer | Your unread count |
| `PATCH /api/v1/notifications/:id/read` | 🔒 Bearer | Mark one read |
| `POST /api/v1/notifications/read-all` | 🔒 Bearer | Mark all read |
| `GET /api/docs` | public | Swagger UI (use **Authorize** to send the token) |

Seeded dev login: `admin@example.com` / `Admin123!ChangeMe` (role `admin`, all permissions).

**RBAC model:** permission-based (`resource:action`). `@Roles()` / `@Permissions()` decorators are enforced by a global `AuthorizationGuard` that runs after the JWT guard. Permissions are resolved per-request from the user's roles.

**Response format (Phase 6):** every response is wrapped in a consistent envelope.

```jsonc
// success
{ "success": true, "statusCode": 200, "message": "Success",
  "data": { /* ... */ }, "meta": null,
  "timestamp": "...", "path": "/api/v1/...", "requestId": "..." }

// error
{ "success": false, "statusCode": 401, "message": "Invalid credentials",
  "errorCode": "UNAUTHORIZED", "errors": null,
  "timestamp": "...", "path": "/api/v1/...", "requestId": "..." }
```

Paginated lists put the array in `data` and pagination in `meta`. Health endpoints are exempt (native Terminus shape). Also active: **Helmet** headers, **`x-request-id`** correlation, per-request logging, and **rate limiting** (`429` when exceeded; auth routes stricter).

**Observability (Phase 11):**
- **Structured logging** — [Pino](https://getpino.io) via `nestjs-pino`: JSON logs in production, pretty-printed in dev, silenced in tests. Every line carries the request id (reused from `x-request-id`), so logs correlate with the response envelope and the audit trail. Sensitive headers are redacted.
- **Metrics** — Prometheus exposition at **`GET /metrics`** (root path, un-enveloped): Node/process defaults plus `http_request_duration_seconds` + `http_requests_total`, labelled by method, route *pattern* and status.
- **Graceful shutdown** — `enableShutdownHooks()` drains the DB/Redis connections on `SIGTERM`/`SIGINT`.
- **Containerized** — multi-stage `Dockerfile` + an `app` service (opt-in `app` profile) in `docker-compose.yml`.

**Security depth (Phase 10):**
- **Password policy** — a single `@IsStrongPassword()` decorator (8+ chars, upper/lower/digit/special) enforced on register, reset and change.
- **Account lockout** — after `SECURITY_MAX_LOGIN_ATTEMPTS` failed logins the account locks for `SECURITY_LOCKOUT_MINUTES`; a successful login clears the counter.
- **Password reset** — `forgot-password` emails a single-use, expiring token (only its SHA-256 hash is stored; always 204 to prevent enumeration); `reset-password` sets the new password and revokes all sessions.
- **TOTP 2FA** — RFC 6238 (implemented on Node `crypto`, no external OTP dep), with a QR code for enrollment and one-time recovery codes. With 2FA on, `login` returns a short-lived `challengeToken` instead of tokens; the client completes login at `/auth/2fa/authenticate`.

## Project Structure

```
src/
├── main.ts              # Bootstrap: prefix, versioning, validation, Swagger
├── app.module.ts        # Root module
└── core/                # App-wide infrastructure singletons
    ├── config/          # Typed config + env validation
    └── health/          # Health checks (Terminus)
```

(Folders `common/`, `modules/`, `shared/` are introduced in later phases — see the roadmap.)

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run start:dev` | Run with hot-reload |
| `npm run build` | Compile to `dist/` |
| `npm run lint` | Lint & auto-fix |
| `npm run format` | Format with Prettier |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:cov` | Coverage report |
| `npm run docker:up` | Start infra (PostgreSQL + Redis) |
| `npm run docker:app` | Build + run the full stack (app + infra) |

### Running the whole stack in Docker

```bash
# infra only (default) — run the app locally with npm run start:dev
npm run docker:up

# app + infra — builds the multi-stage image, runs migrations, then starts
npm run docker:app
# → API at http://localhost:8000/api/v1, metrics at http://localhost:8000/metrics
```

The `app` service lives behind a compose `app` profile, so `docker compose up` (infra) is unaffected by it.

## Configuration

All configuration is validated at boot (`src/core/config/env.validation.ts`). The app refuses to start with invalid config.

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment |
| `PORT` | `3000` | HTTP port |
| `API_PREFIX` | `api` | Global route prefix |
| `API_VERSION` | `v1` | Default API version |
| `SWAGGER_ENABLED` | `true` | Toggle Swagger UI |
| `CORS_ORIGINS` | `*` | Allowed origins (comma-separated) |
| `SECURITY_MAX_LOGIN_ATTEMPTS` | `5` | Failed logins before lockout |
| `SECURITY_LOCKOUT_MINUTES` | `15` | Lockout duration |
| `PASSWORD_RESET_TTL_MINUTES` | `30` | Reset-token lifetime |
| `APP_WEB_URL` | `http://localhost:3000` | Front-end base for the reset link |
| `TWO_FACTOR_ISSUER` | `Enterprise Starter` | Issuer shown in authenticator apps |
| `TWO_FACTOR_CHALLENGE_TTL` | `5m` | 2FA challenge-token lifetime |
| `LOG_LEVEL` | `info` | Pino level (`fatal`…`trace`, `silent`) |
| `METRICS_ENABLED` | `true` | Expose `GET /metrics` |

## License

MIT
