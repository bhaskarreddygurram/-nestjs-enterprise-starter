# Testing Guide — Phase 11: Observability & DevOps

> How to test the observability features added in this phase — **structured logging (Pino)**, **request-id correlation**, **Prometheus `/metrics`**, **graceful shutdown**, and the **production Docker image** — by hand and via the automated suite.
>
> Prior guides: [`TESTING-PHASE-10-SECURITY-DEPTH.md`](TESTING-PHASE-10-SECURITY-DEPTH.md) · Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md)

---

## 0. Prerequisites

```powershell
npm run docker:up        # PostgreSQL + Redis
npm run prisma:migrate
npm run db:seed
npm run start:dev        # dev: pretty-printed Pino logs in this terminal
```

| Base URL | `http://localhost:8000` |
|---|---|

> 📝 In **development** logs are pretty-printed; in **production** (`NODE_ENV=production`) they're raw JSON; under **test** they're silenced. Control verbosity with `LOG_LEVEL`.

---

## 1. Mental model

```
request ─► [pino-http middleware]   sets/echoes x-request-id, starts timer
              │                       (CLS middleware reuses the same id)
              ▼
          guards → interceptors → controller → service
              │                                    │
   [MetricsInterceptor] on response 'finish' ──────┘ records duration + count
              │
   [pino-http] logs one structured line: { req:{id,method,url}, res:{statusCode}, responseTime }
```

- **One request id everywhere.** The inbound `x-request-id` header (or a generated UUID) flows into the log line (`req.id`), the response header, the response envelope (`requestId`), and the audit trail (via CLS) — so a single id ties a request together across all of them.
- **Logs are structured.** Nest's own logs and HTTP logs all go through Pino. Sensitive headers (`authorization`, `cookie`, `x-api-key`) are redacted.
- **Metrics are pull-based.** Prometheus scrapes `GET /metrics`; the route label uses the matched *pattern* (`/api/v1/users/:id`) to keep cardinality bounded.
- **Health & metrics are not logged** (they'd be noisy under constant scraping).

---

## 2. Structured logging

Watch the `start:dev` console while you hit an endpoint:

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" -d '{"email":"x@y.com","password":"bad"}' | jq .requestId
```

Expect a log line like (pretty in dev):

```
[10:11:12.345] INFO: request completed {"req":{"id":"<UUID>","method":"POST","url":"/api/v1/auth/login"},"res":{"statusCode":401},"responseTime":12}
```

**Correlation check:** the `req.id` in that log line equals the `requestId` field in the JSON response body. Supply your own to trace it:

```bash
curl -s -D - -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" -H "x-request-id: trace-abc-123" \
  -d '{"email":"x@y.com","password":"bad"}' -o /dev/null | grep -i x-request-id
# → x-request-id: trace-abc-123   (and the same id appears in the log line + envelope)
```

| Check | Expected |
|---|---|
| Response carries an `x-request-id` header | always |
| Client-supplied `x-request-id` is reused | yes (header + log + envelope match) |
| `GET /api/v1/health` appears in logs | no (ignored) |
| `Authorization` header value in logs | redacted (removed) |
| Production JSON logs | set `NODE_ENV=production` → one JSON object per line |

---

## 3. Prometheus metrics

`/metrics` is at the **root** (no `/api/v1` prefix) so standard scrapers find it.

```bash
# generate some traffic first
curl -s http://localhost:8000/api/v1/auth/login -X POST \
  -H "Content-Type: application/json" -d '{"email":"a@b.com","password":"x"}' > /dev/null

curl -s http://localhost:8000/metrics | grep -E "http_requests_total|http_request_duration_seconds_count|process_cpu"
```

You should see samples such as:

```
http_requests_total{method="POST",route="/api/v1/auth/login",status_code="401"} 1
http_request_duration_seconds_bucket{le="0.05",method="POST",route="/api/v1/auth/login",status_code="401"} 1
process_cpu_user_seconds_total 0.12
```

| Check | Expected |
|---|---|
| `GET /metrics` | **200**, `Content-Type: text/plain; ...; version=0.0.4` |
| Response is the raw exposition format | yes — **not** wrapped in the `{ success, data }` envelope |
| `GET /api/v1/metrics` (prefixed) | **404** (the endpoint is root-only) |
| Route label uses the pattern, not the id | e.g. `route="/api/v1/users/:id"`, not the concrete UUID |
| Disable it | set `METRICS_ENABLED=false` → `/metrics` returns **404** |

> ⚙️ A minimal Prometheus scrape config:
> ```yaml
> scrape_configs:
>   - job_name: enterprise-app
>     static_configs: [{ targets: ['localhost:8000'] }]
> ```

---

## 4. Graceful shutdown

`enableShutdownHooks()` ties `SIGTERM`/`SIGINT` to Nest's lifecycle, so the DB and Redis connections drain on stop.

```bash
# with the server running, press Ctrl+C (or send SIGTERM) and watch the logs:
#   INFO: Disconnected from PostgreSQL {"context":"PrismaService"}
#   INFO: Disconnected from Redis      {"context":"RedisService"}
```

In containers this is what lets `docker stop` / Kubernetes pod termination shut down cleanly instead of being force-killed.

---

## 5. Running the whole stack in Docker

```bash
# build the multi-stage image + run app and infra together
npm run docker:app        # = docker compose --profile app up -d --build

docker compose ps                       # app + postgres + redis, all healthy
curl -s http://localhost:8000/api/v1/health
curl -s http://localhost:8000/metrics | head -5
docker compose logs -f app              # JSON logs (NODE_ENV=production in the image)

docker compose --profile app down
```

| Check | Expected |
|---|---|
| Image builds | multi-stage; native `argon2` compiles in the builder stage |
| App container becomes healthy | health check hits `/api/v1/health` |
| Migrations run on start | `prisma migrate deploy` runs before the server boots |
| Logs in the container | raw JSON (production) |
| `docker compose up` without `--profile app` | infra only (app service is opt-in) |

---

## 6. Automated tests

```powershell
npm test            # unit
npm run test:e2e    # includes test/observability.e2e-spec.ts
```

| File | Covers |
|---|---|
| `src/core/metrics/metrics.service.spec.ts` | content type, default process metrics, HTTP histogram + counter recording with labels |
| `test/observability.e2e-spec.ts` | `/metrics` served at root un-enveloped; `/api/v1/metrics` 404; client `x-request-id` echoed into header + envelope; a generated id when none supplied |

---

## 7. Troubleshooting

| Symptom | Explanation / fix |
|---|---|
| Logs are JSON in dev (not pretty) | `NODE_ENV` isn't `development`, or `pino-pretty` isn't installed (it's a dev dependency). |
| No logs at all | `LOG_LEVEL=silent`, or `NODE_ENV=test`. Raise the level. |
| `/metrics` returns 404 | `METRICS_ENABLED=false`, or you hit `/api/v1/metrics` — it's at the root `/metrics`. |
| Metrics label cardinality looks high | Make sure routes are matched (a 404 logs `route="unknown"`); concrete ids should appear as `:id`. |
| Want logs shipped somewhere | Pino emits JSON in prod — pipe stdout to Loki/ELK/Datadog, or add a Pino transport. |
| Container won't start | Check `docker compose logs app`; most often a bad `DATABASE_URL` (inside the network the host is `postgres`, not `localhost`). |
