import type { Consumer, EachMessagePayload, Producer } from 'kafkajs';

import type { ProcessActivityLog } from '../../application/process-activity-log.js';
import { activityRecordedEventSchema } from '../../domain/activity-log-event.js';
import type { Logger } from '../../../../shared/logging/logger.js';
import { sleep } from '../../../../shared/time/sleep.js';

interface DeadLetterMessage {
  failedAt: string;
  error: string;
  source: {
    topic: string;
    partition: number;
    offset: string;
  };
  originalValue: string | null;
}

export class KafkaActivityLogConsumer {
  private consumerConnected = false;
  private producerConnected = false;
  private running = false;

  public constructor(
    private readonly consumer: Consumer,
    private readonly dlqProducer: Producer,
    private readonly topic: string,
    private readonly dlqTopic: string,
    private readonly processor: ProcessActivityLog,
    private readonly logger: Logger,
  ) {}

  public async connectAndRun(): Promise<void> {
    await this.consumer.connect();
    this.consumerConnected = true;
    await this.dlqProducer.connect();
    this.producerConnected = true;
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });
    await this.consumer.run({
      autoCommit: true,
      eachMessage: async (payload) => this.handleMessage(payload),
    });
    this.running = true;
  }

  public isReady(): boolean {
    return this.consumerConnected && this.producerConnected && this.running;
  }

  public async disconnect(): Promise<void> {
    if (this.consumerConnected) await this.consumer.disconnect();
    if (this.producerConnected) await this.dlqProducer.disconnect();
    this.consumerConnected = false;
    this.producerConnected = false;
    this.running = false;
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const originalValue = payload.message.value?.toString('utf8') ?? null;

    try {
      const decoded: unknown = originalValue === null ? null : JSON.parse(originalValue);
      const event = activityRecordedEventSchema.parse(decoded);
      const backoffs = [250, 1_000, 4_000];

      for (let attempt = 0; attempt < backoffs.length; attempt += 1) {
        try {
          const result = await this.processor.execute(event);
          this.logger.info(
            {
              eventId: event.eventId,
              correlationId: event.correlationId,
              created: result.created,
            },
            result.created ? 'Activity log processed' : 'Duplicate activity log ignored',
          );
          return;
        } catch (error: unknown) {
          if (attempt === backoffs.length - 1) throw error;
          const delay = backoffs[attempt];
          this.logger.warn(
            { error, eventId: event.eventId, attempt: attempt + 1, delay },
            'Activity processing failed; retrying',
          );
          await sleep(delay ?? 0);
        }
      }
    } catch (error: unknown) {
      await this.publishToDeadLetterQueue(payload, originalValue, error);
    }
  }

  private async publishToDeadLetterQueue(
    payload: EachMessagePayload,
    originalValue: string | null,
    error: unknown,
  ): Promise<void> {
    const deadLetterMessage: DeadLetterMessage = {
      failedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown processing error',
      source: {
        topic: payload.topic,
        partition: payload.partition,
        offset: payload.message.offset,
      },
      originalValue,
    };

    await this.dlqProducer.send({
      topic: this.dlqTopic,
      acks: -1,
      messages: [
        {
          key: payload.message.key,
          value: JSON.stringify(deadLetterMessage),
        },
      ],
    });

    this.logger.error(
      { error, topic: payload.topic, partition: payload.partition, offset: payload.message.offset },
      'Activity event sent to dead-letter queue',
    );
  }
}
