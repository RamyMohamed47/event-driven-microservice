import type { Kafka } from 'kafkajs';

export async function ensureTopics(kafka: Kafka, topics: string[]): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const existingTopics = new Set(await admin.listTopics());
    const missingTopics = topics.filter((topic) => !existingTopics.has(topic));
    if (missingTopics.length === 0) return;

    await admin.createTopics({
      waitForLeaders: true,
      topics: missingTopics.map((topic) => ({
        topic,
        numPartitions: 3,
      })),
    });
  } finally {
    await admin.disconnect();
  }
}
