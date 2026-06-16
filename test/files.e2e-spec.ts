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
 * File upload/download/list/delete lifecycle + validation + RBAC.
 * Requires docker infra + seed (admin has file:*).
 */
describe('Files (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let noPermToken: string;
  let fileId: string;

  const stamp = Date.now();
  const content = Buffer.from(`hello audit world ${stamp}`);

  const http = (): Server => app.getHttpServer() as Server;

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

    adminToken = (
      (
        await request(http())
          .post('/api/v1/auth/login')
          .send({ email: 'admin@example.com', password: 'Admin123!ChangeMe' })
          .expect(200)
      ).body as { data: { accessToken: string } }
    ).data.accessToken;

    noPermToken = (
      (
        await request(http())
          .post('/api/v1/auth/register')
          .send({
            email: `e2e-file-noperm-${stamp}@e.com`,
            password: 'Str0ng!Passw0rd',
          })
          .expect(201)
      ).body as { data: { accessToken: string } }
    ).data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /files without a token → 401', () => {
    return request(http())
      .post('/api/v1/files')
      .attach('file', content, { filename: 'a.txt', contentType: 'text/plain' })
      .expect(401);
  });

  it('POST /files without file:create → 403', () => {
    return request(http())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${noPermToken}`)
      .attach('file', content, { filename: 'a.txt', contentType: 'text/plain' })
      .expect(403);
  });

  it('POST /files with no file part → 400', () => {
    return request(http())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('POST /files with a disallowed mime type → 400', () => {
    return request(http())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('MZ'), {
        filename: 'evil.exe',
        contentType: 'application/x-msdownload',
      })
      .expect(400);
  });

  it('POST /files → 201 uploads and returns metadata (no storage key)', async () => {
    const res = await request(http())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', content, {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    const body = (res.body as { data: Record<string, unknown> }).data;
    expect(body.originalName).toBe('note.txt');
    expect(body.mimeType).toBe('text/plain');
    expect(body.size).toBe(content.length);
    expect(body.storageKey).toBeUndefined();
    expect(body.uploaderId).toBeTruthy();
    fileId = body.id as string;
  });

  it('GET /files → 200 list contains the upload', async () => {
    const res = await request(http())
      .get('/api/v1/files?limit=50')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { data: Array<{ id: string }> };
    expect(body.data.some((f) => f.id === fileId)).toBe(true);
  });

  it('GET /files/:id/download → 200 returns the original bytes', async () => {
    const res = await request(http())
      .get(`/api/v1/files/${fileId}/download`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => chunks.push(c));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.headers['content-disposition']).toContain('note.txt');
    expect((res.body as Buffer).toString()).toBe(content.toString());
  });

  it('DELETE /files/:id → 204', () => {
    return request(http())
      .delete(`/api/v1/files/${fileId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
  });

  it('GET /files/:id after delete → 404', () => {
    return request(http())
      .get(`/api/v1/files/${fileId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
