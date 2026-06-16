# Testing Guide — Phase 8: File Management

> How to test file upload, download, listing, deletion, type/size validation, and RBAC — by hand (Swagger, PowerShell, curl), in the DB/filesystem, and via the automated suite.
>
> Prior guides: [`TESTING-PHASE-7-AUDIT.md`](TESTING-PHASE-7-AUDIT.md) · Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md)

---

## 0. Prerequisites

```powershell
npm run docker:up
npm run prisma:migrate   # applies the files table
npm run db:seed          # admin gains file:read / file:create / file:delete
npm run start:dev
```

| Base URL | `http://localhost:8000/api/v1` |
|---|---|
| Admin (has `file:*`) | `admin@example.com` / `Admin123!ChangeMe` |
| Allowed types (default) | `image/png`, `image/jpeg`, `image/gif`, `application/pdf`, `text/plain` |
| Max size (default) | 5 MB (`UPLOAD_MAX_SIZE_MB`) |

---

## 1. Mental model

- The **bytes** live in a storage backend (local disk under `UPLOAD_DIR`, default `./uploads`); the database stores only **metadata** (`originalName`, `mimeType`, `size`, `uploaderId`, …) plus an internal `storageKey`.
- The `storageKey` is **never exposed** in API responses — you reference files by their `id`.
- **Storage is swappable**: everything depends on a `StorageProvider` interface bound to the `STORAGE_PROVIDER` token. Local disk today; bind an S3 provider and nothing else changes.
- **Delete** removes the physical object **and** soft-deletes the row (metadata/history retained; reads exclude it).
- Validation (type + size) is **config-driven** and returns a clean `400`.

---

## 2. Endpoint map

| Method | Path | Required | Notes |
|--------|------|----------|-------|
| POST | `/files` | `file:create` | `multipart/form-data`, field name **`file`** |
| GET | `/files` | `file:read` | paginated (`page`, `limit`) |
| GET | `/files/:id` | `file:read` | metadata only |
| GET | `/files/:id/download` | `file:read` | binary stream (not enveloped) |
| DELETE | `/files/:id` | `file:delete` | `204` |

`POST/GET/GET:id` use the standard JSON envelope (payload under `data`). **`/download` is exempt** — it returns raw bytes with `Content-Disposition: attachment`.

---

## 3. Swagger

1. **POST /auth/login** as admin → copy `data.accessToken` → **Authorize** 🔓.
2. **Files → POST /files** → **Try it out**. The `file` field shows a **file picker** (thanks to `multipart/form-data`). Choose a small `.txt`/`.png`/`.pdf` → **Execute** → `201` with metadata (note: no `storageKey`).
3. Copy the returned `id`.
4. **GET /files** → see it listed. **GET /files/:id** → metadata.
5. **GET /files/:id/download** → Swagger offers the file to download.
6. **DELETE /files/:id** → `204`. Re-fetch → `404`.

---

## 4. PowerShell

PowerShell 5.1's `Invoke-RestMethod` multipart support is fiddly — the simplest reliable path is `curl.exe` (bundled with Windows 10/11):

```powershell
$base = "http://localhost:8000/api/v1"
$admin = (Invoke-RestMethod "$base/auth/login" -Method Post -ContentType application/json -Body (@{
  email="admin@example.com"; password="Admin123!ChangeMe" } | ConvertTo-Json)).data.accessToken

"hello phase 8" | Out-File -Encoding ascii sample.txt

# upload (note: curl.exe, not the PowerShell alias)
$up = curl.exe -s -X POST "$base/files" -H "Authorization: Bearer $admin" `
  -F "file=@sample.txt;type=text/plain" | ConvertFrom-Json
$fid = $up.data.id
$up.data | Select-Object id, originalName, mimeType, size

# download
curl.exe -s "$base/files/$fid/download" -H "Authorization: Bearer $admin"

