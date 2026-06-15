import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Refresh-token rotation + reuse detection + logout flows.
 * Requires the docker infra to be running (`npm run docker:up`).
 */
describe('Refresh tokens (e2e)', () => {
  let app: INestApplication;
  const email = `e2e-refresh-${Date.now()}@example.com`;
  const password = 'Str0ng!Passw0rd';

  const post = (path: string, body?: object) =>
    request(app.getHttpServer()).post(`/api/v1${path}`).send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  it('register returns both an access and a refresh token', async () => {
    const res = await post('/auth/register', { email, password }).expect(201);
    const body = res.body as { accessToken: string; refreshToken: string };
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toContain('.');
  });

  it('rotates: refresh issues a new pair and the old token stops working', async () => {
    const login = await post('/auth/login', { email, password }).expect(200);
    const first = (login.body as { refreshToken: string }).refreshToken;

    // Use the refresh token once → get a new one.
    const refreshed = await post('/auth/refresh', {
      refreshToken: first,
    }).expect(200);
    const second = (refreshed.body as { refreshToken: string }).refreshToken;
    expect(second).not.toBe(first);

    // The NEW token works.
    await post('/auth/refresh', { refreshToken: second }).expect(200);
  });

  it('detects reuse: replaying a rotated token → 401 and kills the family', async () => {
    const login = await post('/auth/login', { email, password }).expect(200);
    const original = (login.body as { refreshToken: string }).refreshToken;

    // Rotate once → `original` is now revoked, `next` is active.
    const rotated = await post('/auth/refresh', {
      refreshToken: original,
    }).expect(200);
    const next = (rotated.body as { refreshToken: string }).refreshToken;

    // Replay the OLD token → reuse detected → 401.
    await post('/auth/refresh', { refreshToken: original }).expect(401);

    // Reuse response revokes the whole family, so `next` is dead too.
    await post('/auth/refresh', { refreshToken: next }).expect(401);
  });

  it('rejects a garbage refresh token with 401', () => {
    return post('/auth/refresh', { refreshToken: 'bogus.token' }).expect(401);
  });

  it('logout revokes a single session', async () => {
    const login = await post('/auth/login', { email, password }).expect(200);
    const rt = (login.body as { refreshToken: string }).refreshToken;

    await post('/auth/logout', { refreshToken: rt }).expect(204);
    // Revoked token can no longer be refreshed.
    await post('/auth/refresh', { refreshToken: rt }).expect(401);
  });

  it('logout-all revokes every session for the user', async () => {
    const a = (
      (await post('/auth/login', { email, password }).expect(200)).body as {
        refreshToken: string;
      }
    ).refreshToken;
    const loginB = await post('/auth/login', { email, password }).expect(200);
    const accessB = (loginB.body as { accessToken: string }).accessToken;
    const b = (loginB.body as { refreshToken: string }).refreshToken;

    // Authenticated logout-all using session B's access token.
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessB}`)
      .expect(204);

    // Both refresh tokens are now dead.
    await post('/auth/refresh', { refreshToken: a }).expect(401);
    await post('/auth/refresh', { refreshToken: b }).expect(401);
  });
});
