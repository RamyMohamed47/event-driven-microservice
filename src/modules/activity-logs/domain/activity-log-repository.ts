import type {
  ActivityLogPage,
  ActivityLogPageRequest,
  ActivityRecordedEvent,
} from './activity-log.js';

export interface SaveActivityLogResult {
  created: boolean;
}

export interface ActivityLogRepository {
  saveIdempotently(event: ActivityRecordedEvent): Promise<SaveActivityLogResult>;
  list(request: ActivityLogPageRequest): Promise<ActivityLogPage>;
  isReady(): boolean;
}
