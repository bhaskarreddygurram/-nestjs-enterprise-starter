# Testing Guide — Phase 3: Authentication

> How to test every Phase 3 API by hand (Swagger, PowerShell/curl) and via the automated suite.
> Covers: `register`, `login`, `me`, the now-protected `users` routes, and the public `health` routes.
>
> Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md) · Architecture: [`ARCHITECTURE-ROADMAP.md`](ARCHITECTURE-ROADMAP.md)

---

## 0. Prerequisites — get the app running

```powershell
npm run docker:up        # PostgreSQL + Redis (wait for "healthy")
npm run prisma:migrate   # ensure tables exist
npm run db:seed          # seed the admin user
npm run start:dev        # API on http://localhost:8000/api
```

**Seeded dev login:** `admin@example.com` / `Admin123!ChangeMe`

| Base URL | `http://localhost:8000/api/v1` |
|---|---|
| Swagger UI | `http://localhost:8000/api/docs` |

---

## 1. Endpoint map

| # | Method | Path | Auth | Expected |
|---|--------|------|------|----------|
| 1 | POST | `/auth/register` | 🔓 public | `201` + token |
| 2 | POST | `/auth/login` | 🔓 public | `200` + token |
| 3 | GET | `/auth/me` | 🔒 Bearer | `200` current user |
| 4 | GET | `/users` | 🔒 Bearer | `200` paginated list |
| 5 | POST | `/users` | 🔒 Bearer | `201` created user |
| 6 | GET | `/users/:id` | 🔒 Bearer | `200` one user |
| 7 | PATCH | `/users/:id` | 🔒 Bearer | `200` updated |
| 8 | DELETE | `/users/:id` | 🔒 Bearer | `204` soft-deleted |
| 9 | GET | `/health` | 🔓 public | `200` |
| 10 | GET | `/health/readiness` | 🔓 public | `200` (db + redis up) |

🔒 = requires header `Authorization: Bearer <accessToken>`

---

## 2. Option A — Test via Swagger UI (easiest, no terminal)

1. Open **http://localhost:8000/api/docs**
2. Expand **Auth → POST /auth/login**, click **Try it out**, body:
   ```json
   { "email": "admin@example.com", "password": "Admin123!ChangeMe" }
   ```
   **Execute** → copy the `accessToken` from the response.
3. Click the green **Authorize** 🔓 button (top-right) → paste the token → **Authorize** → **Close**.
   *(Swagger now sends `Authorization: Bearer <token>` on every request.)*
4. Now any 🔒 endpoint works. Try **Auth → GET /auth/me → Execute** → you should see the admin user.
5. To prove protection: click **Authorize → Logout**, then run **Users → GET /users** → you get **401**.

---

## 3. Option B — Test via PowerShell (Windows default shell)

### Step 1 — Log in and capture the token
```powershell
$base = "http://localhost:8000/api/v1"

$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{
  email    = "admin@example.com"
  password = "Admin123!ChangeMe"
} | ConvertTo-Json)

$token = $login.accessToken
$headers = @{ Authorization = "Bearer $token" }
$login | ConvertTo-Json -Depth 5
```
**Expect:** an object with `accessToken`, `tokenType: "Bearer"`, `expiresIn: "15m"`, and a `user` (no `passwordHash`).

### Step 2 — GET /auth/me (protected)
```powershell
Invoke-RestMethod -Uri "$base/auth/me" -Headers $headers | ConvertTo-Json
```
**Expect:** the admin user object.

### Step 3 — Register a new user
```powershell
$reg = Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{
  email     = "jane.$(Get-Random)@example.com"
  password  = "Str0ng!Passw0rd"
  firstName = "Jane"
  lastName  = "Doe"
} | ConvertTo-Json)
$reg | ConvertTo-Json -Depth 5
```
**Expect:** `201` with its own `accessToken` + `user`.

### Step 4 — Users CRUD (using the admin token)
```powershell
# List (paginated)
Invoke-RestMethod -Uri "$base/users?page=1&limit=5" -Headers $headers | ConvertTo-Json -Depth 5

# Create
$created = Invoke-RestMethod -Uri "$base/users" -Method Post -Headers $headers -ContentType "application/json" -Body (@{
  email    = "crud.$(Get-Random)@example.com"
  password = "Str0ng!Passw0rd"
} | ConvertTo-Json)
$id = $created.id

# Get one
Invoke-RestMethod -Uri "$base/users/$id" -Headers $headers | ConvertTo-Json

# Update
Invoke-RestMethod -Uri "$base/users/$id" -Method Patch -Headers $headers -ContentType "application/json" -Body (@{ firstName = "Updated" } | ConvertTo-Json) | ConvertTo-Json

# Soft-delete (returns 204, no body)
Invoke-RestMethod -Uri "$base/users/$id" -Method Delete -Headers $headers
```

### Step 5 — Search / filter / sort
```powershell
Invoke-RestMethod -Uri "$base/users?search=admin" -Headers $headers | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$base/users?isActive=true&sort=-createdAt,email" -Headers $headers | ConvertTo-Json -Depth 5
```

---

## 4. Option C — Test via curl (Git Bash / WSL / macOS / Linux)

