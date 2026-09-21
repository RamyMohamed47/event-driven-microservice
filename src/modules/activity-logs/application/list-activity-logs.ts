import type { ActivityLogRepository } from '../domain/activity-log-repository.js';
import type { StoredActivityLog } from '../domain/activity-log.js';
import { decodeCursor, encodeCursor } from './cursor.js';

export interface ListActivityLogsRequest {
  userId?: string | undefined;
  action?: string | undefined;
  source?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  limit: number;
  cursor?: string | undefined;
}

export interface ListActivityLogsResult {
  items: StoredActivityLog[];
  pageInfo: {
    hasNext: boolean;
    nextCursor: string | null;
  };
}

export class ListActivityLogs {
  public constructor(private readonly repository: ActivityLogRepository) {}

  public async execute(request: ListActivityLogsRequest): Promise<ListActivityLogsResult> {
    const page = await this.repository.list({
      filters: {
        ...(request.userId === undefined ? {} : { userId: request.userId }),
        ...(request.action === undefined ? {} : { action: request.action }),
        ...(request.source === undefined ? {} : { source: request.source }),
        ...(request.from === undefined ? {} : { from: request.from }),
        ...(request.to === undefined ? {} : { to: request.to }),
      },
      limit: request.limit,
      ...(request.cursor === undefined ? {} : { cursor: decodeCursor(request.cursor) }),
    });

    return {
      items: page.items,
      pageInfo: {
        hasNext: page.nextCursor !== undefined,
        nextCursor: page.nextCursor === undefined ? null : encodeCursor(page.nextCursor),
      },
    };
  }
}
