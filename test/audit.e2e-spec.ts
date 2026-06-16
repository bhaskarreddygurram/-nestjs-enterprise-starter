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
 * Audit logging is event-driven and the write is fire-and-forget, so we poll
 * briefly for the row rather than asserting synchronously.
 * Requires docker infra + seed (admin has audit:read).
 */
describe('Audit (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let noPermToken: string;

  const stamp = Date.now();
  const newUserEmail = `e2e-audit-target-${stamp}@example.com`;

  const http = (): Server => app.getHttpServer() as Server;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

    const login = await request(http())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin123!ChangeMe' })
      .expect(200);
    adminToken = (login.body as { data: { accessToken: string } }).data
      .accessToken;

    const reg = await request(http())
      .post('/api/v1/auth/register')
      .send({
        email: `e2e-audit-noperm-${stamp}@example.com`,
        password: 'Str0ng!Passw0rd',
      })
      .expect(201);
    noPermToken = (reg.body as { data: { accessToken: string } }).data
      .accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /audit-logs without audit:read → 403', () => {
    return request(http())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${noPermToken}`)
      .expect(403);
  });

  it('admin login produced an auth.login audit entry', async () => {
    let found = false;
    for (let i = 0; i < 10 && !found; i++) {
      const res = await request(http())
        .get('/api/v1/audit-logs')
        .query({ action: 'auth.login', limit: 5 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as { data: Array<{ action: string }> };
      found = body.data.length > 0 && body.data[0].action === 'auth.login';
      if (!found) await sleep(150);
    }
    expect(found).toBe(true);
  });

  it('a user creation is recorded with the admin as actor', async () => {
    const created = await request(http())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: newUserEmail, password: 'Str0ng!Passw0rd' })
      .expect(201);
    const userId = (created.body as { data: { id: string } }).data.id;

    let entry:
      | { actorId: string | null; resourceId: string | null }
      | undefined;
    for (let i = 0; i < 10 && !entry; i++) {
      const res = await request(http())
        .get('/api/v1/audit-logs')
        .query({ action: 'user.created', limit: 10 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        data: Array<{ actorId: string | null; resourceId: string | null }>;
      };
      entry = body.data.find((e) => e.resourceId === userId);
      if (!entry) await sleep(150);
    }

    expect(entry).toBeDefined();
    expect(entry?.actorId).toBeTruthy(); // the admin who created the user
  });

  it('returns a paginated envelope', async () => {
    const res = await request(http())
      .get('/api/v1/audit-logs?limit=2')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      data: unknown[];
      meta: { page: number; limit: number };
    };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.limit).toBe(2);
  });
});
