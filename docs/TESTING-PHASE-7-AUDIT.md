# Testing Guide — Phase 7: Audit Logging

> How to verify the event-driven audit trail: that actions are recorded, attributed to the right actor, correlated by request id, and readable only with `audit:read`. By hand (Swagger, PowerShell, curl), in the DB, and via the automated suite.
>
> Prior guides: [`TESTING-PHASE-6-HARDENING.md`](TESTING-PHASE-6-HARDENING.md) · Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md)

---

## 0. Prerequisites

```powershell
npm run docker:up
npm run prisma:migrate   # applies the audit_logs table
npm run db:seed          # admin now also has audit:read
npm run start:dev
```

| Base URL | `http://localhost:8000/api/v1` |
|---|---|
| Admin (has `audit:read`) | `admin@example.com` / `Admin123!ChangeMe` |

---

## 1. Mental model

Audit logging is **event-driven and decoupled**:

```
AuthService / UsersService / RbacService
        │  emit (via AuditEmitter)
        ▼
   AUDIT_EVENT  ──(@OnEvent listener)──►  AuditService.record()  ──►  audit_logs
```

- The domain services don't know audit exists beyond a one-method `AuditEmitter`.
- The write is **fire-and-forget** — it happens just after the response, and a failed audit write never breaks the request. ⇒ When testing, allow a moment / poll for the row.
- Each entry captures **who** (`actorId`), **what** (`action`, `resource`, `resourceId`), **context** (`metadata`, `ipAddress`, `requestId`), and **when** (`createdAt`).
- The trail is **append-only** and has **no foreign key** to users — it survives even if the actor is later deleted.

### Actor attribution
- For authenticated routes (create user, assign role…), the actor is resolved from the JWT via AsyncLocalStorage (`nestjs-cls`) → the **caller** is recorded.
- For `login` / `register`, the actor is the user themselves (set explicitly).

### Recorded actions
`auth.login` · `auth.register` · `auth.logout` · `auth.logout_all` · `auth.token_refreshed` · `user.created` · `user.updated` · `user.deleted` · `role.assigned` · `role.removed`

---

## 2. Endpoint

| Method | Path | Required | Query params |
|--------|------|----------|--------------|
| GET | `/audit-logs` | `audit:read` | `page`, `limit`, `action`, `actorId` |

Returns the standard paginated envelope (`data` = entries, `meta` = pagination).

---

## 3. Quick end-to-end check (curl)

```bash
base=http://localhost:8000/api/v1

# admin token
admin=$(curl -s -X POST $base/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!ChangeMe"}' | jq -r .data.accessToken)

# do something auditable: create a user
uid=$(curl -s -X POST $base/users -H "Authorization: Bearer $admin" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"audit$RANDOM@e.com\",\"password\":\"Str0ng!Passw0rd\"}" | jq -r .data.id)

# assign a role
curl -s -o /dev/null -X POST $base/users/$uid/roles -H "Authorization: Bearer $admin" \
  -H "Content-Type: application/json" -d '{"role":"user"}'

sleep 1   # audit write is fire-and-forget

# read the latest trail
curl -s "$base/audit-logs?limit=6" -H "Authorization: Bearer $admin" \
  | jq '.data[] | {action, resource, actorId, resourceId, requestId}'
```

Expected (most-recent first): `role.assigned`, `user.created`, `auth.login` — each with the admin's id as `actorId`.

---

## 4. PowerShell

```powershell
$base = "http://localhost:8000/api/v1"
$admin = (Invoke-RestMethod "$base/auth/login" -Method Post -ContentType application/json -Body (@{
  email="admin@example.com"; password="Admin123!ChangeMe" } | ConvertTo-Json)).data.accessToken
$h = @{ Authorization = "Bearer $admin" }

# trigger an event
$u = Invoke-RestMethod "$base/users" -Method Post -Headers $h -ContentType application/json -Body (@{
  email="audit$(Get-Random)@e.com"; password="Str0ng!Passw0rd" } | ConvertTo-Json)

Start-Sleep -Milliseconds 800

# read the trail (data is under .data)
(Invoke-RestMethod "$base/audit-logs?limit=6" -Headers $h).data |
  Select-Object action, resource, actorId, resourceId, requestId | Format-Table

# filter
(Invoke-RestMethod "$base/audit-logs?action=user.created&limit=3" -Headers $h).data |
  Select-Object action, resourceId, @{n='email';e={$_.metadata.email}}
```

