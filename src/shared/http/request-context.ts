import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const suppliedRequestId = request.header('x-request-id')?.trim();
  request.requestId =
    suppliedRequestId === '' || suppliedRequestId === undefined
      ? randomUUID()
      : suppliedRequestId.slice(0, 128);
  response.setHeader('x-request-id', request.requestId);
  next();
}
