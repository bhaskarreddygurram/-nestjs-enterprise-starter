# Testing Guide — Phase 9: Notifications

> How to test the event-driven welcome flow, the in-app notification endpoints, ownership scoping, and the console mail transport — by hand (Swagger, PowerShell, curl), in the DB/logs, and via the automated suite.
>
> Prior guides: [`TESTING-PHASE-8-FILES.md`](TESTING-PHASE-8-FILES.md) · Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md)

---

## 0. Prerequisites

```powershell
npm run docker:up
npm run prisma:migrate   # applies the notifications table
npm run db:seed
npm run start:dev        # watch the console — the dev mail transport logs here
```

| Base URL | `http://localhost:8000/api/v1` |
|---|---|

> 📧 The dev mail transport is **console-based** — "sent" emails are **logged in the server console**, not actually delivered. Watch the `start:dev` terminal for an `[Mail] EMAIL from=... to=... subject="..."` line.

---

## 1. Mental model

Two delivery channels, one trigger:

```
POST /auth/register
      │  AuthService emits domain event  user.registered
      ▼
  EventEmitter ──(@OnEvent listener)──►  NotificationsService.handleUserRegistered()
                                              ├─ MailProvider.send(welcome)   → console log (dev)
                                              └─ create in-app notification    → notifications table
```

- **Event-driven & decoupled:** `AuthService` fires `user.registered` and has *no idea* notifications exist. The reaction lives entirely in the listener.
- **Fire-and-forget:** the welcome is delivered just after the response — so when testing, **poll** briefly for the in-app notification.
- **Resilient:** if mail delivery fails, signup still succeeds (errors are swallowed + logged).
- **Self-scoped:** every endpoint operates only on the **caller's own** notifications (any authenticated user; ownership enforced — someone else's notification returns 404).
- **Mail is swappable:** `MailProvider` bound via `MAIL_PROVIDER` (console → SMTP/SES) — same adapter pattern as file storage.

---

## 2. Endpoint map

| Method | Path | Auth | Result |
|--------|------|------|--------|
| GET | `/notifications` | authenticated | paginated list of *your* notifications |
| GET | `/notifications/unread-count` | authenticated | `{ count }` |
| PATCH | `/notifications/:id/read` | authenticated | marks *your* notification read (404 if not yours) |
| POST | `/notifications/read-all` | authenticated | `204`, marks all *your* notifications read |

No special permission — just a valid token. Responses use the standard envelope (payload under `data`).

---

## 3. End-to-end check (curl)

```bash
base=http://localhost:8000/api/v1

# 1. register a brand-new user → triggers the welcome
em="notif-$RANDOM@example.com"
tok=$(curl -s -X POST $base/auth/register -H "Content-Type: application/json" \
  -d "{\"email\":\"$em\",\"password\":\"Str0ng!Passw0rd\",\"firstName\":\"Sam\"}" | jq -r .data.accessToken)

sleep 1   # the welcome is delivered asynchronously

# 2. list your notifications → a 'welcome' entry, unread
curl -s $base/notifications -H "Authorization: Bearer $tok" \
  | jq '.data[] | {type, title, read}'

# 3. unread count
curl -s $base/notifications/unread-count -H "Authorization: Bearer $tok" | jq '.data.count'   # >= 1

# 4. mark it read
nid=$(curl -s $base/notifications -H "Authorization: Bearer $tok" | jq -r '.data[0].id')
curl -s -X PATCH $base/notifications/$nid/read -H "Authorization: Bearer $tok" | jq '.data.read'  # true

# 5. mark all read
curl -s -o /dev/null -w "read-all: %{http_code}\n" -X POST $base/notifications/read-all -H "Authorization: Bearer $tok"  # 204
```

👀 Check the `start:dev` console — you'll see the matching `[Mail] EMAIL ... subject="Welcome to the platform"` line from when you registered.

---

## 4. PowerShell

```powershell
$base = "http://localhost:8000/api/v1"
$em = "notif-$(Get-Random)@example.com"
$tok = (Invoke-RestMethod "$base/auth/register" -Method Post -ContentType application/json -Body (@{
  email=$em; password="Str0ng!Passw0rd"; firstName="Sam" } | ConvertTo-Json)).data.accessToken
$h = @{ Authorization = "Bearer $tok" }

Start-Sleep -Milliseconds 800

# list + unread count
(Invoke-RestMethod "$base/notifications" -Headers $h).data | Select-Object type, title, read
(Invoke-RestMethod "$base/notifications/unread-count" -Headers $h).data.count   # >= 1

# mark first read, then all read
$nid = (Invoke-RestMethod "$base/notifications" -Headers $h).data[0].id
(Invoke-RestMethod "$base/notifications/$nid/read" -Method Patch -Headers $h).data.read   # True
Invoke-RestMethod "$base/notifications/read-all" -Method Post -Headers $h                  # 204 (no body)
```

