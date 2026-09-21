import type { Producer } from 'kafkajs';

import type { ActivityEventPublisher } from '../../domain/activity-event-publisher.js';
import type { ActivityRecordedEvent } from '../../domain/activity-log.js';

export class KafkaActivityEventPublisher implements ActivityEventPublisher {
  private connected = false;

  public constructor(
    private readonly producer: Producer,
    private readonly topic: string,
  ) {}

  public async connect(): Promise<void> {
    await this.producer.connect();
    this.connected = true;
  }

  public async publish(event: ActivityRecordedEvent): Promise<void> {
    await this.producer.send({
      topic: this.topic,
      acks: -1,
      messages: [
        {
          key: event.payload.userId,
          value: JSON.stringify(event),
          headers: {
            eventType: event.eventType,
            correlationId: event.correlationId,
          },
        },
      ],
    });
  }

  public isReady(): boolean {
    return this.connected;
  }

  public async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.producer.disconnect();
    this.connected = false;
  }
}
