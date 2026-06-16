import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Full CRUD journey against the real app + database.
 * Requires the docker infra to be running (`npm run docker:up`) and the seed
 * to have run (`npm run db:seed`) so the admin user has user:* permissions.
 *
 * /users is protected by JWT (Phase 3) AND RBAC permissions (Phase 5), so we
 * log in as the seeded admin. A permission-less registered user is also used
 * to assert 403.
 */
describe('Users (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let noPermToken: string;
  let createdId: string;

  const stamp = Date.now();
  const email = `e2e-user-${stamp}@example.com`;

  const adminAuth = () => `Bearer ${adminToken}`;

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

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin123!ChangeMe' })
      .expect(200);
    adminToken = (login.body as { accessToken: string }).accessToken;

    // A freshly-registered user has no roles → no permissions.
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `e2e-noperm-${stamp}@example.com`,
        password: 'Str0ng!Passw0rd',
      })
      .expect(201);
    noPermToken = (reg.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /users without a token → 401', () => {
    return request(app.getHttpServer()).get('/api/v1/users').expect(401);
  });

  it('GET /users with a permission-less token → 403', () => {
    return request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${noPermToken}`)
      .expect(403);
  });

  it('POST /users (admin) → 201 creates a user without exposing the hash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth())
      .send({
        email,
        password: 'Str0ng!Passw0rd',
        firstName: 'E2E',
        lastName: 'Tester',
      })
      .expect(201);

    const body = res.body as Record<string, unknown>;
    expect(body.email).toBe(email);
    expect(body.passwordHash).toBeUndefined();
    expect(body.id).toBeDefined();
    createdId = body.id as string;
  });

  it('POST /users with the same email → 409', () => {
    return request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth())
      .send({ email, password: 'Str0ng!Passw0rd' })
      .expect(409);
  });

  it('POST /users with a weak password → 400', () => {
    return request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', adminAuth())
      .send({ email: `weak-${stamp}@example.com`, password: 'short' })
      .expect(400);
  });

  it('GET /users → 200 paginated list containing the new user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', adminAuth())
      .query({ search: email, limit: 5 })
      .expect(200);

    const body = res.body as {
      data: Array<{ id: string }>;
      meta: { totalItems: number; page: number };
    };
    expect(body.meta.page).toBe(1);
    expect(body.data.some((u) => u.id === createdId)).toBe(true);
  });

  it('GET /users?sort=passwordHash → 400 (whitelist enforced)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', adminAuth())
      .query({ sort: 'passwordHash' })
      .expect(400);
  });

  it('GET /users/:id → 200 returns the user', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/users/${createdId}`)
      .set('Authorization', adminAuth())
      .expect(200);

    expect((res.body as { email: string }).email).toBe(email);
  });

  it('GET /users/:id with a non-uuid → 400', () => {
    return request(app.getHttpServer())
      .get('/api/v1/users/not-a-uuid')
      .set('Authorization', adminAuth())
      .expect(400);
  });

  it('PATCH /users/:id → 200 updates profile fields', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${createdId}`)
      .set('Authorization', adminAuth())
      .send({ firstName: 'Updated' })
      .expect(200);

    expect((res.body as { firstName: string }).firstName).toBe('Updated');
  });

  it('DELETE /users/:id → 204 soft-deletes', () => {
    return request(app.getHttpServer())
      .delete(`/api/v1/users/${createdId}`)
      .set('Authorization', adminAuth())
      .expect(204);
  });

  it('GET /users/:id after delete → 404 (soft-deleted rows are invisible)', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/users/${createdId}`)
      .set('Authorization', adminAuth())
      .expect(404);
  });
});