# delete
curl.exe -s -o NUL -w "%{http_code}`n" -X DELETE "$base/files/$fid" -H "Authorization: Bearer $admin"   # 204
```

> If you prefer pure PowerShell 7+, `Invoke-RestMethod -Form @{ file = Get-Item .\sample.txt }` works there.

---

## 5. curl (Git Bash / WSL / macOS / Linux)

> ⚠️ **Windows gotcha:** native `curl.exe` resolves `-F "file=@PATH"` against the *Windows* filesystem, not Git Bash's `/tmp`. Use a **path in the project directory** (e.g. `sample.txt`), not `/tmp/...`.

```bash
base=http://localhost:8000/api/v1
admin=$(curl -s -X POST $base/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!ChangeMe"}' | jq -r .data.accessToken)

printf 'hello phase 8\n' > sample.txt

# upload
up=$(curl -s -X POST $base/files -H "Authorization: Bearer $admin" \
  -F "file=@sample.txt;type=text/plain")
fid=$(jq -r .data.id <<<"$up")
jq '.data | {id, originalName, mimeType, size, storageKey}' <<<"$up"   # storageKey is null/absent

# download → original bytes
curl -s $base/files/$fid/download -H "Authorization: Bearer $admin"

# list
curl -s "$base/files?limit=10" -H "Authorization: Bearer $admin" | jq '.data[] | {id, originalName}'

# delete + verify gone
curl -s -o /dev/null -w "delete: %{http_code}\n" -X DELETE $base/files/$fid -H "Authorization: Bearer $admin"   # 204
curl -s -o /dev/null -w "after:  %{http_code}\n" $base/files/$fid -H "Authorization: Bearer $admin"             # 404
rm sample.txt
```

---

## 6. Validation & RBAC (the negative cases)

| What you send | Expected | Why |
|---|---|---|
| `POST /files` with no token | **401** | Not authenticated |
| `POST /files` as a user without `file:create` | **403** | RBAC |
| `POST /files` with no `file` part | **400** | `ParseFilePipe` (file required) |
| `POST /files` with a disallowed type (e.g. `.exe`) | **400** | Mime not in `UPLOAD_ALLOWED_MIME` |
| `POST /files` larger than `UPLOAD_MAX_SIZE_MB` | **400** | Size policy (service) |
| `GET /files/:id` for a deleted/unknown id | **404** | Soft-deleted rows are invisible |
| `GET /files/:bad-uuid` | **400** | `ParseUUIDPipe` |

```bash
# disallowed type → 400
printf 'MZ' > evil.exe
curl -s -o /dev/null -w "exe: %{http_code}\n" -X POST $base/files \
  -H "Authorization: Bearer $admin" -F "file=@evil.exe;type=application/x-msdownload"   # 400
rm evil.exe

# missing file part → 400
curl -s -o /dev/null -w "nofile: %{http_code}\n" -X POST $base/files -H "Authorization: Bearer $admin"   # 400

# no permission (fresh user) → 403
utok=$(curl -s -X POST $base/auth/register -H "Content-Type: application/json" \
  -d "{\"email\":\"f$RANDOM@e.com\",\"password\":\"Str0ng!Passw0rd\"}" | jq -r .data.accessToken)
printf 'x' > s.txt
curl -s -o /dev/null -w "noperm: %{http_code}\n" -X POST $base/files \
  -H "Authorization: Bearer $utok" -F "file=@s.txt;type=text/plain"   # 403
rm s.txt
```

> Want to allow more types or a bigger limit? Edit `UPLOAD_ALLOWED_MIME` / `UPLOAD_MAX_SIZE_MB` in `.env` and restart.

---

## 7. Verify storage & database

```bash
# metadata row (note: storage_key is internal, never returned by the API)
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"SELECT original_name, mime_type, size, (deleted_at IS NOT NULL) AS deleted, left(storage_key,12) AS key FROM files ORDER BY created_at DESC LIMIT 5;"

# the physical object on disk (key = <uuid><ext>)
ls -la uploads/
```
After a **delete**, the row shows `deleted = t` and the file disappears from `uploads/` — the bytes are gone, the audit/metadata history stays.

Audit trail records every action:
```bash
curl -s "$base/audit-logs?action=file.uploaded&limit=3" -H "Authorization: Bearer $admin" | jq '.data[] | {action, actorId, resourceId, metadata}'
```

---

## 8. Automated tests

```powershell
npm test            # FilesService unit (validation, store/persist, download, delete)
npm run test:e2e    # test/files.e2e-spec.ts
```

| File | Covers |
|---|---|
| `src/modules/files/files.service.spec.ts` | mime/size validation (storage untouched on reject), key generation + hidden, download bytes, delete order (object then row), 404s |
| `test/files.e2e-spec.ts` | 401 / 403 / 400 (no file) / 400 (bad mime) / upload (no key leaked) / list / **download exact bytes** / delete / 404 |

> The download e2e uses a custom supertest `.parse()` to buffer the binary body — handy if you write your own download tests.

---

## 9. Troubleshooting

| Symptom | Explanation / fix |
|---|---|
| curl upload sends nothing / `http=000` (Windows) | `-F "file=@/tmp/..."` — native curl can't see Git Bash `/tmp`. Use a path in the project folder. |
| Upload → **400 "Unsupported file type"** | The mime isn't in `UPLOAD_ALLOWED_MIME`. Add it (and restart) or send an allowed type. |
| Upload → **400 "exceeds the maximum size"** | Bigger than `UPLOAD_MAX_SIZE_MB`. Raise it or send a smaller file. |
| Upload → **413 / connection reset** for a huge file | Above the 25 MB absolute Multer backstop (memory safety). The configurable policy is the lower `UPLOAD_MAX_SIZE_MB`. |
| `/download` body looks like JSON | You hit `/files/:id` (metadata) — the download path is `/files/:id/download`. |
| Files vanish after `git clean` | `uploads/` is gitignored (local-only); that's expected. Use S3 for shared/persistent storage. |
| Need S3 instead of disk | Implement an `S3StorageProvider` (StorageProvider interface) and bind it to `STORAGE_PROVIDER` in `files.module.ts` — no other changes. |
