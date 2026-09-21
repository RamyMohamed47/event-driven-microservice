import 'dotenv/config';

import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65_535).default(3000),
    WORKER_PORT: z.coerce.number().int().positive().max(65_535).default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    MONGODB_URI: z.string().min(1),
    KAFKA_BROKERS: z
      .string()
      .min(1)
      .transform((value) =>
        value
          .split(',')
          .map((broker) => broker.trim())
          .filter(Boolean),
      ),
    KAFKA_CLIENT_ID: z.string().min(1).default('activity-log-service'),
    KAFKA_TOPIC: z.string().min(1).default('user.activity.v1'),
    KAFKA_DLQ_TOPIC: z.string().min(1).default('user.activity.dlq.v1'),
    KAFKA_CONSUMER_GROUP: z.string().min(1).default('activity-log-processors-v1'),
    KAFKA_SSL: booleanFromString,
    KAFKA_SASL_MECHANISM: z.enum(['plain', 'scram-sha-256', 'scram-sha-512']).optional(),
    KAFKA_SASL_USERNAME: z.string().min(1).optional(),
    KAFKA_SASL_PASSWORD: z.string().min(1).optional(),
  })
  .superRefine((environment, context) => {
    const saslValues = [
      environment.KAFKA_SASL_MECHANISM,
      environment.KAFKA_SASL_USERNAME,
      environment.KAFKA_SASL_PASSWORD,
    ];
    const suppliedValues = saslValues.filter((value) => value !== undefined);

    if (suppliedValues.length > 0 && suppliedValues.length < saslValues.length) {
      context.addIssue({
        code: 'custom',
        message: 'Kafka SASL mechanism, username, and password must be provided together',
        path: ['KAFKA_SASL_MECHANISM'],
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

let cachedEnvironment: Environment | undefined;

export function getEnvironment(): Environment {
  cachedEnvironment ??= environmentSchema.parse(process.env);
  return cachedEnvironment;
}
