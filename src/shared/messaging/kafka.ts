import { Kafka, logLevel, type KafkaConfig, type SASLOptions } from 'kafkajs';

import type { Environment } from '../../config/environment.js';

export function createKafka(
  environment: Pick<
    Environment,
    | 'KAFKA_BROKERS'
    | 'KAFKA_CLIENT_ID'
    | 'KAFKA_SSL'
    | 'KAFKA_SASL_MECHANISM'
    | 'KAFKA_SASL_USERNAME'
    | 'KAFKA_SASL_PASSWORD'
  >,
  runtime: 'api' | 'worker',
): Kafka {
  const configuration: KafkaConfig = {
    clientId: `${environment.KAFKA_CLIENT_ID}-${runtime}`,
    brokers: environment.KAFKA_BROKERS,
    ssl: environment.KAFKA_SSL,
    logLevel: logLevel.ERROR,
  };

  if (
    environment.KAFKA_SASL_MECHANISM !== undefined &&
    environment.KAFKA_SASL_USERNAME !== undefined &&
    environment.KAFKA_SASL_PASSWORD !== undefined
  ) {
    configuration.sasl = createSaslOptions(
      environment.KAFKA_SASL_MECHANISM,
      environment.KAFKA_SASL_USERNAME,
      environment.KAFKA_SASL_PASSWORD,
    );
  }

  return new Kafka(configuration);
}

function createSaslOptions(
  mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512',
  username: string,
  password: string,
): SASLOptions {
  switch (mechanism) {
    case 'plain':
      return { mechanism: 'plain', username, password };
    case 'scram-sha-256':
      return { mechanism: 'scram-sha-256', username, password };
    case 'scram-sha-512':
      return { mechanism: 'scram-sha-512', username, password };
  }
}
