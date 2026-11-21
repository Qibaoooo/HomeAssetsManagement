import type { FastifyInstance } from 'fastify';
import { logTail } from '../db.js';
import { lastSync, pendingCount, syncNow } from '../sync.js';

export async function syncRoutes(app: FastifyInstance) {
  app.get('/api/sync/status', async () => ({
    last: lastSync(),
    pending: pendingCount(),
    log: logTail(30),
  }));

  app.post('/api/sync', async () => {
    const result = await syncNow('manual');
    return { result, pending: pendingCount() };
  });
}