---

## 5. Swagger

1. **POST /auth/login** as admin → copy `data.accessToken` → **Authorize** 🔓.
2. Do something auditable (e.g. **POST /users**).
3. **Audit → GET /audit-logs** → Execute. The new `user.created` entry appears with your admin id as `actorId`.
4. Filter: set `action = user.created` (or `actorId = <id>`) and Execute again.

---

## 6. Verifying attribution & correlation

**Actor is the caller.** Create a user as admin, then confirm the `user.created` row's `actorId` is the admin's id (from `GET /auth/me` → `data.id`):
```bash
curl -s "$base/audit-logs?action=user.created&limit=1" -H "Authorization: Bearer $admin" \
  | jq '.data[0] | {actorId, resourceId, metadata}'
```

**Request-id correlation.** Every audit row carries the `requestId` of the request that caused it — the same id returned in the `x-request-id` response header and the response envelope. Make a request with your own id and trace it:
```bash
curl -s -D - -o /dev/null -H "x-request-id: trace-demo-1" \
  -X POST $base/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!ChangeMe"}' | grep -i x-request-id
# then find that audit row:
curl -s "$base/audit-logs?action=auth.login&limit=10" -H "Authorization: Bearer $admin" \
  | jq '.data[] | select(.requestId=="trace-demo-1")'
```

---

## 7. Authorization (who can read the trail)

| Token | Result |
|---|---|
| none | **401** |
| fresh user (no `audit:read`) | **403** |
| admin | **200** |

```bash
# fresh, permission-less user → 403
utok=$(curl -s -X POST $base/auth/register -H "Content-Type: application/json" \
  -d "{\"email\":\"noperm$RANDOM@e.com\",\"password\":\"Str0ng!Passw0rd\"}" | jq -r .data.accessToken)
echo "no audit:read → $(curl -s -o /dev/null -w '%{http_code}' $base/audit-logs -H "Authorization: Bearer $utok")"  # 403
echo "no token      → $(curl -s -o /dev/null -w '%{http_code}' $base/audit-logs)"                                   # 401
```

---

## 8. Verify in the database

```bash
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"SELECT action, resource, (actor_id IS NOT NULL) AS has_actor, (request_id IS NOT NULL) AS has_reqid, created_at
   FROM audit_logs ORDER BY created_at DESC LIMIT 10;"
```
**Observe:** rows for your recent actions; `has_actor`/`has_reqid` = `t`; newest first.

Confirm the trail is **append-only & user-independent** — `audit_logs` has no FK to `users`, so deleting a user leaves their history intact:
```bash
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c "\d audit_logs"
# note: no "Foreign-key constraints" section referencing users
```

> The `metadata` column is JSON — e.g. `user.created` stores `{"email": "..."}`, `role.assigned` stores `{"role": "user"}`.

---

## 9. Automated tests

```powershell
npm test            # service specs (now include an AuditEmitter mock)
npm run test:e2e    # test/audit.e2e-spec.ts
```

| File | Covers |
|---|---|
| `test/audit.e2e-spec.ts` | 403 without `audit:read`; `auth.login` is recorded; a user creation is attributed to the admin actor; paginated envelope |

> The audit e2e **polls** for the row (the write is fire-and-forget) rather than asserting immediately — mirror this in your own manual tests with a short wait.

---

## 10. Troubleshooting

| Symptom | Explanation / fix |
|---|---|
| New action not in `/audit-logs` yet | The write is async/fire-and-forget — wait ~0.5–1s and re-query. |
| `actorId` is `null` on an authenticated action | The route wasn't authenticated (no JWT), so no actor in context. `login`/`register` set it explicitly; other mutations rely on the bearer token. |
| `GET /audit-logs` → 403 as admin | Seed didn't grant `audit:read` — re-run `npm run db:seed`; check `GET /auth/me` lists `audit:read`. |
| Nothing recorded at all | Ensure `EventEmitterModule` is initialized (it is, in `AppModule`) and the app was rebuilt after changes. |
| Want a new auditable action | Add a constant to `AuditAction`, then `this.audit.emit({ action, resource, ... })` in the relevant service. No listener changes needed. |
