import pino from 'pino';

import type { Environment } from '../../config/environment.js';

export function createLogger(environment: Pick<Environment, 'LOG_LEVEL' | 'NODE_ENV'>) {
  return pino({
    level: environment.LOG_LEVEL,
    base: {
      service: 'activity-log-service',
      environment: environment.NODE_ENV,
    },
    redact: {
      paths: ['req.headers.authorization', '*.password', '*.KAFKA_SASL_PASSWORD'],
      censor: '[REDACTED]',
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
