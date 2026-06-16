# Testing Guide — Phase 5: Authorization (RBAC)

> How to test role/permission enforcement, the role-management endpoints, and dynamic grant/revoke — by hand (Swagger, PowerShell, curl) and via the automated suite.
>
> Builds on Phase 3/4: [`TESTING-PHASE-3-AUTH.md`](TESTING-PHASE-3-AUTH.md) · [`TESTING-PHASE-4-REFRESH.md`](TESTING-PHASE-4-REFRESH.md)

---

## 0. Prerequisites

```powershell
npm run docker:up        # PostgreSQL + Redis
npm run prisma:migrate   # applies roles / permissions / join tables
npm run db:seed          # 6 permissions, roles admin+user, admin role -> admin
npm run start:dev        # API on http://localhost:8000/api
```

| Base URL | `http://localhost:8000/api/v1` |
|---|---|
| Swagger | `http://localhost:8000/api/docs` |
| Admin (all perms) | `admin@example.com` / `Admin123!ChangeMe` |

---

## 1. The mental model

**Permission-based RBAC.** A permission is `resource:action` (e.g. `user:read`). Roles bundle permissions. Users have roles.

```
User ──< UserRole >── Role ──< RolePermission >── Permission
```

Seeded out of the box:

| Role | Permissions |
|---|---|
| `admin` | `user:read`, `user:create`, `user:update`, `user:delete`, `role:read`, `role:assign` |
| `user` | `user:read` |

**Two layers run on every protected request:**
1. `JwtAuthGuard` — is the token valid? (else **401**)
2. `AuthorizationGuard` — does the user have the required role/permission? (else **403**)

**401 vs 403:** no/invalid token → **401**; valid token but missing permission → **403**.

> 🔑 **Permissions are resolved per-request** from the database (not baked into the JWT). So when an admin grants or removes a role, it takes effect on the user's **very next request — with their existing token, no re-login needed**. (Verified: a user's `GET /users` flips `403 → 200` the instant the role is granted.)

---

## 2. Endpoint map

| Method | Path | Required | Expected |
|--------|------|----------|----------|
| GET | `/auth/me` | authenticated | `200` + `roles` & `permissions` arrays |
| GET | `/users` | `user:read` | `200` / `403` |
| POST | `/users` | `user:create` | `201` / `403` |
| PATCH | `/users/:id` | `user:update` | `200` / `403` |
| DELETE | `/users/:id` | `user:delete` | `204` / `403` |
| GET | `/roles` | `role:read` | `200` / `403` |
| POST | `/users/:id/roles` | `role:assign` | `204` / `403` |
| DELETE | `/users/:id/roles/:roleName` | `role:assign` | `204` / `403` |

---

## 3. Option A — Swagger UI

1. **POST /auth/login** as admin → copy `accessToken` → **Authorize** 🔓.
2. **GET /auth/me** → see `"roles": ["admin"]` and the full `permissions` array.
3. **GET /roles** → `200`, lists `admin` + `user`.
4. **POST /auth/register** a new user → copy *its* `accessToken` **and** the `user.id`.
5. Re-**Authorize** with the new user's token → **GET /users** → **403** (no permission).
6. Re-**Authorize** as admin → **POST /users/{id}/roles** with body `{ "role": "user" }` → **204**.
7. Re-**Authorize** as the new user (same token as step 5 is fine) → **GET /users** → now **200**.

---

## 4. Option B — PowerShell (enforcement + dynamic grant)

```powershell
$base = "http://localhost:8000/api/v1"

# admin token
$admin = (Invoke-RestMethod "$base/auth/login" -Method Post -ContentType application/json -Body (@{
  email="admin@example.com"; password="Admin123!ChangeMe" } | ConvertTo-Json)).accessToken
$adminH = @{ Authorization = "Bearer $admin" }

# admin sees its permissions
(Invoke-RestMethod "$base/auth/me" -Headers $adminH) | Select-Object roles, permissions

# register a fresh (permission-less) user
$reg = Invoke-RestMethod "$base/auth/register" -Method Post -ContentType application/json -Body (@{
  email="rbac-$(Get-Random)@example.com"; password="Str0ng!Passw0rd" } | ConvertTo-Json)
$uid = $reg.user.id
$userH = @{ Authorization = "Bearer $($reg.accessToken)" }

# fresh user is forbidden
try { Invoke-RestMethod "$base/users" -Headers $userH } catch { "before grant → $($_.Exception.Response.StatusCode.value__)" }  # 403

# admin grants the 'user' role
Invoke-RestMethod "$base/users/$uid/roles" -Method Post -Headers $adminH -ContentType application/json -Body (@{ role="user" } | ConvertTo-Json)  # 204

# SAME token now works (no re-login)
(Invoke-RestMethod "$base/users?limit=3" -Headers $userH).meta   # 200

# ...but creating is still forbidden ('user' role lacks user:create)
try { Invoke-RestMethod "$base/users" -Method Post -Headers $userH -ContentType application/json -Body (@{ email="x@y.com"; password="Str0ng!Passw0rd" } | ConvertTo-Json) }
catch { "create → $($_.Exception.Response.StatusCode.value__)" }  # 403

# admin removes the role → user forbidden again
Invoke-RestMethod "$base/users/$uid/roles/user" -Method Delete -Headers $adminH   # 204
try { Invoke-RestMethod "$base/users" -Headers $userH } catch { "after revoke → $($_.Exception.Response.StatusCode.value__)" }  # 403
```

