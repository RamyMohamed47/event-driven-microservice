import type { ActivityEventPublisher } from '../domain/activity-event-publisher.js';
import {
  createActivityRecordedEvent,
  type CreateActivityInput,
} from '../domain/activity-log-event.js';

export interface SubmitActivityResult {
  eventId: string;
  correlationId: string;
  status: 'accepted';
}

export class SubmitActivityLog {
  public constructor(private readonly publisher: ActivityEventPublisher) {}

  public async execute(
    input: CreateActivityInput,
    correlationId: string,
  ): Promise<SubmitActivityResult> {
    const event = createActivityRecordedEvent(input, correlationId);
    await this.publisher.publish(event);

    return {
      eventId: event.eventId,
      correlationId: event.correlationId,
      status: 'accepted',
    };
  }
}
