import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CorosErrorFilter } from './coros-error.filter';
import { HttpAppModule } from './http-app.module';

describe('COROS HTTP API', () => {
  let application: INestApplication;
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coros-http-'));
    process.env.COROS_SERVICE_TOKEN = 'integration-service-token';
    process.env.COROS_SESSION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.COROS_SESSION_STORAGE_PATH = join(directory, 'sessions.enc');
    process.env.COROS_REMOTE_BROWSER_AUTH_ENABLED = 'false';

    const module = await Test.createTestingModule({ imports: [HttpAppModule] }).compile();
    application = module.createNestApplication();
    application.useGlobalFilters(new CorosErrorFilter());
    await application.init();
  });

  afterEach(async () => {
    await application.close();
    await rm(directory, { recursive: true, force: true });
    delete process.env.COROS_SERVICE_TOKEN;
    delete process.env.COROS_SESSION_ENCRYPTION_KEY;
    delete process.env.COROS_SESSION_STORAGE_PATH;
    delete process.env.COROS_REMOTE_BROWSER_AUTH_ENABLED;
  });

  it('rejects an invalid service token with a stable error', async () => {
    const response = await request(application.getHttpServer())
      .get('/api/v1/coros/accounts/example/status')
      .expect(401);

    expect(response.body).toEqual({
      code: 'COROS_AUTH_REQUIRED',
      message: 'Требуется service-to-service авторизация.',
      retryable: false,
      requires_user_interaction: false,
    });
  });

  it('returns safe disconnected status for an authorized caller', async () => {
    const response = await request(application.getHttpServer())
      .get('/api/v1/coros/accounts/example/status')
      .set('Authorization', 'Bearer integration-service-token')
      .expect(200);

    expect(response.body).toEqual({ status: 'disconnected' });
  });

  it('does not pretend that remote interactive auth exists', async () => {
    const response = await request(application.getHttpServer())
      .post('/api/v1/coros/accounts/example/auth-sessions')
      .set('Authorization', 'Bearer integration-service-token')
      .expect(501);

    expect(response.body.code).toBe('COROS_WRITE_CAPABILITY_UNAVAILABLE');
    expect(response.body.requires_user_interaction).toBe(true);
    expect(response.body).not.toHaveProperty('accessToken');
  });
});
