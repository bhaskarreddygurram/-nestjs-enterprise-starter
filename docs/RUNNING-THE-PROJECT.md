# Running the Project — Full Guide

> Step-by-step operations manual for the Enterprise NestJS Starter Kit.
> Covers: prerequisites, first-time setup, Docker, database access, daily workflow, testing, and troubleshooting.
>
> 📐 Architecture & roadmap: [`ARCHITECTURE-ROADMAP.md`](ARCHITECTURE-ROADMAP.md)

---

## 1. Prerequisites

| Tool | Version (tested) | Check with | Get it from |
|---|---|---|---|
| Node.js | 20+ (project tested on 24.x) | `node --version` | https://nodejs.org |
| npm | 10+ | `npm --version` | bundled with Node |
| Docker Desktop | 4.x+ (engine 29.x) | `docker --version` | https://docker.com/products/docker-desktop |
| Git | 2.40+ | `git --version` | https://git-scm.com |
| DBeaver *(optional)* | any recent | — | https://dbeaver.io |

> **Windows note:** Docker Desktop must be **running** (whale icon in the system tray) before any `docker` command works. Starting it takes ~30–60 s after login.

---

## 2. First-Time Setup (once per machine)

Run everything from the project root (`D:\Projects\NodeJS`).

```bash
# 1. Clone (skip if you already have the folder)
git clone https://github.com/bhaskarreddygurram/-nestjs-enterprise-starter.git
cd -nestjs-enterprise-starter

# 2. Install dependencies
npm install

# 3. Create your local environment file from the template
cp .env.example .env        # PowerShell: Copy-Item .env.example .env

# 4. Start the infrastructure (PostgreSQL + Redis containers)
npm run docker:up

# 5. Generate the Prisma client (typed DB access code)
npm run prisma:generate

# 6. Apply database migrations (creates the tables)
npm run prisma:migrate

# 7. Seed baseline data (admin user — idempotent, safe to re-run)
npm run db:seed

# 8. Start the app
npm run start:dev
```

**You're done when you see:**

```
[Bootstrap] Swagger docs available at /api/docs
[Bootstrap] Application running on http://localhost:8000/api
```

Open **http://localhost:8000/api/docs** — that's the Swagger UI listing every endpoint.

---

## 3. Daily Workflow (every time you work)

```bash
# 1. Make sure Docker Desktop is running (tray icon)

# 2. Start Postgres + Redis (no-op if already running)
npm run docker:up

# 3. Start the app with hot-reload
npm run start:dev

# ... code away — the app restarts automatically on save ...

# 4. When finished:
#    Ctrl + C            → stops the app
npm run docker:down      # → stops the containers (optional; data survives)
```

> 💡 Container data is stored in named Docker volumes (`postgres_data`, `redis_data`), so **stopping containers does NOT delete your data**. See §7 for how to wipe.

---

## 4. URLs & Endpoints

With the app running (`PORT=8000` from `.env`):

| URL | What it is |
|---|---|
| http://localhost:8000/api/docs | **Swagger UI** — interactive API documentation ("Try it out" executes real requests) |
| http://localhost:8000/api/docs-json | Raw OpenAPI spec (import into Postman/Insomnia) |
| http://localhost:8000/api/v1/health | Liveness — is the process up? |
| http://localhost:8000/api/v1/health/readiness | Readiness — are PostgreSQL **and** Redis reachable? |

Quick test from a terminal:

```bash
curl http://localhost:8000/api/v1/health/readiness
# → {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}}, ...}
```

---

## 5. Docker — Managing the Infrastructure

The infra is defined in [`docker-compose.yml`](../docker-compose.yml): **PostgreSQL 16** + **Redis 7**, both with healthchecks.

| Command | What it does |
|---|---|
| `npm run docker:up` | Start both containers in the background |
| `npm run docker:down` | Stop and remove containers (volumes/data survive) |
| `npm run docker:logs` | Tail live logs of both containers (Ctrl+C to exit) |
| `docker ps` | List running containers — look for `(healthy)` |
| `docker compose restart postgres` | Restart just Postgres |
| `docker compose down -v` | ⚠️ Stop containers **and delete all data** (volumes) |

