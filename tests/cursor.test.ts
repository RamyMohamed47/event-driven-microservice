import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from '../src/modules/activity-logs/application/cursor.js';

describe('activity log cursor', () => {
  it('round-trips an opaque cursor', () => {
    const cursor = {
      occurredAt: new Date('2026-09-21T18:30:00.000Z'),
      id: '507f1f77bcf86cd799439011',
    };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('rejects a malformed cursor', () => {
    expect(() => decodeCursor('not-a-valid-cursor')).toThrow('pagination cursor is invalid');
  });
});
