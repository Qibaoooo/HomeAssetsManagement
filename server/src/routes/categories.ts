import type { FastifyInstance } from 'fastify';
import { backupSoon } from '../backup.js';
import { categoryCounts, renameCategory } from '../db.js';
import { syncNow } from '../sync.js';

const MAX = 200;

export async function categoryRoutes(app: FastifyInstance) {
  app.get('/api/categories', async () => categoryCounts());

  /** Rename a category on every item that has it. Renaming onto an existing category merges them. */
  app.post<{ Body: { from?: string; to?: string; updated_by?: string } }>('/api/categories/rename', async (req, reply) => {
    const from = String(req.body?.from ?? '').trim();
    const to = String(req.body?.to ?? '').trim();
    if (!from || !to) return reply.code(400).send({ error: 'both the current and the new name are required' });
    if (to.length > MAX) return reply.code(400).send({ error: `name is too long (max ${MAX} characters)` });
    if (from === to) return reply.code(400).send({ error: 'the new name is the same as the current one' });

    const by = String(req.body?.updated_by ?? '').trim() || 'unknown';
    const changed = renameCategory(from, to, by);
    if (!changed) return reply.code(404).send({ error: `no items in category "${from}"` });
    req.log.info({ from, to, by, changed }, 'category renamed');

    backupSoon();
    let synced = false;
    try {
      synced = (await syncNow('rename-category')).ok;
    } catch (e) {
      req.log.warn({ err: e }, 'sheet push after rename failed; rows kept as pending');
    }
    return { changed, synced };
  });
}
