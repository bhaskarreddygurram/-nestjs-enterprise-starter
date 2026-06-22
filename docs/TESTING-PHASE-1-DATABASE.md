# Testing Guide — Phase 1: Database Infrastructure

> How to test the data layer: the Docker infra (PostgreSQL + Redis), Prisma (schema → migrate → generate), the connection lifecycle, the seed, and the **readiness** health check that pings both dependencies.
>
> Prior guide: [`TESTING-PHASE-0-FOUNDATION.md`](TESTING-PHASE-0-FOUNDATION.md) · Next: [`TESTING-PHASE-2-USERS.md`](TESTING-PHASE-2-USERS.md) · Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md)

---

## 0. Prerequisites

```powershell
npm run docker:up        # start PostgreSQL + Redis
npm run prisma:generate  # generate the typed Prisma client
npm run prisma:migrate   # apply migrations (creates the schema)
npm run db:seed          # baseline admin + roles/permissions
npm run start:dev
```

| Base URL | `http://localhost:8000/api/v1` |
|---|---|

---

## 1. Mental model

```
docker-compose ──► postgres:16  (enterprise_postgres, healthcheck: pg_isready)
                └► redis:7      (enterprise_redis,   healthcheck: redis-cli ping)

prisma/schema.prisma ──(migrate)──► tables    ──(generate)──► typed @prisma/client
                                                                    │
PrismaService (OnModuleInit $connect / OnModuleDestroy $disconnect) ┘
RedisService  (ioredis client, ping + primitives, graceful quit)

GET /health/readiness ──► pingCheck(database) + redis PING  ──► up / 503 down
```

- **Infra is disposable + reproducible:** one `docker compose up` brings up Postgres + Redis with health-checked containers and named volumes for persistence.
- **Schema is code:** `schema.prisma` is the single source of truth; migrations are versioned in `prisma/migrations/`.
- **Lifecycle-bound connections:** Prisma connects on module init and disconnects on destroy; Redis likewise — so shutdown is clean.
- **Readiness ≠ liveness:** readiness fails (503) when a dependency is down, telling an orchestrator "don't send traffic yet," without killing the process.

---

## 2. Verify the containers

```bash
docker compose ps
# both enterprise_postgres and enterprise_redis should be "Up (healthy)"

docker exec enterprise_postgres pg_isready -U postgres   # accepting connections
docker exec enterprise_redis redis-cli ping              # PONG
```

---

## 3. Readiness health check

```bash
curl -s http://localhost:8000/api/v1/health/readiness | jq .
```

```jsonc
{
  "status": "ok",
  "info":   { "database": { "status": "up" }, "redis": { "status": "up" } },
  "error":  {},
  "details":{ "database": { "status": "up" }, "redis": { "status": "up" } }
}
```

**Prove it actually checks dependencies** — stop Redis and watch readiness fail, then recover:

```bash
docker compose stop redis
curl -s -o /dev/null -w "redis down → %{http_code}\n" http://localhost:8000/api/v1/health/readiness   # 503
docker compose start redis
sleep 3
curl -s -o /dev/null -w "redis up   → %{http_code}\n" http://localhost:8000/api/v1/health/readiness   # 200
```

| Case | `/health` (liveness) | `/health/readiness` |
|---|---|---|
| All healthy | 200 | 200 |
| Redis or Postgres down | **200** (still alive) | **503** (not ready) |

---

## 4. Inspect the database

**psql (in the container):**

```bash
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c "\dt"   # list tables
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
  "SELECT email, is_active FROM users;"
```

**DBeaver / any client:**

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `enterprise_db` |
| User / Password | `postgres` / `postgres` |

(These come from `.env`; the `DATABASE_URL` the app uses is the same.)

**Prisma Studio (GUI):**

```bash
npm run prisma:studio    # opens a browser data explorer
```

---

## 5. Migrations & seed

```bash
# create + apply a new migration after editing schema.prisma
npm run prisma:migrate           # prisma migrate dev (interactive name)

# apply existing migrations without prompting (CI / prod)
npm run prisma:deploy            # prisma migrate deploy

# reset everything (drops data, re-applies, re-seeds) — DEV ONLY
npm run db:reset
```

The seed is **idempotent** (re-running it is safe): it upserts the admin user, the permission set, and the `admin`/`user` roles.

```bash
npm run db:seed
# → "Seed complete — admin user: admin@example.com ..."
```

---

## 6. Automated tests

```powershell
npm test            # RedisHealthIndicator unit test
npm run test:e2e    # app.e2e-spec.ts hits /health/readiness against real infra
```

| File | Covers |
|---|---|
| `src/core/health/indicators/redis.health.ts` (+ controller spec) | `up` on PONG, `down` on failure/unexpected reply |
| `test/app.e2e-spec.ts` | readiness reports both `database` and `redis` |

> The e2e suite needs the Docker infra running — it talks to a real Postgres + Redis.

---

## 7. Troubleshooting

| Symptom | Explanation / fix |
|---|---|
| `prisma migrate` can't connect | Containers not up/healthy — `npm run docker:up`, then `docker compose ps`. |
| `readiness` is 503 | A dependency is down — check `docker compose ps` and `docker compose logs postgres redis`. |
| `Can't reach database server` from the app | `DATABASE_URL` host should be `localhost` for local dev (it's `postgres` only inside the compose network). |
| Port 5432/6379 already allocated | Another Postgres/Redis is running locally — stop it or change `POSTGRES_PORT`/`REDIS_PORT`. |
| Drifted schema / weird migration state | `npm run db:reset` (dev only — wipes data). |
