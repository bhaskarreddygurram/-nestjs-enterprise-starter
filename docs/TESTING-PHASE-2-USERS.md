# Testing Guide — Phase 2: User Module

> How to test the user CRUD module: creation with argon2 hashing (the hash is never returned), pagination + sorting + search + filtering, email-uniqueness, validation, and soft deletes.
>
> Prior guide: [`TESTING-PHASE-1-DATABASE.md`](TESTING-PHASE-1-DATABASE.md) · Next: [`TESTING-PHASE-3-AUTH.md`](TESTING-PHASE-3-AUTH.md) · Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md)

---

## 0. Prerequisites

```powershell
npm run docker:up
npm run prisma:migrate
npm run db:seed
npm run start:dev
```

| Base URL | `http://localhost:8000/api/v1` |
|---|---|

> 🔐 The `users` routes were public when this module was first built, but Auth (Phase 3) and RBAC (Phase 5) now guard them. So to exercise them today you need an **access token with the right `user:*` permission**. The seeded **admin** has them all — grab a token first:
>
> ```bash
> base=http://localhost:8000/api/v1
> tok=$(curl -s -X POST $base/auth/login -H "Content-Type: application/json" \
>   -d '{"email":"admin@example.com","password":"Admin123!ChangeMe"}' | jq -r .data.accessToken)
> ```
>
> All examples below send `-H "Authorization: Bearer $tok"`.

---

## 1. Mental model

```
Controller (HTTP + permissions)  →  Service (domain intent)  →  Repository (Prisma only)
        DTOs validate input            argon2 hashes passwords      soft-delete convention
```

- **Layered:** the controller speaks HTTP, the service speaks domain intent, the repository is the *only* place touching Prisma.
- **Passwords are hashed (argon2id) and never returned:** `UserResponseDto` omits `passwordHash`.
- **Soft delete:** "deleting" stamps `deleted_at` (+ `is_active=false`); the row is retained but excluded from every read.
- **List ergonomics:** pagination (`page`/`limit`), `sort` (whitelisted fields, `-` = desc), `search` (email/first/last), and an `isActive` filter.
- **Responses use the standard envelope** (Phase 6): payload under `data`, pagination under `meta`.

---

## 2. Endpoint map

| Method | Path | Permission | Result |
|--------|------|-----------|--------|
| POST | `/users` | `user:create` | create a user |
| GET | `/users` | `user:read` | paginated/filterable/sortable list |
| GET | `/users/:id` | `user:read` | one user (404 if missing/deleted) |
| PATCH | `/users/:id` | `user:update` | update profile fields |
| DELETE | `/users/:id` | `user:delete` | soft-delete (204) |

---

## 3. Create + read (curl)

```bash
base=http://localhost:8000/api/v1
auth="Authorization: Bearer $tok"

# create
id=$(curl -s -X POST $base/users -H "$auth" -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"Str0ng!Passw0rd","firstName":"Jane","lastName":"Doe"}' \
  | jq -r .data.id)
echo "created $id"

# read it back — note: NO passwordHash in the response
curl -s $base/users/$id -H "$auth" | jq '.data | {id, email, firstName, isActive}'
```

---

## 4. Pagination, sort, search, filter

```bash
# page 1, 5 per page, newest first
curl -s "$base/users?page=1&limit=5&sort=-createdAt" -H "$auth" | jq '{meta, count: (.data|length)}'

# search across email/first/last (case-insensitive)
curl -s "$base/users?search=jane" -H "$auth" | jq '.data[] | .email'

# filter by active state
curl -s "$base/users?isActive=true" -H "$auth" | jq '.meta.totalItems'

# multi-field sort: email asc within same created date
curl -s "$base/users?sort=email" -H "$auth" | jq '.data[] | .email'
```

The envelope for a list looks like:

```jsonc
{ "success": true, "statusCode": 200, "message": "Success",
  "data": [ /* users */ ],
  "meta": { "page": 1, "limit": 5, "totalItems": 12, "totalPages": 3, "hasNextPage": true, "hasPreviousPage": false },
  "timestamp": "...", "path": "/api/v1/users", "requestId": "..." }
```

| Query | Effect |
|---|---|
| `?page=2&limit=10` | second page of 10 |
| `?sort=-createdAt,email` | newest first, then email asc |
| `?sort=password` | **400** — not a whitelisted sort field |
| `?search=jane` | case-insensitive match on email/firstName/lastName |
| `?isActive=false` | only inactive users |

---

## 5. Update + soft-delete

```bash
# update profile fields
curl -s -X PATCH $base/users/$id -H "$auth" -H "Content-Type: application/json" \
  -d '{"firstName":"Janet"}' | jq '.data.firstName'   # "Janet"

# soft-delete → 204
curl -s -o /dev/null -w "delete → %{http_code}\n" -X DELETE $base/users/$id -H "$auth"   # 204

# now it's gone from reads
curl -s -o /dev/null -w "get after delete → %{http_code}\n" $base/users/$id -H "$auth"   # 404
curl -s "$base/users?search=jane" -H "$auth" | jq '.data | length'                        # excludes it
```

---

## 6. Validation & uniqueness

| Request | Expected |
|---|---|
| Duplicate email on create | **409** Conflict |
| `password: "short"` | **400** (too short) |
| `email: "not-an-email"` | **400** |
| Unknown field e.g. `"role":"admin"` | **400** (whitelist rejects extras) |
| `GET /users/not-a-uuid` | **400** (ParseUUIDPipe) |
| No / wrong token | **401** |
| Token without the permission | **403** |

```bash
# duplicate email → 409
curl -s -o /dev/null -w "dupe → %{http_code}\n" -X POST $base/users -H "$auth" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Str0ng!Passw0rd"}'   # 409
```

---

## 7. Verify in the database

```bash
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"SELECT email, left(password_hash,12) AS hash, is_active, deleted_at FROM users ORDER BY created_at DESC LIMIT 5;"
```

- `password_hash` starts with `$argon2id$` — never the plaintext.
- A soft-deleted user has `deleted_at` set and `is_active = f`, but the row still exists.

---

## 8. Automated tests

```powershell
npm test            # UsersService unit (mocked repo)
npm run test:e2e    # test/users.e2e-spec.ts (real DB)
```

| File | Covers |
|---|---|
| `src/modules/users/users.service.spec.ts` | create hashes + checks uniqueness, not-found paths, soft-delete |
| `test/users.e2e-spec.ts` | auth-guarded CRUD, pagination, weak-password 400, `passwordHash` never leaks |

---

## 9. Troubleshooting

| Symptom | Explanation / fix |
|---|---|
| Every `users` call → 401 | Missing/expired token — re-login (see §0). |
| `403 Forbidden` | Your token's roles lack the required `user:*` permission — use the admin token. |
| `passwordHash` appears in a response | It shouldn't — that means a raw entity was returned instead of `UserResponseDto`. |
| Deleted user still listed | Reads must filter `deleted_at IS NULL` — check the repository. |
| `?isActive=false` returns active users | Booleans need the explicit transform (string `"false"` → `false`), already handled in `UserQueryDto`. |
