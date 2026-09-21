import express, { type Express, type Request, type Response } from 'express';
import { pinoHttp } from 'pino-http';

import type { ListActivityLogs } from './modules/activity-logs/application/list-activity-logs.js';
import type { SubmitActivityLog } from './modules/activity-logs/application/submit-activity-log.js';
import { createActivityLogRouter } from './modules/activity-logs/infrastructure/http/activity-log-router.js';
import { createErrorHandler, notFoundHandler } from './shared/http/error-handler.js';
import { createHealthRouter, type ReadinessCheck } from './shared/http/health-router.js';
import { requestContext } from './shared/http/request-context.js';
import type { Logger } from './shared/logging/logger.js';

interface CreateAppDependencies {
  logger: Logger;
  submitActivityLog: SubmitActivityLog;
  listActivityLogs: ListActivityLogs;
  readinessCheck: ReadinessCheck;
}

export function createApp(dependencies: CreateAppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(
    pinoHttp<Request, Response>({
      logger: dependencies.logger,
      customProps: (request) => ({ requestId: request.requestId }),
    }),
  );
  app.use(express.json({ limit: '64kb' }));

  app.use('/health', createHealthRouter(dependencies.readinessCheck));
  app.use(
    '/api/v1/activity-logs',
    createActivityLogRouter(dependencies.submitActivityLog, dependencies.listActivityLogs),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler(dependencies.logger));

  return app;
}

export function createWorkerHealthApp(logger: Logger, readinessCheck: ReadinessCheck): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(
    pinoHttp<Request, Response>({
      logger,
      customProps: (request) => ({ requestId: request.requestId }),
    }),
  );
  app.use('/health', createHealthRouter(readinessCheck));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
