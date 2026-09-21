import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

import { Kafka, Partitioners } from 'kafkajs';

const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const topic = process.env.KAFKA_TOPIC ?? 'user.activity.v1';
const dlqTopic = process.env.KAFKA_DLQ_TOPIC ?? 'user.activity.dlq.v1';

async function waitForActivity(userId, expectedEventId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await globalThis.fetch(
      `${apiUrl}/api/v1/activity-logs?userId=${encodeURIComponent(userId)}&limit=100`,
    );
    if (response.ok) {
      const body = await response.json();
      const matches = body.data.filter((item) => item.eventId === expectedEventId);
      if (matches.length === 1) return matches[0];
    }
    await delay(1_000);
  }
  throw new Error(`Timed out waiting for event ${expectedEventId}`);
}

const submittedUserId = `e2e-${randomUUID()}`;
const submission = await globalThis.fetch(`${apiUrl}/api/v1/activity-logs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: submittedUserId, action: 'DEMO', source: 'e2e' }),
});
if (submission.status !== 202) throw new Error(`Submission failed with ${submission.status}`);
const accepted = await submission.json();
await waitForActivity(submittedUserId, accepted.data.eventId);

const duplicateEventId = randomUUID();
const duplicateUserId = `duplicate-${randomUUID()}`;
const now = new Date().toISOString();
const duplicateEvent = {
  schemaVersion: 1,
  eventType: 'user.activity.recorded',
  eventId: duplicateEventId,
  correlationId: randomUUID(),
  receivedAt: now,
  payload: {
    userId: duplicateUserId,
    action: 'DUPLICATE_TEST',
    source: 'e2e',
    occurredAt: now,
  },
};
const kafka = new Kafka({ clientId: 'activity-log-e2e', brokers });
const producer = kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner });
await producer.connect();
await producer.send({
  topic,
  messages: [
    { key: duplicateUserId, value: JSON.stringify(duplicateEvent) },
    { key: duplicateUserId, value: JSON.stringify(duplicateEvent) },
  ],
});
await waitForActivity(duplicateUserId, duplicateEventId);

const duplicateResponse = await globalThis.fetch(
  `${apiUrl}/api/v1/activity-logs?userId=${encodeURIComponent(duplicateUserId)}&limit=100`,
);
const duplicateBody = await duplicateResponse.json();
const duplicates = duplicateBody.data.filter((item) => item.eventId === duplicateEventId);
if (duplicates.length !== 1)
  throw new Error(`Expected one stored duplicate event, found ${duplicates.length}`);

const invalidMarker = `invalid-${randomUUID()}`;
const dlqConsumer = kafka.consumer({ groupId: `activity-log-e2e-${randomUUID()}` });
await dlqConsumer.connect();
await dlqConsumer.subscribe({ topic: dlqTopic, fromBeginning: false });

let resolveDeadLetter;
const deadLetterReceived = new Promise((resolve) => {
  resolveDeadLetter = resolve;
});
await dlqConsumer.run({
  eachMessage: ({ message }) => {
    const value = message.value?.toString('utf8') ?? '';
    if (value.includes(invalidMarker)) resolveDeadLetter();
  },
});
await delay(500);
await producer.send({
  topic,
  messages: [{ key: invalidMarker, value: JSON.stringify({ invalidMarker }) }],
});

await Promise.race([
  deadLetterReceived,
  delay(15_000).then(() => {
    throw new Error('Timed out waiting for the invalid event in the dead-letter queue');
  }),
]);

await dlqConsumer.disconnect();
await producer.disconnect();

process.stdout.write('End-to-end flow, idempotency, and dead-letter checks passed.\n');
