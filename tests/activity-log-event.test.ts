import { describe, expect, it, vi } from 'vitest';

import { SubmitActivityLog } from '../src/modules/activity-logs/application/submit-activity-log.js';
import type { ActivityEventPublisher } from '../src/modules/activity-logs/domain/activity-event-publisher.js';
import { createActivityRecordedEvent } from '../src/modules/activity-logs/domain/activity-log-event.js';

describe('activity event creation', () => {
  it('creates a versioned event and defaults occurredAt to the current time', () => {
    const now = new Date('2026-09-21T18:30:00.000Z');
    const event = createActivityRecordedEvent(
      { userId: 'user-123', action: 'LOGIN', source: 'web' },
      'request-123',
      now,
    );

    expect(event).toMatchObject({
      schemaVersion: 1,
      eventType: 'user.activity.recorded',
      correlationId: 'request-123',
      receivedAt: now.toISOString(),
      payload: {
        userId: 'user-123',
        action: 'LOGIN',
        source: 'web',
        occurredAt: now.toISOString(),
      },
    });
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('publishes before reporting an accepted submission', async () => {
    const publish = vi.fn<ActivityEventPublisher['publish']>().mockResolvedValue(undefined);
    const publisher: ActivityEventPublisher = { publish, isReady: () => true };
    const useCase = new SubmitActivityLog(publisher);

    const result = await useCase.execute(
      { userId: 'user-123', action: 'LOGIN', source: 'web' },
      'request-123',
    );

    expect(publish).toHaveBeenCalledOnce();
    expect(result).toEqual({
      eventId: expect.any(String),
      correlationId: 'request-123',
      status: 'accepted',
    });
  });
});
