import {
  buildOtpAuthUrl,
  generateSecret,
  generateTotp,
  verifyTotp,
} from './totp.util';

describe('totp.util', () => {
  it('generates a base32 secret', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(16);
  });

  it('verifies a freshly generated code', () => {
    const secret = generateSecret();
    const code = generateTotp(secret);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = generateSecret();
    const code = generateTotp(secret);
    const wrong = code === '000000' ? '111111' : '000000';
    expect(verifyTotp(secret, wrong)).toBe(false);
  });

  it('rejects non-6-digit input', () => {
    const secret = generateSecret();
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp(secret, '12345')).toBe(false);
  });

  it('accepts a code from the previous step (drift tolerance)', () => {
    const secret = generateSecret();
    const prevStep = generateTotp(secret, Date.now() - 30_000);
    expect(verifyTotp(secret, prevStep)).toBe(true);
  });

  it('builds a scannable otpauth URI', () => {
    const url = buildOtpAuthUrl('Acme', 'jane@example.com', 'ABC234');
    expect(url).toContain('otpauth://totp/');
    expect(url).toContain('secret=ABC234');
    expect(url).toContain('issuer=Acme');
  });
});
