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
| 6 | Cross-cutting Hardening | ⏳ Next |
| 7+ | Audit, Files, Notifications, … | ⬜ Planned |

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
| `POST /api/v1/auth/register` | public | Create account, returns access + refresh token |
| `POST /api/v1/auth/login` | public | Log in, returns access + refresh token |
| `POST /api/v1/auth/refresh` | public | Rotate refresh token → new token pair |
| `POST /api/v1/auth/logout` | public | Revoke one refresh-token session |
| `POST /api/v1/auth/logout-all` | 🔒 Bearer | Revoke all sessions for the user |
| `GET /api/v1/auth/me` | 🔒 Bearer | Current user + resolved roles/permissions |
| `… /api/v1/users` | 🔒 + `user:*` | User CRUD — each route needs a permission |
| `GET /api/v1/roles` | 🔒 + `role:read` | List roles |
| `POST /api/v1/users/:id/roles` | 🔒 + `role:assign` | Assign a role to a user |
| `DELETE /api/v1/users/:id/roles/:role` | 🔒 + `role:assign` | Remove a role from a user |
| `GET /api/docs` | public | Swagger UI (use **Authorize** to send the token) |

Seeded dev login: `admin@example.com` / `Admin123!ChangeMe` (role `admin`, all permissions).

**RBAC model:** permission-based (`resource:action`). `@Roles()` / `@Permissions()` decorators are enforced by a global `AuthorizationGuard` that runs after the JWT guard. Permissions are resolved per-request from the user's roles.

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

## License

MIT
