import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { ListActivityLogs } from '../src/modules/activity-logs/application/list-activity-logs.js';
import { SubmitActivityLog } from '../src/modules/activity-logs/application/submit-activity-log.js';
import type { ActivityEventPublisher } from '../src/modules/activity-logs/domain/activity-event-publisher.js';
import type { ActivityLogRepository } from '../src/modules/activity-logs/domain/activity-log-repository.js';
import { createLogger } from '../src/shared/logging/logger.js';

function createTestApp() {
  const publish = vi.fn<ActivityEventPublisher['publish']>().mockResolvedValue(undefined);
  const publisher: ActivityEventPublisher = { publish, isReady: () => true };
  const repository: ActivityLogRepository = {
    saveIdempotently: vi.fn().mockResolvedValue({ created: true }),
    list: vi.fn().mockResolvedValue({ items: [] }),
    isReady: () => true,
  };

  return {
    app: createApp({
      logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'fatal' }),
      submitActivityLog: new SubmitActivityLog(publisher),
      listActivityLogs: new ListActivityLogs(repository),
      readinessCheck: () => ({ mongo: true, kafka: true }),
    }),
    publish,
    repository,
  };
}

describe('activity log HTTP API', () => {
  it('accepts a valid activity and propagates the request ID', async () => {
    const { app, publish } = createTestApp();
    const response = await request(app)
      .post('/api/v1/activity-logs')
      .set('x-request-id', 'request-123')
      .send({ userId: 'user-123', action: 'LOGIN', source: 'web' });

    expect(response.status).toBe(202);
    expect(response.headers['x-request-id']).toBe('request-123');
    expect(response.body.data).toMatchObject({
      correlationId: 'request-123',
      status: 'accepted',
    });
    expect(publish).toHaveBeenCalledOnce();
  });

  it('returns a standardized validation error', async () => {
    const { app } = createTestApp();
    const response = await request(app).post('/api/v1/activity-logs').send({ action: 'LOGIN' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'The request is invalid',
      requestId: expect.any(String),
    });
  });

  it('passes filters and bounded pagination to the repository', async () => {
    const { app, repository } = createTestApp();
    const response = await request(app).get(
      '/api/v1/activity-logs?userId=user-123&action=LOGIN&limit=10',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      pageInfo: { hasNext: false, nextCursor: null },
    });
    expect(repository.list).toHaveBeenCalledWith({
      filters: { userId: 'user-123', action: 'LOGIN' },
      limit: 10,
    });
  });

  it('reports dependency readiness', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ready',
      dependencies: { mongo: true, kafka: true },
    });
  });

  it('rejects an invalid cursor with the standard error shape', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/api/v1/activity-logs?cursor=invalid');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'INVALID_CURSOR',
      requestId: expect.any(String),
    });
  });

  it('returns 503 when a dependency is unavailable', async () => {
    const { publish, repository } = createTestApp();
    const unavailableApp = createApp({
      logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'fatal' }),
      submitActivityLog: new SubmitActivityLog({ publish, isReady: () => false }),
      listActivityLogs: new ListActivityLogs(repository),
      readinessCheck: () => ({ mongo: true, kafka: false }),
    });

    const response = await request(unavailableApp).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
  });
});
