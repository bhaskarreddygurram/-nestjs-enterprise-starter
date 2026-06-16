import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'http';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * RBAC enforcement + dynamic role assignment.
 * Requires docker infra + seed (admin has role:assign + user:*).
 */
describe('RBAC (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userId: string;
  let userToken: string;

  const stamp = Date.now();
  const email = `e2e-rbac-${stamp}@example.com`;
  const password = 'Str0ng!Passw0rd';

  const http = (): Server => app.getHttpServer() as Server;
  const login = async (e: string, p: string): Promise<string> => {
    const res = await request(http())
      .post('/api/v1/auth/login')
      .send({ email: e, password: p })
      .expect(200);
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  };

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

    adminToken = await login('admin@example.com', 'Admin123!ChangeMe');

    const reg = await request(http())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(201);
    const body = (
      reg.body as { data: { user: { id: string }; accessToken: string } }
    ).data;
    userId = body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin can list roles (role:read); fresh user cannot', async () => {
    await request(http())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    userToken = await login(email, password);
    await request(http())
      .get('/api/v1/roles')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('permission-less user is forbidden from reading users', async () => {
    await request(http())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('a non-admin cannot assign roles (role:assign)', () => {
    return request(http())
      .post(`/api/v1/users/${userId}/roles`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ role: 'admin' })
      .expect(403);
  });

  it('admin assigns the "user" role → user can now read users', async () => {
    await request(http())
      .post(`/api/v1/users/${userId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' })
      .expect(204);

    // Permissions are resolved per request, so a NEW login reflects the grant.
    const refreshed = await login(email, password);
    await request(http())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${refreshed}`)
      .expect(200);

    // ...but still cannot create (the "user" role only has user:read).
    await request(http())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${refreshed}`)
      .send({ email: `nope-${stamp}@example.com`, password })
      .expect(403);
  });

  it('admin removes the role → user loses access again', async () => {
    await request(http())
      .delete(`/api/v1/users/${userId}/roles/user`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    const refreshed = await login(email, password);
    await request(http())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${refreshed}`)
      .expect(403);
  });

  it('assigning a non-existent role → 404', () => {
    return request(http())
      .post(`/api/v1/users/${userId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'does-not-exist' })
      .expect(404);
  });
});