---

## 5. Option C — curl

```bash
base=http://localhost:8000/api/v1
admin=$(curl -s -X POST $base/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!ChangeMe"}' | jq -r .accessToken)

# register fresh user, capture id + token
reg=$(curl -s -X POST $base/auth/register -H "Content-Type: application/json" \
  -d "{\"email\":\"rbac$RANDOM@example.com\",\"password\":\"Str0ng!Passw0rd\"}")
uid=$(jq -r .user.id <<<"$reg"); utok=$(jq -r .accessToken <<<"$reg")

echo "before:  $(curl -s -o /dev/null -w '%{http_code}' $base/users -H "Authorization: Bearer $utok")"   # 403
curl -s -o /dev/null -X POST $base/users/$uid/roles -H "Authorization: Bearer $admin" \
  -H "Content-Type: application/json" -d '{"role":"user"}'                                                # 204
echo "after:   $(curl -s -o /dev/null -w '%{http_code}' $base/users -H "Authorization: Bearer $utok")"   # 200 (same token!)
echo "create:  $(curl -s -o /dev/null -w '%{http_code}' -X POST $base/users -H "Authorization: Bearer $utok" -H 'Content-Type: application/json' -d '{"email":"n@e.com","password":"Str0ng!Passw0rd"}')"  # 403
```

---

## 6. Negative & edge cases

| What | Token | Expected | Why |
|---|---|---|---|
| `GET /users` | none | **401** | Not authenticated |
| `GET /users` | fresh user (no roles) | **403** | Lacks `user:read` |
| `POST /users` | `user` role | **403** | `user` has read only |
| `GET /roles` | `user` role | **403** | Lacks `role:read` |
| `POST /users/:id/roles` | non-admin | **403** | Lacks `role:assign` |
| `POST /users/:id/roles` | admin, body `{ "role": "ghost" }` | **404** | Role doesn't exist |
| `POST /users/:bad/roles` | admin | **400** | `:id` isn't a UUID |
| any `/users` route | admin | **2xx** | Has all `user:*` |

curl status sweep (using a fresh `$utok` with no roles):
```bash
echo "users:  $(curl -s -o /dev/null -w '%{http_code}' $base/users -H "Authorization: Bearer $utok")"        # 403
echo "roles:  $(curl -s -o /dev/null -w '%{http_code}' $base/roles -H "Authorization: Bearer $utok")"        # 403
echo "noauth: $(curl -s -o /dev/null -w '%{http_code}' $base/users)"                                          # 401
```

---

## 7. Verify in the database

```bash
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"SELECT r.name AS role, p.resource || ':' || p.action AS permission
   FROM roles r
   JOIN role_permissions rp ON rp.role_id = r.id
   JOIN permissions p ON p.id = rp.permission_id
  ORDER BY r.name, permission;"
```
**Expect:** `admin` → 6 rows, `user` → just `user:read`.

Who has which role:
```bash
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"SELECT u.email, r.name AS role
   FROM user_roles ur
   JOIN users u ON u.id = ur.user_id
   JOIN roles r ON r.id = ur.role_id
  ORDER BY u.email;"
```

---

## 8. Automated tests

```powershell
npm test            # unit: RbacService (perm flattening/dedup, assign/remove, 404s)
npm run test:e2e    # e2e: rbac.e2e-spec.ts + users.e2e-spec.ts (403 path)
```

| File | Covers |
|---|---|
| `src/modules/rbac/rbac.service.spec.ts` | flatten+dedupe permissions across roles, empty user, 404 user/role, assign |
| `test/rbac.e2e-spec.ts` | 403 enforcement, non-admin can't assign, **dynamic grant → 200**, revoke → 403, 404 unknown role |
| `test/users.e2e-spec.ts` | admin CRUD + **403 for a permission-less user** |

---

## 9. Expected response shapes

**`GET /auth/me` → 200**
```json
{
  "id": "150944a0-7cf6-4deb-93d1-81903cd79391",
  "email": "admin@example.com",
  "isActive": true,
  "roles": ["admin"],
  "permissions": ["user:read","user:create","user:update","user:delete","role:read","role:assign"]
}
```

**Forbidden → 403**
```json
{ "message": "Requires permissions: user:read", "statusCode": 403 }
```

**`GET /roles` → 200**
```json
[
  { "id": "...", "name": "admin", "description": "Full access to everything" },
  { "id": "...", "name": "user",  "description": "Standard user (read-only on users)" }
]
```

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| Everything is **403**, even as admin | Seed didn't run / admin lost its role → `npm run db:seed`. Check `GET /auth/me` shows `roles: ["admin"]`. |
| Granted a role but user still **403** | Confirm the assign returned **204** and you used the right `userId`. The same token *should* work on the next call — if not, the token may be for a different account. |
| `POST /users/:id/roles` → **400** | `:id` must be a valid UUID (the user's id from `/auth/me` or the register response). |
| `POST /users/:id/roles` → **404** | The `role` name doesn't exist — list valid names via `GET /roles`. |
| `role:assign` calls → **403** | You're not using an admin token. |
```
