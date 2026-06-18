import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Self-contained TOTP (RFC 6238) on top of Node's crypto — no third-party OTP
 * dependency. Compatible with Google Authenticator, Authy, 1Password, etc.
 * (SHA-1, 6 digits, 30s period — the de-facto authenticator defaults).
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_SECONDS = 30;
const DIGITS = 6;

/** RFC 4648 base32 encode (no padding). */
function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/** RFC 4648 base32 decode (tolerates lowercase, spaces and '=' padding). */
function base32Decode(input: string): Buffer {
  const clean = input.replace(/[=\s]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      continue;
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new random base32 secret (default 20 bytes / 160 bits). */
export function generateSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

/** HOTP (RFC 4226) for a given counter. */
function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

/** Current TOTP code for a secret (mainly used by tests). */
export function generateTotp(secret: string, epochMs = Date.now()): string {
  const counter = Math.floor(epochMs / 1000 / PERIOD_SECONDS);
  return hotp(base32Decode(secret), counter);
}

/**
 * Verify a TOTP code, tolerating ±`window` time steps of drift. Constant-time
 * comparison avoids leaking timing information.
 */
export function verifyTotp(secret: string, token: string, window = 1): boolean {
  if (!/^\d{6}$/.test(token)) {
    return false;
  }
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / PERIOD_SECONDS);
  for (let i = -window; i <= window; i++) {
    if (timingSafeEqualStr(hotp(key, counter + i), token)) {
      return true;
    }
  }
  return false;
}

/** Build an otpauth:// URI for QR-code enrollment. */
export function buildOtpAuthUrl(
  issuer: string,
  label: string,
  secret: string,
): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
    label,
  )}?${params.toString()}`;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