Healthy state looks like this:

```
$ docker ps
NAMES                 STATUS
enterprise_postgres   Up 2 minutes (healthy)
enterprise_redis      Up 2 minutes (healthy)
```

### Container ↔ host mapping

| Service | Container | Host port | Credentials (from `.env`) |
|---|---|---|---|
| PostgreSQL 16 | `enterprise_postgres` | `5432` | user `postgres` / pass `postgres` / db `enterprise_db` |
| Redis 7 | `enterprise_redis` | `6379` | no password (dev) |

---

## 6. Database — Access & Management

The database `enterprise_db` is **created automatically** by the Postgres container (from `POSTGRES_DB` in `.env`). Tables are created by **Prisma migrations** — never by hand.

### Option A — DBeaver (GUI)

1. **Database → New Database Connection → PostgreSQL → Next**
2. Fill in:

   | Field | Value |
   |---|---|
   | Host | `localhost` |
   | Port | `5432` |
   | Database | `enterprise_db` |
   | Username | `postgres` |
   | Password | `postgres` (tick *Save password*) |

3. **Test Connection** (first time: let DBeaver download the JDBC driver) → **Finish**
4. Browse: **enterprise_db → Schemas → public → Tables → `users`** → *Data* tab

### Option B — Prisma Studio (built-in GUI)

```bash
npm run prisma:studio
# → opens http://localhost:5555 — browse & edit rows visually
```

### Option C — psql (terminal, inside the container)

```bash
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db

# Useful commands inside psql:
#   \dt              list tables
#   \d users         describe the users table
#   SELECT * FROM users;
#   \q               quit
```

### Redis CLI (bonus)

```bash
docker exec -it enterprise_redis redis-cli
#   PING        → PONG
#   KEYS *      → list keys
#   exit
```

### Prisma / migration commands

| Command | When to use it |
|---|---|
| `npm run prisma:generate` | After every change to `prisma/schema.prisma` (regenerates the typed client) |
| `npm run prisma:migrate` | After schema changes — creates **and applies** a new migration (dev) |
| `npm run prisma:deploy` | Apply existing migrations without creating new ones (CI/prod) |
| `npm run db:seed` | Insert baseline data (idempotent — safe to re-run) |
| `npm run db:reset` | ⚠️ Drop DB → re-apply all migrations → re-seed (full clean slate) |

**Typical schema-change flow:**

```bash
# 1. Edit prisma/schema.prisma
# 2. Create + apply a migration with a descriptive name:
npx prisma migrate dev --name add_phone_to_users
# 3. The client regenerates automatically; restart the app if needed
```

---

## 7. Resetting Things (clean-slate recipes)

| I want to… | Run |
|---|---|
| Re-seed data only | `npm run db:seed` |
| Wipe DB + rerun migrations + seed | `npm run db:reset` |
| Nuke containers **and** all data, start fresh | `docker compose down -v && npm run docker:up && npm run prisma:migrate && npm run db:seed` |
| Reinstall node modules | `rm -rf node_modules && npm install && npm run prisma:generate` |

---

## 8. Testing & Quality Gates

| Command | What it runs | Needs Docker? |
|---|---|---|
| `npm test` | Unit tests (mocked deps) | ❌ No |
| `npm run test:e2e` | End-to-end HTTP tests against the real app | ✅ **Yes** (`docker:up` first) |
| `npm run test:cov` | Unit tests + coverage report (`coverage/`) | ❌ No |
| `npm run lint` | ESLint with auto-fix | ❌ No |
| `npm run format` | Prettier over `src/` and `test/` | ❌ No |
| `npm run build` | Compile TypeScript to `dist/` | ❌ No |

**Full pre-commit check:**

```bash
npm run lint && npm run build && npm test && npm run test:e2e
```

---

## 9. All npm Scripts — Reference

