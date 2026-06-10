# Enterprise NestJS Backend Starter Kit

A reusable, production-grade backend platform built with **NestJS + TypeScript + PostgreSQL + Prisma + Redis**, designed to be the foundation for any application (CRM, ERP, HR, Inventory, SaaS, E-commerce, Booking, Property Management).

> 📐 Architecture & full roadmap: [`docs/ARCHITECTURE-ROADMAP.md`](docs/ARCHITECTURE-ROADMAP.md)
> 🚀 How to run (full guide — setup, Docker, DB, troubleshooting): [`docs/RUNNING-THE-PROJECT.md`](docs/RUNNING-THE-PROJECT.md)

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Project Foundation | ✅ Complete |
| 1 | Database Infrastructure (Prisma + Postgres + Redis) | ✅ Complete |
| 2 | User Module (CRUD) | ⏳ Next |
| 3+ | Auth, RBAC, Audit, … | ⬜ Planned |

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

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/health` | Liveness (process up) |
| `GET /api/v1/health/readiness` | Readiness (PostgreSQL + Redis reachable) |
| `GET /api/docs` | Swagger UI |

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
