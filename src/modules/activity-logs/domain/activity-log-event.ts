import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import type { ActivityRecordedEvent } from './activity-log.js';

const nonEmptyIdentifier = z.string().trim().min(1).max(128);

export const activityResourceSchema = z
  .object({
    type: nonEmptyIdentifier,
    id: nonEmptyIdentifier,
  })
  .strict();

export const activityPayloadSchema = z
  .object({
    userId: nonEmptyIdentifier,
    action: nonEmptyIdentifier,
    source: nonEmptyIdentifier,
    occurredAt: z.iso.datetime({ offset: true }),
    resource: activityResourceSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const createActivityInputSchema = activityPayloadSchema
  .omit({ occurredAt: true })
  .extend({ occurredAt: z.iso.datetime({ offset: true }).optional() });

export const activityRecordedEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventType: z.literal('user.activity.recorded'),
    eventId: z.uuid(),
    correlationId: z.string().trim().min(1).max(128),
    receivedAt: z.iso.datetime({ offset: true }),
    payload: activityPayloadSchema,
  })
  .strict();

export type CreateActivityInput = z.infer<typeof createActivityInputSchema>;

export function createActivityRecordedEvent(
  input: CreateActivityInput,
  correlationId: string,
  now = new Date(),
): ActivityRecordedEvent {
  const event = {
    schemaVersion: 1 as const,
    eventType: 'user.activity.recorded' as const,
    eventId: randomUUID(),
    correlationId,
    receivedAt: now.toISOString(),
    payload: {
      ...input,
      occurredAt: input.occurredAt ?? now.toISOString(),
    },
  };

  return activityRecordedEventSchema.parse(event);
}
