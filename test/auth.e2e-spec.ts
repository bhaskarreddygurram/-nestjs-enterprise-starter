import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Authentication flow against the real app + database.
 * Requires the docker infra to be running (`npm run docker:up`).
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let token: string;

  const email = `e2e-auth-flow-${Date.now()}@example.com`;
  const password = 'Str0ng!Passw0rd';

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

  it('POST /auth/register → 201 returns a token, no hash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Flow' })
      .expect(201);

    const body = (
      res.body as {
        data: { accessToken: string; user: Record<string, unknown> };
      }
    ).data;
    expect(body.accessToken).toBeDefined();
    expect(body.user.email).toBe(email);
    expect(body.user.passwordHash).toBeUndefined();
  });

  it('POST /auth/register with a duplicate email → 409', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(409);
  });

  it('GET /auth/me without a token → 401', () => {
    return request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('POST /auth/login with valid credentials → 200 + token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    token = (res.body as { data: { accessToken: string } }).data.accessToken;
    expect(token).toBeDefined();
  });

  it('POST /auth/login with wrong password → 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPass1' })
      .expect(401);
  });

  it('GET /auth/me with a valid token → 200 returns the user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect((res.body as { data: { email: string } }).data.email).toBe(email);
  });

  it('GET /auth/me with a garbage token → 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('GET /health stays public → 200', () => {
    return request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
});
