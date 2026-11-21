import type { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { photosDir } from '../config.js';
import { buildItem, distinctValues, getItem, insertItem, listItems, setPhoto, updateItem } from '../db.js';
import { backupSoon } from '../backup.js';
import { syncNow } from '../sync.js';
import type { Item, ItemInput, ItemStatus } from '../types.js';

const MAX_EDGE = 1600;
const THUMB_EDGE = 320;

/** Write-through: persist locally, then push to the sheet. The response never waits on a failed sheet. */
async function pushQuietly(reason: string): Promise<boolean> {
  backupSoon();
  try {
    return (await syncNow(reason)).ok;
  } catch {
    return false;
  }
}

const photoUrls = (item: Item) =>
  item.photo
    ? { photo_url: `/photos/${item.photo}`, thumb_url: `/photos/${item.photo.replace(/\.webp$/, '.thumb.webp')}` }
    : { photo_url: null, thumb_url: null };
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
      return reply.code(400).send({ error: 'category, type or design is required' });
    }
    insertItem(item);
    const synced = await pushQuietly('create');
    return reply.code(201).send({ item: present(getItem(item.id)!), synced });
  });

  app.put<{ Params: { id: string }; Body: ItemInput }>('/api/items/:id', async (req, reply) => {
    const base = getItem(req.params.id);
    if (!base) return reply.code(404).send({ error: 'not found' });
    updateItem(buildItem(req.body ?? {}, base));
    const synced = await pushQuietly('update');
    return { item: present(getItem(base.id)!), synced };
  });

  app.post<{ Params: { id: string }; Body: { status: ItemStatus; updated_by?: string } }>(
    '/api/items/:id/status',
    async (req, reply) => {
      const base = getItem(req.params.id);
      if (!base) return reply.code(404).send({ error: 'not found' });
      const status = req.body?.status === 'retired' ? 'retired' : 'active';
      updateItem(buildItem({ status, updated_by: req.body?.updated_by }, base));
      const synced = await pushQuietly('status');
      return { item: present(getItem(base.id)!), synced };
    },
  );

  // Cover photo: multipart field "photo". Resized, EXIF-rotated, stored as webp + thumbnail. Not synced to the sheet.
  app.post<{ Params: { id: string } }>('/api/items/:id/photo', async (req, reply) => {
    const base = getItem(req.params.id);
    if (!base) return reply.code(404).send({ error: 'not found' });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no file' });
    const buf = await file.toBuffer();

    const name = `${base.id}.webp`;
    const image = sharp(buf, { failOn: 'none' }).rotate();
    await image.clone().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toFile(path.join(photosDir, name));
    await image.clone().resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: 'cover' })
      .webp({ quality: 75 }).toFile(path.join(photosDir, `${base.id}.thumb.webp`));

    setPhoto(base.id, name);
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
    }
    return { item: present(getItem(base.id)!) };
  });
}
