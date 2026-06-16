# Testing Guide — Phase 4: Refresh Tokens & Sessions

> How to test refresh-token **rotation**, **reuse detection**, and **logout / logout-all** by hand (Swagger, PowerShell, curl) and via the automated suite.
>
> Builds on Phase 3: [`TESTING-PHASE-3-AUTH.md`](TESTING-PHASE-3-AUTH.md) · Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md)

---

## 0. Prerequisites

```powershell
npm run docker:up        # PostgreSQL + Redis (wait for "healthy")
npm run prisma:migrate   # applies the refresh_tokens table
npm run db:seed          # admin user
npm run start:dev        # API on http://localhost:8000/api
```

| Base URL | `http://localhost:8000/api/v1` |
|---|---|
| Swagger | `http://localhost:8000/api/docs` |
| Seeded login | `admin@example.com` / `Admin123!ChangeMe` |

---

## 1. The mental model (read this first)

Every successful **login** / **register** / **refresh** returns **two** tokens:

| Token | Lifetime | Use |
|---|---|---|
| `accessToken` (JWT) | 15 min | Sent as `Authorization: Bearer <token>` on protected calls |
| `refreshToken` (opaque `<uuid>.<secret>`) | 7 days | Exchanged at `POST /auth/refresh` to get a **new pair** |

**Rotation:** each time you call `/auth/refresh`, the refresh token you sent is **revoked** and you receive a brand-new one. Always keep the latest.

**Reuse detection:** if you send a refresh token that was **already rotated** (used once), the server assumes it was stolen, returns `401`, **and revokes every session for that user** — so the thief *and* the legitimate user are logged out. This is the key security behaviour to test.

---

## 2. Endpoint map

| # | Method | Path | Auth | Body | Expected |
|---|--------|------|------|------|----------|
| 1 | POST | `/auth/refresh` | 🔓 public | `{ refreshToken }` | `200` new pair |
| 2 | POST | `/auth/logout` | 🔓 public | `{ refreshToken }` | `204` (idempotent) |
| 3 | POST | `/auth/logout-all` | 🔒 Bearer | — | `204` |

*(register/login/me from Phase 3 still apply — login/register now also return `refreshToken`.)*

---

## 3. Option A — Swagger UI

1. Open `/api/docs` → **Auth → POST /auth/login** → Execute with the seeded admin.
2. Copy **`refreshToken`** from the response.
3. **Auth → POST /auth/refresh** → Try it out → body:
   ```json
   { "refreshToken": "<paste refreshToken here>" }
   ```
   Execute → **200**, you get a *new* `refreshToken`.
4. **Reuse test:** run `/auth/refresh` **again with the same (old) token** → **401**.
5. **Family revoked:** try `/auth/refresh` with the *new* token from step 3 → also **401** (the reuse in step 4 killed all sessions).
6. **logout-all** needs auth: click **Authorize**, paste an `accessToken`, then **POST /auth/logout-all** → **204**.

---

## 4. Option B — PowerShell (full lifecycle script)

```powershell
$base = "http://localhost:8000/api/v1"

# --- login → capture both tokens ---
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{
  email = "admin@example.com"; password = "Admin123!ChangeMe"
} | ConvertTo-Json)
$rt1 = $login.refreshToken
"refresh #1: $($rt1.Substring(0,45))..."

# --- rotate: refresh → new pair ---
$r2  = Invoke-RestMethod -Uri "$base/auth/refresh" -Method Post -ContentType "application/json" -Body (@{ refreshToken = $rt1 } | ConvertTo-Json)
$rt2 = $r2.refreshToken
"refresh #2: $($rt2.Substring(0,45))...   (rt1 is now revoked)"

# --- reuse the OLD token → expect 401, kills the family ---
try { Invoke-RestMethod -Uri "$base/auth/refresh" -Method Post -ContentType "application/json" -Body (@{ refreshToken = $rt1 } | ConvertTo-Json) }
catch { "reuse rt1 → $($_.Exception.Response.StatusCode.value__)" }   # 401

# --- rt2 is now dead too (family revoked) ---
try { Invoke-RestMethod -Uri "$base/auth/refresh" -Method Post -ContentType "application/json" -Body (@{ refreshToken = $rt2 } | ConvertTo-Json) }
catch { "rt2 after reuse → $($_.Exception.Response.StatusCode.value__)" }  # 401
```

### Logout (single session)
```powershell
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email="admin@example.com"; password="Admin123!ChangeMe" } | ConvertTo-Json)
Invoke-RestMethod -Uri "$base/auth/logout" -Method Post -ContentType "application/json" -Body (@{ refreshToken = $login.refreshToken } | ConvertTo-Json)   # 204
# That refresh token no longer works:
try { Invoke-RestMethod -Uri "$base/auth/refresh" -Method Post -ContentType "application/json" -Body (@{ refreshToken = $login.refreshToken } | ConvertTo-Json) } catch { "after logout → $($_.Exception.Response.StatusCode.value__)" }  # 401
```

