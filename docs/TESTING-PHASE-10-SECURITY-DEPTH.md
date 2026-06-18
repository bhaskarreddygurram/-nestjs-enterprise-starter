# Testing Guide — Phase 10: Security Depth

> How to test the four security features added in this phase — **password policy**, **account lockout**, **password reset**, **change password**, and **TOTP 2FA** — by hand (Swagger, PowerShell, curl), in the DB, and via the automated suite.
>
> Prior guides: [`TESTING-PHASE-9-NOTIFICATIONS.md`](TESTING-PHASE-9-NOTIFICATIONS.md) · Run guide: [`RUNNING-THE-PROJECT.md`](RUNNING-THE-PROJECT.md)

---

## 0. Prerequisites

```powershell
npm run docker:up
npm run prisma:migrate   # applies the lockout fields + reset/recovery tables
npm run db:seed
npm run start:dev        # watch the console — the dev mail transport logs reset emails here
```

| Base URL | `http://localhost:8000/api/v1` |
|---|---|

> 📧 Password-reset emails use the **console** mail transport in dev — the link (with the token) is **logged in the server console**, not delivered. Watch the `start:dev` terminal for `[Mail] EMAIL ... subject="Reset your password"`.
>
> 🔐 2FA is **TOTP** (RFC 6238). To test by hand you need an authenticator app (Google Authenticator, Authy, 1Password…) to scan the QR, or use the scripted helper in §5.

---

## 1. Mental model

Four independent hardening features layered onto the existing auth stack:

```
                 ┌───────────────────────── login ─────────────────────────┐
  email+password │  validateCredentials                                     │
  ───────────────┤   ├─ locked? ───────────────► 401 "locked"               │
                 │   ├─ wrong  ─► count++ ─► (>= max) lock for N min ► 401    │
                 │   └─ ok     ─► clear counter                              │
                 │        └─ 2FA on?  ─► return { twoFactorRequired,         │
                 │                                challengeToken }           │
                 └──────────────────────────────────────────────────────────┘
                                        │ (2-step)
            POST /auth/2fa/authenticate (challengeToken + TOTP/recovery) ─► tokens
```

- **Password policy** is centralised in one decorator (`@IsStrongPassword()`), so register, reset and change can never drift apart.
- **Lockout** state lives on the user row (`failed_login_attempts`, `locked_until`); a successful login clears it.
- **Reset tokens** are single-use + expiring; only the **SHA-256 hash** is stored. `forgot-password` always returns `204` (no account enumeration). A successful reset **revokes every session**.
- **2FA** secrets + recovery codes are stored hashed; the second login step exchanges a short-lived `challengeToken` for real tokens. The challenge token is **rejected as an access token**.

---

## 2. Endpoint map

| Method | Path | Auth | Result |
|--------|------|------|--------|
| POST | `/auth/forgot-password` | public | `204` always; emails a reset link if the account exists |
| POST | `/auth/reset-password` | public | `204`; sets new password, revokes all sessions |
| POST | `/auth/change-password` | 🔒 Bearer | `204`; verifies current password, revokes sessions |
| POST | `/auth/2fa/setup` | 🔒 Bearer | secret + `otpauth://` URL + QR data URL |
| POST | `/auth/2fa/enable` | 🔒 Bearer | confirms a code, returns 10 one-time recovery codes |
| POST | `/auth/2fa/disable` | 🔒 Bearer | `204`; needs a valid TOTP/recovery code |
| POST | `/auth/2fa/authenticate` | public | challenge + code → token pair |

`login` is unchanged for non-2FA accounts. With 2FA on it returns `{ twoFactorRequired: true, challengeToken }` instead of tokens.

---

## 3. Password policy

Policy: **8–128 chars, with at least one uppercase, one lowercase, one digit and one special character.**

```bash
base=http://localhost:8000/api/v1
# weak (no special char) → 400
curl -s -o /dev/null -w "weak → %{http_code}\n" -X POST $base/auth/register \
  -H "Content-Type: application/json" -d '{"email":"w@e.com","password":"Weakpass1"}'   # 400
# strong → 201
curl -s -o /dev/null -w "strong → %{http_code}\n" -X POST $base/auth/register \
  -H "Content-Type: application/json" -d '{"email":"s1@e.com","password":"Str0ng!Passw0rd"}'  # 201
```

| Password | Result | Why |
|---|---|---|
| `short` | 400 | too short |
| `Weakpass1` | 400 | no special char |
| `weakpass1!` | 400 | no uppercase |
| `Str0ng!Passw0rd` | 201 | passes |

---

## 4. Account lockout

Default: **5** failed attempts → locked for **15** minutes (`SECURITY_MAX_LOGIN_ATTEMPTS` / `SECURITY_LOCKOUT_MINUTES`).

