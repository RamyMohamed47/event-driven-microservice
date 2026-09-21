import type { ActivityRecordedEvent } from '../domain/activity-log.js';
import type {
  ActivityLogRepository,
  SaveActivityLogResult,
} from '../domain/activity-log-repository.js';

export class ProcessActivityLog {
  public constructor(private readonly repository: ActivityLogRepository) {}

  public execute(event: ActivityRecordedEvent): Promise<SaveActivityLogResult> {
    return this.repository.saveIdempotently(event);
  }
}
