import type { FastifyInstance } from 'fastify';
import { backupConfigured, backupNow, history, lastBackup } from '../backup.js';
import { config } from '../config.js';

export async function backupRoutes(app: FastifyInstance) {
  app.get('/api/backup/status', async () => ({
    state: backupConfigured(), // ready | off | no-client | no-token
    folder: config.backupFolder,
    intervalHours: config.backupIntervalMs / 3_600_000,
    last: lastBackup(), // most recent run, including "nothing changed" checks
    history: history(20), // runs that uploaded something or failed, newest first
  }));

  app.post('/api/backup', async (_req, reply) => {
    const state = backupConfigured();
    if (state !== 'ready') return reply.code(409).send({ error: `backup not configured (${state})` });
    return { result: await backupNow('manual') };
  });
}