### Logout-all (every session)
```powershell
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email="admin@example.com"; password="Admin123!ChangeMe" } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
Invoke-RestMethod -Uri "$base/auth/logout-all" -Method Post -Headers $headers   # 204
```

---

## 5. Option C — curl (Git Bash / WSL / macOS)

```bash
base=http://localhost:8000/api/v1

# login → grab refresh token
rt1=$(curl -s -X POST $base/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!ChangeMe"}' | jq -r .refreshToken)

# rotate
rt2=$(curl -s -X POST $base/auth/refresh -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$rt1\"}" | jq -r .refreshToken)
echo "rotated: $rt2"

# reuse old (401, kills family) / new now dead too (401)
echo "reuse rt1: $(curl -s -o /dev/null -w '%{http_code}' -X POST $base/auth/refresh -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$rt1\"}")"
echo "rt2 after: $(curl -s -o /dev/null -w '%{http_code}' -X POST $base/auth/refresh -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$rt2\"}")"

# logout (single) — 204
curl -s -o /dev/null -w "logout: %{http_code}\n" -X POST $base/auth/logout -H "Content-Type: application/json" -d "{\"refreshToken\":\"$rt2\"}"
```

---

## 6. Negative & edge cases

| What you send | Expected | Why |
|---|---|---|
| `refresh` with a **rotated** (already-used) token | **401** + all sessions revoked | Reuse detection |
| `refresh` with `"bogus.token"` (bad id) | **401** (not 500) | Malformed id handled gracefully |
| `refresh` with `"no-dot-token"` | **400** or **401** | Validation / malformed format |
| `refresh` with an empty body `{}` | **400** | `refreshToken` is required |
| `logout` with an unknown/already-revoked token | **204** | Idempotent — logout never errors |
| `logout-all` **without** a bearer token | **401** | It's a protected route |
| `refresh` after the user is deactivated | **401** + sessions revoked | Re-checked on every refresh |

Quick curl sweep:
```bash
base=http://localhost:8000/api/v1
echo "garbage:   $(curl -s -o /dev/null -w '%{http_code}' -X POST $base/auth/refresh -H 'Content-Type: application/json' -d '{"refreshToken":"bogus.token"}')"   # 401
echo "empty:     $(curl -s -o /dev/null -w '%{http_code}' -X POST $base/auth/refresh -H 'Content-Type: application/json' -d '{}')"                               # 400
echo "logoutAll no-auth: $(curl -s -o /dev/null -w '%{http_code}' -X POST $base/auth/logout-all)"                                                                # 401
```

---

## 7. Verify in the database

Each session is one row in `refresh_tokens`; `revoked_at` is stamped on rotation/logout. **The token secret is never stored** — only its SHA-256 hash.

```bash
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"SELECT left(id::text,8) AS id, left(token_hash,12) AS hash, revoked_at IS NOT NULL AS revoked, left(replaced_by_id::text,8) AS replaced_by FROM refresh_tokens ORDER BY created_at DESC LIMIT 8;"
```
**Observe:**
- `hash` is a 64-char hex digest, never the token you received.
- After a rotation, the old row has `revoked = t` and `replaced_by` pointing at its successor.
- After a reuse hit or logout-all, **all** of that user's rows show `revoked = t`.

Count active vs revoked:
```bash
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"SELECT count(*) total, count(revoked_at) revoked FROM refresh_tokens;"
```

---

## 8. Automated tests

```powershell
npm test                 # unit (no DB): incl. 8 RefreshTokenService tests
npm run test:e2e         # e2e (needs docker:up): refresh lifecycle
```

| File | Covers |
|---|---|
| `src/modules/auth/refresh-token.service.spec.ts` | issue format & hash-only storage, rotate, unknown/expired/tampered token, **reuse → revoke-all**, malformed no-op |
| `test/refresh.e2e-spec.ts` | register returns both tokens, rotation, **reuse detection kills the family**, garbage → 401, logout, logout-all |

---

## 9. Expected response shapes

**`POST /auth/refresh` / `login` / `register` → 200/201**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "4502bf5b-8edb-43fe-8886-1c746a6d0e0e.1d832c04...",
  "tokenType": "Bearer",
  "expiresIn": "15m",
  "user": { "id": "...", "email": "admin@example.com", "...": "..." }
}
```

**Reuse / invalid → 401**
```json
{ "message": "Refresh token already used", "statusCode": 401 }
```

**`logout` / `logout-all` → 204 No Content** (empty body)

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `refresh` returns **500** | Should be fixed (malformed id → 401). If seen, check `RefreshTokenService.rotate` try/catch and rebuild. |
| Old refresh token still works after rotating | You may be reusing a token that wasn't actually rotated — confirm you sent the previous response's `refreshToken`. |
| `logout-all` → 401 | It needs a valid **access** token in `Authorization` (not the refresh token). |
| Everything 401 right after a successful flow | A reuse hit earlier revoked the whole family — log in again to start fresh. |
| `refresh` → 401 "expired" immediately | Check `JWT_REFRESH_EXPIRES_IN_DAYS` in `.env` (default 7). |
```
