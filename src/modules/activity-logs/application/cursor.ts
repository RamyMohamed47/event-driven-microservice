import { z } from 'zod';

import type { ActivityLogCursor } from '../domain/activity-log.js';
import { AppError } from '../../../shared/errors/app-error.js';

const serializedCursorSchema = z.object({
  occurredAt: z.iso.datetime({ offset: true }),
  id: z.string().regex(/^[a-f\d]{24}$/i),
});

export function encodeCursor(cursor: ActivityLogCursor): string {
  return Buffer.from(
    JSON.stringify({ occurredAt: cursor.occurredAt.toISOString(), id: cursor.id }),
  ).toString('base64url');
}

export function decodeCursor(cursor: string): ActivityLogCursor {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const parsed = serializedCursorSchema.parse(decoded);
    return { occurredAt: new Date(parsed.occurredAt), id: parsed.id };
  } catch {
    throw new AppError('INVALID_CURSOR', 'The pagination cursor is invalid', 400);
  }
}
