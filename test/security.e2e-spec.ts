import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'http';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { MAIL_PROVIDER, MailMessage } from '../src/modules/mail/mail.interface';
import { generateTotp } from '../src/modules/auth/totp.util';

/**
 * Phase 10 — security depth: password policy, account lockout, password reset,
 * change password, and TOTP 2FA. Requires docker infra + a migrated DB.
 *
 * The mail transport is overridden with a capturing fake so the reset token
 * (normally only emailed) can be extracted and used end-to-end.
 */
describe('Security depth (e2e)', () => {
  let app: INestApplication;
  const sentMail: MailMessage[] = [];

  const stamp = Date.now();
  const password = 'Str0ng!Passw0rd';
  const http = (): Server => app.getHttpServer() as Server;

  const register = (email: string) =>
    request(http())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(201);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAIL_PROVIDER)
      .useValue({
        send: (m: MailMessage) => {
          sentMail.push(m);
          return Promise.resolve();
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('password policy', () => {
    it('rejects a password without a special character → 400', () => {
      return request(http())
        .post('/api/v1/auth/register')
        .send({ email: `weak-${stamp}@example.com`, password: 'Weakpass1' })
        .expect(400);
    });

    it('accepts a strong password', () => {
      return register(`strong-${stamp}@example.com`);
    });
  });

  describe('account lockout', () => {
    const email = `lock-${stamp}@example.com`;

    beforeAll(() => register(email));

    it('locks the account after 5 failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await request(http())
          .post('/api/v1/auth/login')
          .send({ email, password: 'WrongPass1!' })
          .expect(401);
      }

      // Even the correct password is now refused, with a lockout message.
      const res = await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(401);
      expect((res.body as { message: string }).message).toMatch(/locked/i);
    });
  });

  describe('password reset', () => {
    const email = `reset-${stamp}@example.com`;
    const newPassword = 'R3set!Passw0rd';

    beforeAll(() => register(email));

    it('forgot-password returns 204 for an unknown email (no enumeration)', () => {
      return request(http())
        .post('/api/v1/auth/forgot-password')
        .send({ email: `ghost-${stamp}@example.com` })
        .expect(204);
    });

    it('rejects an invalid reset token → 400', () => {
      return request(http())
        .post('/api/v1/auth/reset-password')
        .send({ token: 'not-a-real-token', password: newPassword })
        .expect(400);
    });

    it('resets the password end-to-end via the emailed token', async () => {
      sentMail.length = 0;
      await request(http())
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(204);

      // give the (awaited) mail send a tick
      const mail = sentMail.find((m) => m.to === email);
      expect(mail).toBeDefined();
      const token = /token=([a-f0-9]+)/.exec(mail!.body)?.[1];
      expect(token).toBeDefined();

      await request(http())
        .post('/api/v1/auth/reset-password')
        .send({ token, password: newPassword })
        .expect(204);

      // old password no longer works; the new one does
      await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(401);
      await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    });
  });

  describe('change password', () => {
    const email = `change-${stamp}@example.com`;
    const newPassword = 'Ch4nged!Pass';
    let token: string;

    beforeAll(async () => {
      const res = await register(email);
      token = (res.body as { data: { accessToken: string } }).data.accessToken;
    });

    it('rejects a wrong current password → 401', () => {
      return request(http())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'Wr0ng!Pass', newPassword })
        .expect(401);
    });

    it('changes the password, then the new one works and the old one fails', async () => {
      await request(http())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: password, newPassword })
        .expect(204);

      await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(401);
      await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password: newPassword })
        .expect(200);
    });
  });

  describe('TOTP 2FA', () => {
    const email = `2fa-${stamp}@example.com`;
    let token: string;
    let secret: string;
    let recoveryCodes: string[];

    beforeAll(async () => {
      const res = await register(email);
      token = (res.body as { data: { accessToken: string } }).data.accessToken;
    });

    it('sets up + enables 2FA, returning recovery codes', async () => {
      const setup = await request(http())
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      const setupBody = setup.body as {
        data: { secret: string; otpauthUrl: string; qrCodeDataUrl: string };
      };
      secret = setupBody.data.secret;
      expect(setupBody.data.otpauthUrl).toContain('otpauth://totp/');
      expect(setupBody.data.qrCodeDataUrl).toContain('data:image/png;base64');

      const enable = await request(http())
        .post('/api/v1/auth/2fa/enable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: generateTotp(secret) })
        .expect(201);
      recoveryCodes = (enable.body as { data: { recoveryCodes: string[] } })
        .data.recoveryCodes;
      expect(recoveryCodes).toHaveLength(10);
    });

    it('login now returns a 2FA challenge instead of tokens', async () => {
      const res = await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      const body = res.body as {
        data: { twoFactorRequired?: boolean; accessToken?: string };
      };
      expect(body.data.twoFactorRequired).toBe(true);
      expect(body.data.accessToken).toBeUndefined();
    });

    it('rejects authenticate with a bad code → 401', async () => {
      const login = await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      const challengeToken = (
        login.body as { data: { challengeToken: string } }
      ).data.challengeToken;

      await request(http())
        .post('/api/v1/auth/2fa/authenticate')
        .send({ challengeToken, code: '000000' })
        .expect(401);
    });

    it('completes login with a valid TOTP code', async () => {
      const login = await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      const challengeToken = (
        login.body as { data: { challengeToken: string } }
      ).data.challengeToken;

      const res = await request(http())
        .post('/api/v1/auth/2fa/authenticate')
        .send({ challengeToken, code: generateTotp(secret) })
        .expect(200);
      expect(
        (res.body as { data: { accessToken: string } }).data.accessToken,
      ).toBeDefined();
    });

    it('completes login with a one-time recovery code (then it is consumed)', async () => {
      const code = recoveryCodes[0];
      const firstLogin = await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      const t1 = (firstLogin.body as { data: { challengeToken: string } }).data
        .challengeToken;
      await request(http())
        .post('/api/v1/auth/2fa/authenticate')
        .send({ challengeToken: t1, code })
        .expect(200);

      // reusing the same recovery code fails
      const secondLogin = await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      const t2 = (secondLogin.body as { data: { challengeToken: string } }).data
        .challengeToken;
      await request(http())
        .post('/api/v1/auth/2fa/authenticate')
        .send({ challengeToken: t2, code })
        .expect(401);
    });

    it('a 2FA challenge token cannot be used as an access token', async () => {
      const login = await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      const challengeToken = (
        login.body as { data: { challengeToken: string } }
      ).data.challengeToken;

      await request(http())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${challengeToken}`)
        .expect(401);
    });

    it('disables 2FA with a valid code', async () => {
      await request(http())
        .post('/api/v1/auth/2fa/disable')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: generateTotp(secret) })
        .expect(204);

      // login returns tokens directly again
      const res = await request(http())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      expect(
        (res.body as { data: { accessToken?: string } }).data.accessToken,
      ).toBeDefined();
    });
  });
});
