import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import type { ListActivityLogs } from '../../application/list-activity-logs.js';
import type { SubmitActivityLog } from '../../application/submit-activity-log.js';
import { createActivityInputSchema } from '../../domain/activity-log-event.js';

const listActivityLogsQuerySchema = z
  .object({
    userId: z.string().trim().min(1).max(128).optional(),
    action: z.string().trim().min(1).max(128).optional(),
    source: z.string().trim().min(1).max(128).optional(),
    from: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    to: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  })
  .strict()
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    message: '`from` must be before or equal to `to`',
    path: ['from'],
  });

export function createActivityLogRouter(
  submitActivityLog: SubmitActivityLog,
  listActivityLogs: ListActivityLogs,
): Router {
  const router = Router();

  const submitHandler: RequestHandler = async (request, response) => {
    const input = createActivityInputSchema.parse(request.body);
    const result = await submitActivityLog.execute(input, request.requestId);
    response.status(202).json({ data: result });
  };

  const listHandler: RequestHandler = async (request, response) => {
    const query = listActivityLogsQuerySchema.parse(request.query);
    const result = await listActivityLogs.execute(query);
    response.status(200).json({ data: result.items, pageInfo: result.pageInfo });
  };

  router.post('/', submitHandler);
  router.get('/', listHandler);

  return router;
}
