import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { backupSoon } from '../backup.js';
import { addPath, deletePath, locationUsage, LocationError, renamePath, reorderPath } from '../locations.js';
import { syncNow } from '../sync.js';

/** Persist, then push items and the location tab. The response never waits on a failed sheet. */
async function push(req: FastifyRequest, reason: string): Promise<boolean> {
  backupSoon();
  try {
    return (await syncNow(reason)).ok;
  } catch (e) {
    req.log.warn({ err: e, reason }, 'sheet push after a location change failed; kept as pending');
    return false;
  }
}
const fail = (reply: FastifyReply, e: unknown) => {
  if (e instanceof LocationError) return reply.code(e.status).send({ error: e.message });
  throw e;
};
const who = (b: { updated_by?: unknown } | undefined) => String(b?.updated_by ?? '').trim() || 'unknown';

export async function locationRoutes(app: FastifyInstance) {
  app.get('/api/locations', async () => locationUsage());

  app.post<{ Body: { path?: string } }>('/api/locations', async (req, reply) => {
    try {
      const path = addPath(String(req.body?.path ?? ''));
      req.log.info({ path }, 'location added');
      return { path, synced: await push(req, 'location-add') };
    } catch (e) {
      return fail(reply, e);
    }
  });

  /** Rename or move a node (its items and sub-locations follow), or map an unlisted value onto a node. */
  app.post<{ Body: { from?: string; to?: string; updated_by?: string } }>('/api/locations/rename', async (req, reply) => {
    try {
      const from = String(req.body?.from ?? '');
      const to = String(req.body?.to ?? '');
      const changed = renamePath(from, to, who(req.body));
      req.log.info({ from, to, changed }, 'location renamed/moved');
      return { changed, synced: await push(req, 'location-rename') };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.post<{ Body: { path?: string; reassign_to?: string | null; updated_by?: string } }>(
    '/api/locations/delete',
    async (req, reply) => {
      try {
        const path = String(req.body?.path ?? '');
        const target = req.body?.reassign_to;
        const changed = deletePath(path, target === undefined ? null : target, who(req.body));
        req.log.info({ path, reassignTo: target ?? null, changed }, 'location deleted');
        return { changed, synced: await push(req, 'location-delete') };
      } catch (e) {
        return fail(reply, e);
      }
    },
  );

  app.post<{ Body: { path?: string; direction?: string } }>('/api/locations/reorder', async (req, reply) => {
    const direction = req.body?.direction;
    if (direction !== 'up' && direction !== 'down') return reply.code(400).send({ error: 'direction must be up or down' });
    try {
      reorderPath(String(req.body?.path ?? ''), direction);
      return { synced: await push(req, 'location-reorder') };
    } catch (e) {
      return fail(reply, e);
    }
  });
}
