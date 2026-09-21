import { Partitioners } from 'kafkajs';

import { createApp } from './app.js';
import { getEnvironment } from './config/environment.js';
import { ListActivityLogs } from './modules/activity-logs/application/list-activity-logs.js';
import { SubmitActivityLog } from './modules/activity-logs/application/submit-activity-log.js';
import { KafkaActivityEventPublisher } from './modules/activity-logs/infrastructure/messaging/kafka-activity-event-publisher.js';
import { MongooseActivityLogRepository } from './modules/activity-logs/infrastructure/persistence/mongoose-activity-log-repository.js';
import { closeServer } from './shared/http/server.js';
import { createLogger } from './shared/logging/logger.js';
import { createKafka } from './shared/messaging/kafka.js';
import { ensureTopics } from './shared/messaging/topics.js';
import { MongoConnection } from './shared/persistence/mongo.js';

async function startApi(): Promise<void> {
  const environment = getEnvironment();
  const logger = createLogger(environment);
  const mongo = new MongoConnection(environment.MONGODB_URI, logger);
  const repository = new MongooseActivityLogRepository();
  const kafka = createKafka(environment, 'api');
  const publisher = new KafkaActivityEventPublisher(
    kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner }),
    environment.KAFKA_TOPIC,
  );

  try {
    await mongo.connect();
    await repository.ensureIndexes();
    await ensureTopics(kafka, [environment.KAFKA_TOPIC, environment.KAFKA_DLQ_TOPIC]);
    await publisher.connect();
  } catch (error: unknown) {
    await Promise.allSettled([publisher.disconnect(), mongo.disconnect()]);
    throw error;
  }

  const app = createApp({
    logger,
    submitActivityLog: new SubmitActivityLog(publisher),
    listActivityLogs: new ListActivityLogs(repository),
    readinessCheck: () => ({ mongo: repository.isReady(), kafka: publisher.isReady() }),
  });
  const server = app.listen(environment.PORT, () => {
    logger.info({ port: environment.PORT }, 'API listening');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down API');
    await closeServer(server);
    await publisher.disconnect();
    await mongo.disconnect();
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

startApi().catch((error: unknown) => {
  process.stderr.write(`API failed to start: ${formatStartupError(error)}\n`);
  process.exitCode = 1;
});

function formatStartupError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
