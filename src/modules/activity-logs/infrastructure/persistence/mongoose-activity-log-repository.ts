import mongoose, { isValidObjectId, Types, type QueryFilter } from 'mongoose';

import type {
  ActivityLogPage,
  ActivityLogPageRequest,
  ActivityRecordedEvent,
  StoredActivityLog,
} from '../../domain/activity-log.js';
import type {
  ActivityLogRepository,
  SaveActivityLogResult,
} from '../../domain/activity-log-repository.js';
import { ActivityLogModel } from './activity-log-model.js';

interface ActivityLogQueryShape {
  _id: Types.ObjectId;
  eventId: string;
  eventType: 'user.activity.recorded';
  correlationId: string;
  userId: string;
  action: string;
  source: string;
  resource?: { type: string; id: string };
  metadata?: Record<string, unknown>;
  occurredAt: Date;
  receivedAt: Date;
  processedAt: Date;
}

export class MongooseActivityLogRepository implements ActivityLogRepository {
  public async ensureIndexes(): Promise<void> {
    await ActivityLogModel.init();
  }

  public async saveIdempotently(event: ActivityRecordedEvent): Promise<SaveActivityLogResult> {
    try {
      const result = await ActivityLogModel.updateOne(
        { eventId: event.eventId },
        {
          $setOnInsert: {
            eventId: event.eventId,
            eventType: event.eventType,
            correlationId: event.correlationId,
            userId: event.payload.userId,
            action: event.payload.action,
            source: event.payload.source,
            ...(event.payload.resource === undefined ? {} : { resource: event.payload.resource }),
            ...(event.payload.metadata === undefined ? {} : { metadata: event.payload.metadata }),
            occurredAt: new Date(event.payload.occurredAt),
            receivedAt: new Date(event.receivedAt),
            processedAt: new Date(),
          },
        },
        { upsert: true },
      );

      return { created: result.upsertedCount === 1 };
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        return { created: false };
      }
      throw error;
    }
  }

  public async list(request: ActivityLogPageRequest): Promise<ActivityLogPage> {
    const filter: QueryFilter<ActivityLogQueryShape> = {
      ...(request.filters.userId === undefined ? {} : { userId: request.filters.userId }),
      ...(request.filters.action === undefined ? {} : { action: request.filters.action }),
      ...(request.filters.source === undefined ? {} : { source: request.filters.source }),
    };

    if (request.filters.from !== undefined || request.filters.to !== undefined) {
      filter.occurredAt = {
        ...(request.filters.from === undefined ? {} : { $gte: request.filters.from }),
        ...(request.filters.to === undefined ? {} : { $lte: request.filters.to }),
      };
    }

    if (request.cursor !== undefined) {
      if (!isValidObjectId(request.cursor.id)) {
        return { items: [] };
      }
      filter.$or = [
        { occurredAt: { $lt: request.cursor.occurredAt } },
        {
          occurredAt: request.cursor.occurredAt,
          _id: { $lt: new Types.ObjectId(request.cursor.id) },
        },
      ];
    }

    const documents = await ActivityLogModel.find(filter)
      .sort({ occurredAt: -1, _id: -1 })
      .limit(request.limit + 1)
      .lean<ActivityLogQueryShape[]>();

    const hasNext = documents.length > request.limit;
    const pageDocuments = hasNext ? documents.slice(0, request.limit) : documents;
    const items = pageDocuments.map(toDomain);
    const lastItem = pageDocuments.at(-1);

    return {
      items,
      ...(hasNext && lastItem !== undefined
        ? { nextCursor: { occurredAt: lastItem.occurredAt, id: lastItem._id.toString() } }
        : {}),
    };
  }

  public isReady(): boolean {
    return ActivityLogModel.db.readyState === mongoose.ConnectionStates.connected;
  }
}

function toDomain(document: ActivityLogQueryShape): StoredActivityLog {
  return {
    id: document._id.toString(),
    eventId: document.eventId,
    eventType: document.eventType,
    correlationId: document.correlationId,
    userId: document.userId,
    action: document.action,
    source: document.source,
    ...(document.resource === undefined ? {} : { resource: document.resource }),
    ...(document.metadata === undefined ? {} : { metadata: document.metadata }),
    occurredAt: document.occurredAt.toISOString(),
    receivedAt: document.receivedAt.toISOString(),
    processedAt: document.processedAt.toISOString(),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;
}