```bash
base=http://localhost:8000/api/v1

# 1. Login → capture token (requires jq; or copy by hand)
token=$(curl -s -X POST $base/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!ChangeMe"}' | jq -r .accessToken)
echo "$token"

# 2. /auth/me
curl -s $base/auth/me -H "Authorization: Bearer $token" | jq

# 3. register
curl -s -X POST $base/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"jane'$RANDOM'@example.com","password":"Str0ng!Passw0rd","firstName":"Jane"}' | jq

# 4. users list (protected)
curl -s "$base/users?limit=5" -H "Authorization: Bearer $token" | jq

# 5. create / get / update / delete
id=$(curl -s -X POST $base/users -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  -d '{"email":"crud'$RANDOM'@example.com","password":"Str0ng!Passw0rd"}' | jq -r .id)
curl -s $base/users/$id -H "Authorization: Bearer $token" | jq
curl -s -X PATCH $base/users/$id -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" -d '{"firstName":"Updated"}' | jq
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE $base/users/$id -H "Authorization: Bearer $token"  # 204
```

---

## 5. Negative tests — prove the guard & validation work

These are the cases that show the security actually holds. Use `-w "%{http_code}"` (curl) or wrap in `try/catch` (PowerShell).

| What you send | Expected | Why |
|---|---|---|
| `GET /users` with **no** `Authorization` header | **401** | Global JwtAuthGuard blocks it |
| `GET /auth/me` with `Authorization: Bearer garbage` | **401** | Invalid token signature |
| `POST /auth/login` with wrong password | **401** | Bad credentials (generic — no enumeration) |
| `POST /auth/login` with a non-existent email | **401** | Same generic message (can't tell accounts apart) |
| `POST /auth/register` with an existing email | **409** | Email uniqueness |
| `POST /auth/register` password `"short"` | **400** | Fails strength rules |
| `POST /users` body `{ "foo": "bar" }` | **400** | `forbidNonWhitelisted` rejects unknown props |
| `GET /users/not-a-uuid` (with token) | **400** | `ParseUUIDPipe` |
| `GET /users?sort=passwordHash` (with token) | **400** | Sort whitelist |

### PowerShell — checking an expected error code
```powershell
try {
  Invoke-RestMethod -Uri "$base/users" -Method Get   # no token
} catch {
  $_.Exception.Response.StatusCode.value__   # → 401
}
```

### curl — quick status sweep
```bash
base=http://localhost:8000/api/v1
echo "no token:      $(curl -s -o /dev/null -w '%{http_code}' $base/users)"                          # 401
echo "bad token:     $(curl -s -o /dev/null -w '%{http_code}' $base/auth/me -H 'Authorization: Bearer x')"  # 401
echo "wrong pw:      $(curl -s -o /dev/null -w '%{http_code}' -X POST $base/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"admin@example.com\",\"password\":\"nope\"}')"  # 401
echo "health public: $(curl -s -o /dev/null -w '%{http_code}' $base/health)"                         # 200
```

---

## 6. Verify in the database (optional)

Confirm a registered user was persisted with a **hashed** password (never plaintext):

```bash
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db \
  -c "SELECT email, left(password_hash, 12) AS hash_prefix, is_active FROM users ORDER BY created_at DESC LIMIT 5;"
```
**Expect:** `hash_prefix` starts with `$argon2id$` for every row.

---

## 7. Run the automated tests

The repo ships with the same scenarios as code.

```powershell
# Unit tests (mocked — no DB needed): 21 tests incl. AuthService
npm test

# E2E tests (need docker:up): full register → login → me → CRUD journey
npm run test:e2e

# Coverage report
npm run test:cov
```

What the automated suites assert (mirrors §3–§5):

| File | Covers |
|---|---|
| `src/modules/auth/auth.service.spec.ts` | register issues token; login valid/invalid/inactive/**malformed-hash → 401 (not 500)** |
| `test/auth.e2e-spec.ts` | register → 409 dup → me 401 without token → login → wrong-pw 401 → me 200 → garbage-token 401 → health public |
| `test/users.e2e-spec.ts` | 401 without token, then full CRUD with a bearer token |

---

## 8. Expected response shapes (reference)

**`POST /auth/login` / `POST /auth/register` → 200/201**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": "15m",
  "user": {
    "id": "150944a0-7cf6-4deb-93d1-81903cd79391",
    "email": "admin@example.com",
    "firstName": "Admin",
    "lastName": "User",
    "isActive": true,
    "twoFactorEnabled": false,
    "createdAt": "2026-06-08T20:59:59.354Z",
    "updatedAt": "2026-06-13T11:21:52.320Z"
  }
}
```
> Note there is **no `passwordHash`** field — it can never be serialized.

**Any error → consistent shape (example 401)**
```json
{ "message": "Invalid credentials", "statusCode": 401 }
```

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `login` returns **500** | The user's stored hash is bad/legacy. Re-seed: `npm run db:seed`. (The service already converts verify-errors to 401.) |
| Everything returns **401**, even with a token | Token expired (15m) — log in again. Or you forgot the `Bearer ` prefix. |
| `ECONNREFUSED` / app won't boot | Infra down → `npm run docker:up`; check `docker ps` for `(healthy)`. |
| `EADDRINUSE :8000` | A previous app instance is still running — stop it (`Ctrl+C`) or kill the PID. |
| Swagger 🔒 endpoints still 401 after Authorize | Make sure you pasted only the token (no quotes, no `Bearer`). |
```
