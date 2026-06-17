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
 * Registration triggers a welcome notification via the event bus (async,
 * fire-and-forget), so we poll for it.
 * Requires docker infra + seed.
 */
describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let notificationId: string;

  const stamp = Date.now();
  const email = `e2e-notif-${stamp}@example.com`;
  const password = 'Str0ng!Passw0rd';

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

    const reg = await request(http())
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Notif' })
      .expect(201);
    token = (reg.body as { data: { accessToken: string } }).data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /notifications without a token → 401', () => {
    return request(http()).get('/api/v1/notifications').expect(401);
  });

  it('registration produced a welcome notification (event-driven)', async () => {
    let welcome: { id: string; type: string; read: boolean } | undefined;
    for (let i = 0; i < 12 && !welcome; i++) {
      const res = await request(http())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = res.body as {
        data: Array<{ id: string; type: string; read: boolean }>;
      };
      welcome = body.data.find((n) => n.type === 'welcome');
      if (!welcome) await sleep(150);
    }
    expect(welcome).toBeDefined();
    expect(welcome?.read).toBe(false);
    notificationId = welcome!.id;
  });

  it('GET /notifications/unread-count → at least 1', async () => {
    const res = await request(http())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (res.body as { data: { count: number } }).data.count,
    ).toBeGreaterThanOrEqual(1);
  });

  it('PATCH /notifications/:id/read marks it read', async () => {
    const res = await request(http())
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((res.body as { data: { read: boolean } }).data.read).toBe(true);
  });

  it('another user cannot read someone else’s notification → 404', async () => {
    const other = await request(http())
      .post('/api/v1/auth/register')
      .send({ email: `e2e-notif-other-${stamp}@example.com`, password })
      .expect(201);
    const otherToken = (other.body as { data: { accessToken: string } }).data
      .accessToken;

    await request(http())
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  it('POST /notifications/read-all → 204', () => {
    return request(http())
      .post('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });
});
