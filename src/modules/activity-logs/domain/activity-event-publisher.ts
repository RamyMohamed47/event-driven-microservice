import type { ActivityRecordedEvent } from './activity-log.js';

export interface ActivityEventPublisher {
  publish(event: ActivityRecordedEvent): Promise<void>;
  isReady(): boolean;
}
