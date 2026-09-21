import { Partitioners } from 'kafkajs';

import { createWorkerHealthApp } from './app.js';
import { getEnvironment } from './config/environment.js';
import { ProcessActivityLog } from './modules/activity-logs/application/process-activity-log.js';
import { KafkaActivityLogConsumer } from './modules/activity-logs/infrastructure/messaging/kafka-activity-log-consumer.js';
import { MongooseActivityLogRepository } from './modules/activity-logs/infrastructure/persistence/mongoose-activity-log-repository.js';
import { closeServer } from './shared/http/server.js';
import { createLogger } from './shared/logging/logger.js';
import { createKafka } from './shared/messaging/kafka.js';
import { MongoConnection } from './shared/persistence/mongo.js';

async function startWorker(): Promise<void> {
  const environment = getEnvironment();
  const logger = createLogger(environment);
  const mongo = new MongoConnection(environment.MONGODB_URI, logger);
  const repository = new MongooseActivityLogRepository();
  const kafka = createKafka(environment, 'worker');
  const consumer = new KafkaActivityLogConsumer(
    kafka.consumer({ groupId: environment.KAFKA_CONSUMER_GROUP }),
    kafka.producer({ createPartitioner: Partitioners.DefaultPartitioner }),
    environment.KAFKA_TOPIC,
    environment.KAFKA_DLQ_TOPIC,
    new ProcessActivityLog(repository),
    logger,
  );

  try {
    await mongo.connect();
    await repository.ensureIndexes();
    await consumer.connectAndRun();
  } catch (error: unknown) {
    await Promise.allSettled([consumer.disconnect(), mongo.disconnect()]);
    throw error;
  }

  const healthApp = createWorkerHealthApp(logger, () => ({
    mongo: repository.isReady(),
    kafka: consumer.isReady(),
  }));
  const healthServer = healthApp.listen(environment.WORKER_PORT, () => {
    logger.info({ port: environment.WORKER_PORT }, 'Worker health server listening');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down worker');
    await closeServer(healthServer);
    await consumer.disconnect();
    await mongo.disconnect();
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

startWorker().catch((error: unknown) => {
  process.stderr.write(`Worker failed to start: ${formatStartupError(error)}\n`);
  process.exitCode = 1;
});

function formatStartupError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
