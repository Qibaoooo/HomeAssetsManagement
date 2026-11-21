import type { FastifyInstance, FastifyRequest } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { backupSoon } from '../backup.js';
import { photosDir } from '../config.js';
import { buildItem, distinctValues, getItem, insertItem, listItems, setPhoto, updateItem } from '../db.js';
import { syncNow } from '../sync.js';
import type { Item, ItemInput, ItemStatus } from '../types.js';

const MAX_EDGE = 1600;
const THUMB_EDGE = 320;

/** Write-through: persist locally, then push to the sheet. The response never waits on a failed sheet. */
async function pushQuietly(req: FastifyRequest, reason: string): Promise<boolean> {
  backupSoon();
  try {
    const r = await syncNow(reason);
    if (!r.ok) req.log.warn({ reason, error: r.error }, 'sheet push failed; change kept locally as pending');
    return r.ok;
  } catch (e) {
    req.log.warn({ reason, err: e }, 'sheet push threw; change kept locally as pending');
    return false;
  }
}

const FIELDS: (keyof ItemInput)[] = [
  'category', 'type', 'design', 'brand', 'location', 'size', 'quantity', 'remarks', 'tag', 'purchase_date', 'price', 'status',
];
/** Which fields actually changed, for the log. */
function diff(before: Item | undefined, after: Item) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of FIELDS) {
    const a = before?.[k] ?? null;
    const b = after[k] ?? null;
    if (a !== b) out[k] = { from: a, to: b };
  }
  return out;
}

const describe = (i: Item) => [i.category, i.type, i.design].filter(Boolean).join(' / ');

// Photo URLs carry the upload version so a replaced photo is never served from the browser cache.
const photoUrls = (item: Item) => {
  if (!item.photo) return { photo_url: null, thumb_url: null };
  const v = item.photo_version ? `?v=${item.photo_version}` : '';
  return {
    photo_url: `/photos/${item.photo}${v}`,
    thumb_url: `/photos/${item.photo.replace(/\.webp$/, '.thumb.webp')}${v}`,
  };
};
const present = (item: Item) => ({ ...item, ...photoUrls(item) });

export async function itemRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { status?: ItemStatus | 'all' } }>('/api/items', async (req) => {
    const status = req.query.status ?? 'active';
    return listItems(status === 'all' || status === 'retired' ? status : 'active').map(present);
  });

  app.get('/api/meta', async () => ({
    categories: distinctValues('category'),
    types: distinctValues('type'),
    brands: distinctValues('brand'),
    locations: distinctValues('location'),
    tags: distinctValues('tag'),
    sizes: distinctValues('size'),
  }));

  app.get<{ Params: { id: string } }>('/api/items/:id', async (req, reply) => {
    const item = getItem(req.params.id);
    return item ? present(item) : reply.code(404).send({ error: 'not found' });
  });

  app.post<{ Body: ItemInput }>('/api/items', async (req, reply) => {
    const item = buildItem(req.body ?? {});
    if (!item.category && !item.type && !item.design) {
      req.log.info({ body: req.body }, 'item create rejected: no category, type or design');
      return reply.code(400).send({ error: 'category, type or design is required' });
    }
    insertItem(item);
    req.log.info({ itemId: item.id, by: item.updated_by, fields: diff(undefined, item) }, `item created: ${describe(item)}`);
    const synced = await pushQuietly(req, 'create');
    return reply.code(201).send({ item: present(getItem(item.id)!), synced });
  });

  app.put<{ Params: { id: string }; Body: ItemInput }>('/api/items/:id', async (req, reply) => {
    const base = getItem(req.params.id);
    if (!base) {
      req.log.info({ itemId: req.params.id }, 'item update: not found');
      return reply.code(404).send({ error: 'not found' });
    }
    const next = buildItem(req.body ?? {}, base);
    updateItem(next);
    req.log.info({ itemId: base.id, by: next.updated_by, changed: diff(base, next) }, `item updated: ${describe(next)}`);
    const synced = await pushQuietly(req, 'update');
    return { item: present(getItem(base.id)!), synced };
  });

  app.post<{ Params: { id: string }; Body: { status: ItemStatus; updated_by?: string } }>(
    '/api/items/:id/status',
    async (req, reply) => {
      const base = getItem(req.params.id);
      if (!base) return reply.code(404).send({ error: 'not found' });
      const status = req.body?.status === 'retired' ? 'retired' : 'active';
      const next = buildItem({ status, updated_by: req.body?.updated_by }, base);
      updateItem(next);
      req.log.info({ itemId: base.id, by: next.updated_by, from: base.status, to: status }, `item status: ${describe(base)}`);
      const synced = await pushQuietly(req, 'status');
      return { item: present(getItem(base.id)!), synced };
    },
  );

  // Cover photo: multipart field "photo". Resized, EXIF-rotated, stored as webp + thumbnail. Not synced to the sheet.
  app.post<{ Params: { id: string } }>('/api/items/:id/photo', async (req, reply) => {
    const base = getItem(req.params.id);
    if (!base) {
      req.log.info({ itemId: req.params.id }, 'photo upload: item not found');
      return reply.code(404).send({ error: 'not found' });
    }
    const file = await req.file();
    if (!file) {
      req.log.info({ itemId: base.id }, 'photo upload: no file in request');
      return reply.code(400).send({ error: 'no file' });
    }
    const buf = await file.toBuffer();
    req.log.info(
      { itemId: base.id, filename: file.filename, mimetype: file.mimetype, bytes: buf.length, replacing: base.photo ?? null },
      `photo upload received: ${describe(base)}`,
    );

    const name = `${base.id}.webp`;
    const full = path.join(photosDir, name);
    const thumb = path.join(photosDir, `${base.id}.thumb.webp`);
    try {
      const image = sharp(buf, { failOn: 'none' }).rotate();
      const meta = await image.metadata();
      const out = await image.clone().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 }).toFile(full);
      await image.clone().resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'cover' }).webp({ quality: 75 }).toFile(thumb);
      const version = setPhoto(base.id, name);
      req.log.info(
        { itemId: base.id, source: `${meta.width}x${meta.height} ${meta.format}`, stored: `${out.width}x${out.height}`, storedBytes: out.size, file: name, version },
        `photo stored: ${describe(base)}`,
      );
    } catch (e) {
      req.log.error({ itemId: base.id, err: e }, 'photo processing failed');
      return reply.code(422).send({ error: 'could not process that image' });
    }
    backupSoon();
    return { item: present(getItem(base.id)!) };
  });

  app.delete<{ Params: { id: string } }>('/api/items/:id/photo', async (req, reply) => {
    const base = getItem(req.params.id);
    if (!base) return reply.code(404).send({ error: 'not found' });
    if (base.photo) {
      await fs.rm(path.join(photosDir, base.photo), { force: true });
      await fs.rm(path.join(photosDir, `${base.id}.thumb.webp`), { force: true });
      setPhoto(base.id, null);
      req.log.info({ itemId: base.id, file: base.photo }, `photo removed: ${describe(base)}`);
    }
    return { item: present(getItem(base.id)!) };
  });
}
