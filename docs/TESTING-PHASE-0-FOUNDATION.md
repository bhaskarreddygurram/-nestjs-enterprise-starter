# Testing Guide — Phase 0: Foundation

> How to verify the project's foundation: typed + validated configuration (fail-fast), the global prefix & URI versioning, the global validation pipe, Helmet/CORS, the liveness health check, and Swagger.
>
> Next guide: [`TESTING-PHASE-1-DATABASE.md`](TESTING-PHASE-1-DATABASE.md) · Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md) · Architecture: [`ARCHITECTURE-ROADMAP.md`](ARCHITECTURE-ROADMAP.md)

---

## 0. Prerequisites

```powershell
npm install
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
npm run start:dev
```

| Base URL | `http://localhost:8000/api/v1` |
|---|---|

> Phase 0 is pure application scaffolding — no database calls yet (that's Phase 1). The config layer still *requires* a valid `DATABASE_URL` to be present, so keep the value from `.env.example`.

---

## 1. Mental model

The foundation establishes the conventions every later phase builds on:

```
process.env ─► Joi schema (env.validation.ts) ──► typed config (configuration.ts) ──► ConfigService
                     │ invalid? fail fast at boot                       (dot-notation keys)

HTTP request ─► global prefix (/api) ─► URI version (/v1) ─► ValidationPipe ─► controller
```

- **Fail-fast config:** the app refuses to boot on missing/invalid env, rather than blowing up later at runtime in a random place.
- **One source of truth for env:** raw `process.env` access is confined to `configuration.ts`; everything else reads `ConfigService`.
- **Consistent routing:** every route lives under `/api/v1` via a global prefix + URI versioning.
- **Strict input:** the global `ValidationPipe` strips unknown properties, rejects extras, and auto-transforms payloads.
- **Self-documenting:** Swagger/OpenAPI is generated from the controllers + DTO decorators.

---

## 2. What exists in Phase 0

| Endpoint | Auth | Result |
|----------|------|--------|
| `GET /api/v1/health` | public | Liveness — is the process up and responding? |
| `GET /api/docs` | public | Swagger UI |

---

## 3. Liveness health

```bash
curl -s http://localhost:8000/api/v1/health | jq .
```

```jsonc
{ "status": "ok", "info": {}, "error": {}, "details": {} }
```

- Returns **200** with `status: "ok"`.
- Liveness intentionally checks **no dependencies** — a transient DB/Redis blip must not make an orchestrator kill an otherwise-healthy process. (Dependency checks live in `/health/readiness`, added in Phase 1.)
- Note the native Terminus shape — health is exempt from the response envelope (added in Phase 6).

---

## 4. Config validation (fail-fast)

The app should refuse to start with invalid configuration. Prove it:

```powershell
# temporarily break a required var
$env:DATABASE_URL = "not-a-valid-url"
npm run start:dev
# → boots? No. It exits with a Joi validation error naming DATABASE_URL.
Remove-Item Env:\DATABASE_URL    # clean up, then rely on .env again
```

| Tampered env | Expected |
|---|---|
| `DATABASE_URL` missing / not a postgres URI | boot fails, error names the variable |
| `PORT=not-a-number` | boot fails (must be a valid port) |
| `LOG_LEVEL=loud` | boot fails (must be a known pino level) |
| valid `.env` | boots cleanly |

---

## 5. Routing, versioning & validation

```bash
# global prefix + version are required
curl -s -o /dev/null -w "no prefix      → %{http_code}\n" http://localhost:8000/health          # 404
curl -s -o /dev/null -w "prefix+version → %{http_code}\n" http://localhost:8000/api/v1/health    # 200
```

The `ValidationPipe` is global, so once endpoints with bodies exist (Phase 2+) unknown fields are rejected with **400** and DTO types are coerced. You can see the effect immediately on any future POST with an extra property.

---

## 6. Swagger

1. Open **`http://localhost:8000/api/docs`**.
2. The UI lists the available endpoints grouped by `@ApiTags`.
3. As later phases add modules, their routes + DTO schemas appear here automatically.

---

## 7. Security headers (Helmet) & CORS

```bash
curl -s -D - http://localhost:8000/api/v1/health -o /dev/null | grep -iE "x-dns-prefetch-control|x-frame-options|x-content-type-options|strict-transport"
```

You should see Helmet's hardening headers. CORS is driven by `CORS_ORIGINS` (`*` by default).

---

## 8. Automated tests

```powershell
npm test            # includes the health controller unit test
npm run test:e2e    # includes test/app.e2e-spec.ts (liveness)
```

| File | Covers |
|---|---|
| `src/core/health/health.controller.spec.ts` | liveness returns `ok` |
| `test/app.e2e-spec.ts` | `GET /api/v1/health` → 200 against the booted app |

---

## 9. Troubleshooting

| Symptom | Explanation / fix |
|---|---|
| App won't boot, Joi error | A required env var is missing/invalid — the message names it. Compare your `.env` to `.env.example`. |
| `404` on `/health` | Missing the prefix/version — use `/api/v1/health`. |
| Swagger 404 | `SWAGGER_ENABLED=false`, or you used `/api/v1/docs` — it's at `/api/docs`. |
| Port already in use | Another process holds `PORT` (8000) — stop it or change `PORT`. |
