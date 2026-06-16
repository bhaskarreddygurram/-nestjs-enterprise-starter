# Testing Guide — Phase 6: Cross-cutting Hardening

> How to verify the consistent response/error envelopes, request-id correlation, Helmet headers, and rate limiting — by hand (Swagger, PowerShell, curl) and via the automated suite.
>
> Prior guides: [`TESTING-PHASE-5-RBAC.md`](TESTING-PHASE-5-RBAC.md) · Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md)

---

## 0. Prerequisites

```powershell
npm run docker:up
npm run prisma:migrate
npm run db:seed
npm run start:dev        # dev mode → rate limiting is ACTIVE
```

| Base URL | `http://localhost:8000/api/v1` |
|---|---|
| Admin | `admin@example.com` / `Admin123!ChangeMe` |

> ⚠️ Rate limiting is **disabled under `NODE_ENV=test`** (so the e2e suite isn't throttled). To see `429` live, run the app normally (`start:dev`, which is `development`).

---

## 1. What changed in Phase 6

Every response now goes through two cross-cutting layers:

| Feature | Effect you can observe |
|---|---|
| **Success envelope** | Bodies are wrapped: real payload moves under `data` |
| **Error envelope** | Errors have a consistent shape with `errorCode` |
| **`x-request-id`** | Every response carries a correlation id header |
| **Helmet** | Security headers on every response |
| **Rate limiting** | Too many requests → `429 Too Many Requests` |

> 🔑 **Clients now read `response.data`.** `GET /users` → the array is at `res.body.data`, pagination at `res.body.meta`. `POST /auth/login` → token at `res.body.data.accessToken`.
> **Exception:** `/health` keeps its native Terminus shape (not wrapped).

---

## 2. Response envelopes

### Success envelope
```jsonc
{
  "success": true,
  "statusCode": 200,
  "message": "Success",
  "data": { /* the actual payload */ },
  "meta": null,                 // pagination lives here for list endpoints
  "timestamp": "2026-06-16T20:17:00.000Z",
  "path": "/api/v1/auth/login",
  "requestId": "0aab6d06-84e6-4be0-aa2b-90cefd28a66a"
}
```

### Error envelope
```jsonc
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid credentials",
  "errorCode": "UNAUTHORIZED",
  "errors": null,
  "timestamp": "2026-06-16T20:17:55.000Z",
  "path": "/api/v1/auth/login",
  "requestId": "..."
}
```

### Validation error (class-validator)
```jsonc
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "errors": [
    { "message": "email must be an email" },
    { "message": "password must be longer than or equal to 8 characters" }
  ],
  "path": "/api/v1/auth/register",
  "requestId": "..."
}
```

**`errorCode` values:** `BAD_REQUEST`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, `RATE_LIMITED`, `INTERNAL_ERROR`.

### Paginated list
```jsonc
{
  "success": true,
  "statusCode": 200,
  "data": [ { "id": "...", "email": "..." } ],   // the array
  "meta": { "page": 1, "limit": 20, "totalItems": 3, "totalPages": 1, "hasNext": false, "hasPrev": false },
  "path": "/api/v1/users",
  "requestId": "..."
}
```

---

## 3. PowerShell checks

```powershell
$base = "http://localhost:8000/api/v1"

# success envelope
$login = Invoke-RestMethod "$base/auth/login" -Method Post -ContentType application/json -Body (@{
  email="admin@example.com"; password="Admin123!ChangeMe" } | ConvertTo-Json)
$login | Select-Object success, statusCode, path, requestId
$token = $login.data.accessToken          # <-- note: .data.accessToken now

# error envelope (capture the failing response body)
try {
  Invoke-RestMethod "$base/auth/login" -Method Post -ContentType application/json -Body (@{
    email="admin@example.com"; password="wrong" } | ConvertTo-Json)
} catch {
  $_.ErrorDetails.Message    # the JSON error envelope
}

# x-request-id + helmet headers
$resp = Invoke-WebRequest "$base/health"
$resp.Headers["x-request-id"]
$resp.Headers["X-Content-Type-Options"]   # nosniff
$resp.Headers["X-Frame-Options"]          # SAMEORIGIN
```

---

## 4. curl checks

```bash
base=http://localhost:8000/api/v1

# 1. success envelope (pretty)
curl -s -X POST $base/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!ChangeMe"}' | jq

# 2. error envelope
curl -s -X POST $base/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"wrong"}' | jq '{success,statusCode,errorCode,message}'

# 3. validation envelope
curl -s -X POST $base/auth/register -H "Content-Type: application/json" \
  -d '{"email":"notanemail","password":"short"}' | jq '{errorCode, errors}'

# 4. headers: helmet + correlation id
curl -s -D - -o /dev/null $base/health | grep -iE "x-request-id|x-content-type-options|x-frame-options|strict-transport"

# 5. request-id is honored if you send one
curl -s -D - -o /dev/null -H "x-request-id: my-trace-123" $base/health | grep -i x-request-id
#   → x-request-id: my-trace-123
```

---

## 5. Rate limiting (the 429)

Limits: **global 100 / 60s**, **auth `login` + `register` 10 / 60s** (per IP). Exceeding returns `429`.

```bash
base=http://localhost:8000/api/v1
# Fire 13 logins quickly → first ~10 return 401, the rest 429
for i in $(seq 1 13); do
  curl -s -o /dev/null -w "%{http_code} " -X POST $base/auth/login \
    -H "Content-Type: application/json" -d '{"email":"admin@example.com","password":"wrong"}'
done; echo
# Expected: 401 401 401 ... 429 429 429
```

PowerShell:
```powershell
$base = "http://localhost:8000/api/v1"
1..13 | ForEach-Object {
  try { Invoke-WebRequest "$base/auth/login" -Method Post -ContentType application/json `
    -Body '{"email":"admin@example.com","password":"wrong"}' | Out-Null; "200" }
  catch { $_.Exception.Response.StatusCode.value__ }
}
```

The `429` body is the standard error envelope with `"errorCode": "RATE_LIMITED"`. Wait 60s for the window to reset.

> The global throttler also protects every other route at 100/60s. To test that, loop any endpoint >100 times within a minute.

---

## 6. Request-id correlation

1. Make any request and note the `x-request-id` response header.
2. Look at the server console — the matching log line ends with `[<that-id>]`:
   ```
   [HTTP] POST /api/v1/auth/login 200 12ms [0aab6d06-84e6-4be0-aa2b-90cefd28a66a]
   ```
3. The same id appears in the response body's `requestId`. Send your own via the `x-request-id` request header and it's preserved end-to-end — this is how you trace one request across logs.

---

## 7. Automated tests

```powershell
npm test            # unit: TransformInterceptor (4) + GlobalExceptionFilter (4)
npm run test:e2e    # e2e: every suite now asserts the enveloped shape
```

| File | Covers |
|---|---|
| `src/common/interceptors/transform.interceptor.spec.ts` | wraps objects, lifts pagination meta, respects `@SkipResponseTransform`, passes through 204 |
| `src/common/filters/global-exception.filter.spec.ts` | conflict→envelope, validation array→`VALIDATION_ERROR`+errors, unknown→safe 500, generic status mapping |
| all `test/*.e2e-spec.ts` | read `res.body.data.*`; health stays native |

> Rate limiting is intentionally **not** e2e-tested (the guard skips under `NODE_ENV=test`). It's verified by the live `429` smoke in §5.

---

## 8. Gotchas / troubleshooting

| Symptom | Explanation / fix |
|---|---|
| "My old client broke — `accessToken` is undefined" | It moved: read `res.body.data.accessToken`. All payloads are under `data` now. |
| Never see a `429` | You're under `NODE_ENV=test`, or under the limit. Use `start:dev` and fire >10 auth calls in 60s. |
| `/health` body isn't wrapped | Intentional — health is `@SkipResponseTransform()` for orchestrator compatibility. |
| Want stricter/looser limits | Set `THROTTLE_TTL` / `THROTTLE_LIMIT` in `.env`; auth-route limits are in `auth.controller.ts` (`@Throttle`). |
| Need rate limiting across multiple instances | Swap the default in-memory store for Redis (`@nest-lab/throttler-storage-redis`) — Redis is already wired. |
| Tracing a failing request in logs | Grab `requestId` from the response and grep the server logs for it. |
