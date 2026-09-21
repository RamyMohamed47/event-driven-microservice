import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../errors/app-error.js';
import type { Logger } from '../logging/logger.js';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new AppError('NOT_FOUND', `Route ${request.method} ${request.path} was not found`, 404));
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, _next): void => {
    if (error instanceof ZodError) {
      response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request is invalid',
          details: error.issues,
          requestId: request.requestId,
        },
      });
      return;
    }

    if (error instanceof AppError) {
      response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
          requestId: request.requestId,
        },
      });
      return;
    }

    logger.error({ error, requestId: request.requestId }, 'Unhandled request error');
    response.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        requestId: request.requestId,
      },
    });
  };
}