| Script | Purpose |
|---|---|
| `start:dev` | Run with hot-reload (development) |
| `start:debug` | Hot-reload + Node inspector (attach a debugger) |
| `start:prod` | Run the compiled build (`dist/main`) |
| `build` | Compile to `dist/` |
| `lint` / `format` | Code quality / formatting |
| `test` / `test:watch` / `test:cov` / `test:e2e` | Tests |
| `prisma:generate` | Regenerate the Prisma client |
| `prisma:migrate` | Create + apply a dev migration |
| `prisma:deploy` | Apply migrations (CI/prod) |
| `prisma:studio` | DB browser on :5555 |
| `db:seed` | Seed baseline data |
| `db:reset` | Drop + remigrate + reseed |
| `docker:up` / `docker:down` / `docker:logs` | Manage Postgres + Redis containers |

---

## 10. Environment Variables (`.env`)

`.env` is **git-ignored** (machine-local). `.env.example` is the committed template. The app **refuses to boot** if validation fails (see `src/core/config/env.validation.ts`) — that's intentional fail-fast behavior.

| Variable | Default | Meaning |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `8000` | HTTP port the API listens on |
| `API_PREFIX` | `api` | Global URL prefix |
| `API_VERSION` | `v1` | Default API version (URI versioning) |
| `SWAGGER_ENABLED` | `true` | Toggle Swagger UI |
| `CORS_ORIGINS` | `*` | Allowed origins, comma-separated |
| `POSTGRES_USER` | `postgres` | Container superuser (compose) |
| `POSTGRES_PASSWORD` | `postgres` | Container password (compose) |
| `POSTGRES_DB` | `enterprise_db` | Database name (auto-created) |
| `POSTGRES_PORT` | `5432` | Host port mapped to the container |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/enterprise_db?schema=public` | Connection string used by Prisma & the app |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Redis connection |
| `REDIS_PASSWORD` | *(empty)* | No password in dev |
| `REDIS_DB` | `0` | Redis logical DB index |

> ⚠️ If you change `POSTGRES_PORT`, update the port inside `DATABASE_URL` too — they must match.

---

## 11. Troubleshooting

### ❌ `EADDRINUSE: address already in use :::8000`
Another process (usually a previous run) holds the port.

```powershell
# Find the PID listening on the port
netstat -ano | findstr :8000 | findstr LISTENING
# Kill it (replace <PID>)
taskkill /F /PID <PID>
```

### ❌ `docker: ... cannot connect to the Docker daemon`
Docker Desktop isn't running. Start it from the Start menu, wait for the whale icon to settle, retry.

### ❌ App boots but `/health/readiness` says `database: down`
- Containers not running → `npm run docker:up`, then `docker ps` (wait for `(healthy)`).
- Wrong `DATABASE_URL` in `.env` (host/port/credentials).

### ❌ `P1001: Can't reach database server` (Prisma)
Same causes as above — Postgres isn't reachable on `localhost:5432`.

### ❌ Port 5432 conflict (you have a local PostgreSQL installed)
Change `POSTGRES_PORT=5433` in `.env`, update `DATABASE_URL` to `...@localhost:5433/...`, then `npm run docker:down && npm run docker:up`.

### ❌ `Error: @prisma/client did not initialize yet`
The client wasn't generated → `npm run prisma:generate`.

### ❌ Config validation error at boot (`"DATABASE_URL" is required`)
Your `.env` is missing or incomplete → `cp .env.example .env` and fill in values.

### ❌ E2E tests fail with `Connection is closed` / `ECONNREFUSED`
E2E tests boot the real app, which needs the infra → `npm run docker:up` first.

### ❌ Windows: `cp` not recognized in PowerShell
Use `Copy-Item .env.example .env` (or run the command in Git Bash).

---

## 12. Project Cheat Sheet (TL;DR)

```bash
npm run docker:up      # 1. infra up
npm run start:dev      # 2. app up  → http://localhost:8000/api/docs
npm test               # 3. quality gate
npm run docker:down    # 4. infra down when done
```