---

## 5. Swagger

1. **POST /auth/register** with a fresh email → copy `data.accessToken` → **Authorize** 🔓.
2. **Notifications → GET /notifications** → Execute → see the `welcome` entry (`read: false`).
3. **GET /notifications/unread-count** → `{ count: 1 }`.
4. Copy the notification `id` → **PATCH /notifications/{id}/read** → `read: true`.
5. **POST /notifications/read-all** → `204`.

---

## 6. Ownership scoping (the security check)

A user can only touch **their own** notifications:

```bash
base=http://localhost:8000/api/v1
# user A registers + gets a welcome notification
a=$(curl -s -X POST $base/auth/register -H "Content-Type: application/json" -d "{\"email\":\"a$RANDOM@e.com\",\"password\":\"Str0ng!Passw0rd\"}" | jq -r .data.accessToken)
sleep 1
nid=$(curl -s $base/notifications -H "Authorization: Bearer $a" | jq -r '.data[0].id')

# user B tries to mark A's notification read → 404 (not 403 — we don't reveal it exists)
b=$(curl -s -X POST $base/auth/register -H "Content-Type: application/json" -d "{\"email\":\"b$RANDOM@e.com\",\"password\":\"Str0ng!Passw0rd\"}" | jq -r .data.accessToken)
echo "cross-user → $(curl -s -o /dev/null -w '%{http_code}' -X PATCH $base/notifications/$nid/read -H "Authorization: Bearer $b")"   # 404

# no token at all → 401
echo "no token   → $(curl -s -o /dev/null -w '%{http_code}' $base/notifications)"   # 401
```

| Case | Expected |
|---|---|
| No token | **401** |
| Mark another user's notification | **404** (ownership-scoped, not revealed) |
| `PATCH /notifications/:bad-uuid/read` | **400** (ParseUUIDPipe) |
| Mark an already-read notification | **200** (idempotent, no extra write) |

---

## 7. Verify in the database & logs

```bash
# in-app notifications (read_at null = unread)
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"SELECT type, title, (read_at IS NOT NULL) AS read, created_at FROM notifications ORDER BY created_at DESC LIMIT 5;"
```

**Email delivery (dev):** there's no inbox — the console transport logs each send. In the `start:dev` terminal, after a registration you'll see:
```
[Mail] EMAIL from=no-reply@enterprise.local to=<email> subject="Welcome to the platform"
```
(The body is logged at debug level.)

---

## 8. Automated tests

```powershell
npm test            # NotificationsService unit
npm run test:e2e    # test/notifications.e2e-spec.ts
```

| File | Covers |
|---|---|
| `src/modules/notifications/notifications.service.spec.ts` | mark-read 404 (not yours), already-read no-op, welcome send + in-app create, **resilience** (never throws if mail fails) |
| `test/notifications.e2e-spec.ts` | 401 without token, **event-driven welcome appears** (polled), unread-count, mark read, cross-user 404, read-all |

> Like the audit e2e, the notifications e2e **polls** for the welcome row because the delivery is fire-and-forget.

---

## 9. Troubleshooting

| Symptom | Explanation / fix |
|---|---|
| No welcome notification after register | It's async — wait ~0.5–1s and re-list. Confirm the server logged the `[Mail] EMAIL ...` line. |
| No email arrives in an inbox | Dev uses the **console** transport (logs only). Bind an SMTP provider to `MAIL_PROVIDER` for real delivery. |
| `PATCH /:id/read` → 404 for your own notif | Double-check you used *your* token and the `id` from *your* list. |
| Want real emails | Implement an `SmtpMailProvider` (MailProvider interface) and bind it to `MAIL_PROVIDER` in `notifications.module.ts` — no service changes. |
| Want to trigger notifications on other events | Emit a domain event (see `shared/events/app.event.ts`) and add an `@OnEvent` handler in `NotificationsListener`. |
| Change the sender address | Set `MAIL_FROM` in `.env`. |