```powershell
$base = "http://localhost:8000/api/v1"
$em = "lock-$(Get-Random)@example.com"
Invoke-RestMethod "$base/auth/register" -Method Post -ContentType application/json -Body (@{
  email=$em; password="Str0ng!Passw0rd" } | ConvertTo-Json) | Out-Null

# 5 wrong attempts
1..5 | ForEach-Object {
  try { Invoke-RestMethod "$base/auth/login" -Method Post -ContentType application/json -Body (@{
    email=$em; password="WrongPass1!" } | ConvertTo-Json) } catch { "attempt $_ → 401" }
}

# now even the CORRECT password is refused, with a lockout message
try {
  Invoke-RestMethod "$base/auth/login" -Method Post -ContentType application/json -Body (@{
    email=$em; password="Str0ng!Passw0rd" } | ConvertTo-Json)
} catch {
  $_.ErrorDetails.Message    # → message contains "locked"
}
```

> ⏱️ The lock auto-expires after the window. To clear it immediately in dev, reset the row (see §8) or wait it out. A successful login (after the window) zeroes the counter.

---

## 5. Password reset (end-to-end)

Because the token only goes to the (console) email, grab it from the server log.

```bash
base=http://localhost:8000/api/v1
em="reset-$RANDOM@example.com"
curl -s -X POST $base/auth/register -H "Content-Type: application/json" \
  -d "{\"email\":\"$em\",\"password\":\"Str0ng!Passw0rd\"}" > /dev/null

# 1. request a reset → always 204
curl -s -o /dev/null -w "forgot → %{http_code}\n" -X POST $base/auth/forgot-password \
  -H "Content-Type: application/json" -d "{\"email\":\"$em\"}"   # 204
```

Now look at the `start:dev` console for the reset line and copy the `token=...` value from the URL:

```
[Mail] EMAIL from=... to=reset-...@example.com subject="Reset your password"
... http://localhost:3000/reset-password?token=<COPY THIS>
```

```bash
# 2. set the new password (revokes all sessions)
tok=<paste the token>
curl -s -o /dev/null -w "reset → %{http_code}\n" -X POST $base/auth/reset-password \
  -H "Content-Type: application/json" -d "{\"token\":\"$tok\",\"password\":\"N3w!Passw0rd\"}"  # 204

# 3. old password fails, new one works
curl -s -o /dev/null -w "old → %{http_code}\n" -X POST $base/auth/login \
  -H "Content-Type: application/json" -d "{\"email\":\"$em\",\"password\":\"Str0ng!Passw0rd\"}"  # 401
curl -s -o /dev/null -w "new → %{http_code}\n" -X POST $base/auth/login \
  -H "Content-Type: application/json" -d "{\"email\":\"$em\",\"password\":\"N3w!Passw0rd\"}"  # 200
```

| Case | Expected |
|---|---|
| `forgot-password` for any email (exists or not) | **204** (no enumeration) |
| `reset-password` with a bogus/expired/used token | **400** |
| Reuse a token after a successful reset | **400** (single-use) |
| Login with the old password after reset | **401** |

---

## 6. Change password (authenticated)

```powershell
$base = "http://localhost:8000/api/v1"
$em = "chg-$(Get-Random)@example.com"
$tok = (Invoke-RestMethod "$base/auth/register" -Method Post -ContentType application/json -Body (@{
  email=$em; password="Str0ng!Passw0rd" } | ConvertTo-Json)).data.accessToken
$h = @{ Authorization = "Bearer $tok" }

# wrong current password → 401
try { Invoke-RestMethod "$base/auth/change-password" -Method Post -Headers $h -ContentType application/json -Body (@{
  currentPassword="nope"; newPassword="Ch4nged!Pass" } | ConvertTo-Json) } catch { "wrong current → 401" }

# correct → 204, then new password logs in, old one doesn't
Invoke-RestMethod "$base/auth/change-password" -Method Post -Headers $h -ContentType application/json -Body (@{
  currentPassword="Str0ng!Passw0rd"; newPassword="Ch4nged!Pass" } | ConvertTo-Json)
```

---

## 7. TOTP 2FA (full flow)

### 7a. With an authenticator app (manual)

