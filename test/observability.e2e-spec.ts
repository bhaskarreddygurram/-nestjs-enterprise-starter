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
 * Phase 11 — observability: the /metrics endpoint and request-id correlation.
 * Requires docker infra (AppModule wires Prisma/Redis).
 */
describe('Observability (e2e)', () => {
  let app: INestApplication;
  const http = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['metrics'] });
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

  describe('GET /metrics', () => {
    it('serves Prometheus text at the root (no /api prefix), un-enveloped', async () => {
      // hit a route first so an http_requests_total sample exists
      await request(http()).get('/api/v1/health').expect(200);

      const res = await request(http()).get('/metrics').expect(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('process_cpu_user_seconds_total');
      expect(res.text).toContain('http_request_duration_seconds');
      // raw exposition format — NOT wrapped in the success envelope
      expect(res.text).not.toContain('"success"');
    });
  });

  describe('request-id correlation', () => {
    it('echoes a client-supplied x-request-id and uses it in the envelope', async () => {
      const rid = 'test-rid-12345';
      const res = await request(http())
        .post('/api/v1/auth/login')
        .set('x-request-id', rid)
        .send({ email: 'nobody@example.com', password: 'whatever' })
        .expect(401);

      expect(res.headers['x-request-id']).toBe(rid);
      expect((res.body as { requestId: string }).requestId).toBe(rid);
    });

    it('generates an x-request-id when none is supplied', async () => {
      const res = await request(http()).get('/api/v1/health').expect(200);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
    });
  });
});
