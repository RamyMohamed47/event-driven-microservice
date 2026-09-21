import { describe, expect, it, vi } from 'vitest';

import { ListActivityLogs } from '../src/modules/activity-logs/application/list-activity-logs.js';
import { ProcessActivityLog } from '../src/modules/activity-logs/application/process-activity-log.js';
import type { ActivityRecordedEvent } from '../src/modules/activity-logs/domain/activity-log.js';
import type { ActivityLogRepository } from '../src/modules/activity-logs/domain/activity-log-repository.js';

const event: ActivityRecordedEvent = {
  schemaVersion: 1,
  eventType: 'user.activity.recorded',
  eventId: 'ca978112-ca1b-4dca-bac2-31b39a23dc4d',
  correlationId: 'request-123',
  receivedAt: '2026-09-21T18:30:01.000Z',
  payload: {
    userId: 'user-123',
    action: 'LOGIN',
    source: 'web',
    occurredAt: '2026-09-21T18:30:00.000Z',
  },
};

describe('activity application use cases', () => {
  it('delegates idempotent processing to the repository', async () => {
    const saveIdempotently = vi
      .fn<ActivityLogRepository['saveIdempotently']>()
      .mockResolvedValueOnce({ created: true })
      .mockResolvedValueOnce({ created: false });
    const repository = createRepository({ saveIdempotently });
    const processActivityLog = new ProcessActivityLog(repository);

    await expect(processActivityLog.execute(event)).resolves.toEqual({ created: true });
    await expect(processActivityLog.execute(event)).resolves.toEqual({ created: false });
    expect(saveIdempotently).toHaveBeenCalledTimes(2);
  });

  it('returns an encoded next cursor when another page exists', async () => {
    const list = vi.fn<ActivityLogRepository['list']>().mockResolvedValue({
      items: [],
      nextCursor: {
        occurredAt: new Date('2026-09-21T18:30:00.000Z'),
        id: '507f1f77bcf86cd799439011',
      },
    });
    const useCase = new ListActivityLogs(createRepository({ list }));

    const result = await useCase.execute({ userId: 'user-123', limit: 20 });

    expect(result.pageInfo.hasNext).toBe(true);
    expect(result.pageInfo.nextCursor).toEqual(expect.any(String));
    expect(list).toHaveBeenCalledWith({ filters: { userId: 'user-123' }, limit: 20 });
  });
});

function createRepository(overrides: Partial<ActivityLogRepository> = {}): ActivityLogRepository {
  return {
    saveIdempotently: vi.fn().mockResolvedValue({ created: true }),
    list: vi.fn().mockResolvedValue({ items: [] }),
    isReady: () => true,
    ...overrides,
  };
}