1. Log in, copy `data.accessToken`, **Authorize** 🔓 in Swagger.
2. **POST /auth/2fa/setup** → copy `data.qrCodeDataUrl` into a browser (it's a QR image) and scan it, or type `data.secret` into the app manually.
3. **POST /auth/2fa/enable** with `{ "code": "<6-digit from app>" }` → returns **10 recovery codes** (store them; shown once).
4. Log out and **POST /auth/login** again → now returns `{ twoFactorRequired: true, challengeToken }` — **no tokens**.
5. **POST /auth/2fa/authenticate** with `{ challengeToken, code: "<6-digit>" }` → token pair.
6. To turn it off: **POST /auth/2fa/disable** with a current code → `204`.

### 7b. Scripted (no phone needed)

The repo ships a from-scratch TOTP implementation; reuse it to generate codes:

```powershell
$base = "http://localhost:8000/api/v1"
$em = "2fa-$(Get-Random)@example.com"
$tok = (Invoke-RestMethod "$base/auth/register" -Method Post -ContentType application/json -Body (@{
  email=$em; password="Str0ng!Passw0rd" } | ConvertTo-Json)).data.accessToken
$h = @{ Authorization = "Bearer $tok" }

# setup → get the secret
$secret = (Invoke-RestMethod "$base/auth/2fa/setup" -Method Post -Headers $h).data.secret

# generate a TOTP code for that secret using the project's util
$code = node -e "console.log(require('./dist/modules/auth/totp.util').generateTotp('$secret'))"

# enable → recovery codes
$rec = (Invoke-RestMethod "$base/auth/2fa/enable" -Method Post -Headers $h -ContentType application/json -Body (@{ code=$code } | ConvertTo-Json)).data.recoveryCodes
"recovery codes: $($rec -join ', ')"

# login now returns a challenge
$login = Invoke-RestMethod "$base/auth/login" -Method Post -ContentType application/json -Body (@{ email=$em; password="Str0ng!Passw0rd" } | ConvertTo-Json)
"twoFactorRequired: $($login.data.twoFactorRequired)"

# complete with a fresh code
$code2 = node -e "console.log(require('./dist/modules/auth/totp.util').generateTotp('$secret'))"
$final = Invoke-RestMethod "$base/auth/2fa/authenticate" -Method Post -ContentType application/json -Body (@{ challengeToken=$login.data.challengeToken; code=$code2 } | ConvertTo-Json)
"got access token: $([bool]$final.data.accessToken)"
```

> Requires a prior `npm run build` (the helper imports from `dist/`). A **recovery code** works anywhere a TOTP code does, but only **once**.

### Security checks

| Case | Expected |
|---|---|
| `authenticate` with a wrong code | **401** |
| Use the `challengeToken` as a Bearer token on `GET /auth/me` | **401** (challenge ≠ access) |
| Reuse a one-time recovery code | **401** the second time |
| `2fa/enable` with a wrong code | **400** |

---

## 8. Verify in the database

```bash
# lockout state
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"SELECT email, failed_login_attempts, locked_until, two_factor_enabled FROM users ORDER BY created_at DESC LIMIT 5;"

# reset tokens (only hashes are stored; used_at marks consumption)
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"SELECT user_id, left(token_hash,12) AS hash, expires_at, used_at FROM password_reset_tokens ORDER BY created_at DESC LIMIT 5;"

# recovery codes (argon2 hashes; used_at marks consumption)
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"SELECT user_id, used_at FROM two_factor_recovery_codes ORDER BY created_at DESC LIMIT 12;"

# manually clear a lockout in dev
docker exec -it enterprise_postgres psql -U postgres -d enterprise_db -c \
"UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE email='<email>';"
```

---

## 9. Automated tests

```powershell
npm test            # unit
npm run test:e2e    # test/security.e2e-spec.ts (+ all others)
```

| File | Covers |
|---|---|
| `src/modules/auth/totp.util.spec.ts` | base32 secret, code generate/verify, drift window, otpauth URL |
| `src/modules/auth/two-factor.service.spec.ts` | enable (valid/invalid/no-secret), TOTP + one-time recovery-code verification |
| `src/modules/auth/password-reset.service.spec.ts` | no-enumeration request, invalid/used/expired token, happy-path reset + session revoke |
| `src/modules/auth/auth.service.spec.ts` | 2FA challenge on login, failed-attempt counting, lockout trigger, locked-account rejection |
| `test/security.e2e-spec.ts` | end-to-end: policy, lockout, reset (token from captured email), change password, full 2FA login + recovery + challenge-can't-be-access-token + disable |

> The e2e overrides `MAIL_PROVIDER` with a capturing fake to read the reset token out of the email body and drive the reset path for real.

---

## 10. Troubleshooting

| Symptom | Explanation / fix |
|---|---|
| Locked out during testing | Wait for the window, or clear the row (see §8). A good login resets the counter. |
| No reset email in an inbox | Dev uses the **console** transport — read the link from the `start:dev` log. Bind an SMTP `MailProvider` to `MAIL_PROVIDER` for real delivery. |
| `reset-password` always 400 | Token is single-use + expiring — request a fresh one; copy the whole `token=` value. |
| 2FA code rejected | Clock drift — the server tolerates ±30s. Ensure the device clock is correct; in scripts, generate the code immediately before the call. |
| `challengeToken` rejected on `/me` | Expected — it only works at `/auth/2fa/authenticate`, never as an access token. |
| Want a different lockout/reset policy | Set `SECURITY_MAX_LOGIN_ATTEMPTS`, `SECURITY_LOCKOUT_MINUTES`, `PASSWORD_RESET_TTL_MINUTES` in `.env`. |
| Production note | Encrypt `users.two_factor_secret` at rest (e.g. KMS) — it's stored plaintext base32 in this starter for simplicity. |
