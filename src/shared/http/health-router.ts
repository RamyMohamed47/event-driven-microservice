import { Router } from 'express';

export type DependencyReadiness = Record<string, boolean>;

export type ReadinessCheck = () => DependencyReadiness;

export function createHealthRouter(readinessCheck: ReadinessCheck): Router {
  const router = Router();

  router.get('/live', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  router.get('/ready', (_request, response) => {
    const dependencies = readinessCheck();
    const ready = Object.values(dependencies).every(Boolean);
    response.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      dependencies,
    });
  });

  return router;
}
