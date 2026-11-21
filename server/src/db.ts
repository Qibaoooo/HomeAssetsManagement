import Database from 'better-sqlite3';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { config, dbFile, photosDir } from './config.js';
import type { Item, ItemInput, ItemStatus } from './types.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(photosDir, { recursive: true });

export const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id            TEXT PRIMARY KEY,
    category      TEXT NOT NULL DEFAULT '',
    type          TEXT NOT NULL DEFAULT '',
    design        TEXT NOT NULL DEFAULT '',
    brand         TEXT NOT NULL DEFAULT '',
    location      TEXT NOT NULL DEFAULT '',
    size          TEXT NOT NULL DEFAULT '',
    quantity      INTEGER,
    remarks       TEXT NOT NULL DEFAULT '',
    tag           TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'active',
    purchase_date TEXT,
    price         REAL,
    updated_at    TEXT NOT NULL,
    updated_by    TEXT NOT NULL DEFAULT '',
    photo         TEXT,
    dirty         INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sync_log (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    at      TEXT NOT NULL,
    level   TEXT NOT NULL,
    message TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Lightweight migrations for columns added after the first release.
const cols = new Set((db.pragma('table_info(items)') as { name: string }[]).map((c) => c.name));
if (!cols.has('synced_key')) db.exec(`ALTER TABLE items ADD COLUMN synced_key TEXT`);

export const now = () => new Date().toISOString();

const ITEM_COLS =
  'id, category, type, design, brand, location, size, quantity, remarks, tag, status, purchase_date, price, updated_at, updated_by, photo, dirty, created_at, synced_key';

const stmts = {
  all: db.prepare(`SELECT ${ITEM_COLS} FROM items ORDER BY category, type, design`),
  byStatus: db.prepare(`SELECT ${ITEM_COLS} FROM items WHERE status = ? ORDER BY category, type, design`),
  byId: db.prepare(`SELECT ${ITEM_COLS} FROM items WHERE id = ?`),
  dirty: db.prepare(`SELECT ${ITEM_COLS} FROM items WHERE dirty = 1`),
  insert: db.prepare(
    `INSERT INTO items (${ITEM_COLS}) VALUES (@id, @category, @type, @design, @brand, @location, @size, @quantity, @remarks, @tag, @status, @purchase_date, @price, @updated_at, @updated_by, @photo, @dirty, @created_at, @synced_key)`,
  ),
  update: db.prepare(
    `UPDATE items SET category=@category, type=@type, design=@design, brand=@brand, location=@location, size=@size, quantity=@quantity, remarks=@remarks, tag=@tag, status=@status, purchase_date=@purchase_date, price=@price, updated_at=@updated_at, updated_by=@updated_by, dirty=@dirty, synced_key=@synced_key WHERE id=@id`,
  ),
  setPhoto: db.prepare(`UPDATE items SET photo=? WHERE id=?`),
  markSynced: db.prepare(`UPDATE items SET dirty=0, synced_key=? WHERE id=?`),
  log: db.prepare(`INSERT INTO sync_log (at, level, message) VALUES (?, ?, ?)`),
  logTail: db.prepare(`SELECT at, level, message FROM sync_log ORDER BY id DESC LIMIT ?`),
  metaGet: db.prepare(`SELECT value FROM meta WHERE key = ?`),
  metaSet: db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
};

export function listItems(status: ItemStatus | 'all' = 'active'): Item[] {
  return (status === 'all' ? stmts.all.all() : stmts.byStatus.all(status)) as Item[];
}
export function getItem(id: string): Item | undefined {
  return stmts.byId.get(id) as Item | undefined;
}
export function dirtyItems(): Item[] {
  return stmts.dirty.all() as Item[];
}

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Normalise API input into a full item row (used for create and update). */
export function buildItem(input: ItemInput, base?: Item, opts: { dirty: number } = { dirty: 1 }): Item {
  const ts = now();
  const status: ItemStatus =
    input.status === 'retired' ? 'retired' : input.status === 'active' ? 'active' : (base?.status ?? 'active');
  return {
    id: base?.id ?? randomUUID(),
    category: str(input.category ?? base?.category),
    type: str(input.type ?? base?.type),
    design: str(input.design ?? base?.design),
    brand: str(input.brand ?? base?.brand),
    location: str(input.location ?? base?.location),
    size: str(input.size ?? base?.size),
    quantity: 'quantity' in input ? num(input.quantity) : (base?.quantity ?? null),
    remarks: str(input.remarks ?? base?.remarks),
    tag: str(input.tag ?? base?.tag),
    status,
    purchase_date: 'purchase_date' in input ? str(input.purchase_date) || null : (base?.purchase_date ?? null),
    price: 'price' in input ? num(input.price) : (base?.price ?? null),
    updated_at: ts,
    updated_by: str(input.updated_by ?? base?.updated_by),
    photo: base?.photo ?? null,
    dirty: opts.dirty,
    created_at: base?.created_at ?? ts,
    synced_key: base?.synced_key ?? null,
  };
}

export function insertItem(item: Item) {
  stmts.insert.run(item);
}
export function updateItem(item: Item) {
  stmts.update.run(item);
}
/** Insert or update from sync; never touches photo. The row is clean afterwards. */
export function upsertFromSheet(item: Omit<Item, 'photo' | 'created_at' | 'dirty'>) {
  const existing = getItem(item.id);
  if (existing) updateItem({ ...existing, ...item, dirty: 0, photo: existing.photo, created_at: existing.created_at });
  else insertItem({ ...item, dirty: 0, photo: null, created_at: now() });
}
export function setPhoto(id: string, photo: string | null) {
  stmts.setPhoto.run(photo, id);
}
/** Local row has been written to the sheet; remember what the sheet now holds. */
export function markSynced(id: string, syncedKey: string) {
  stmts.markSynced.run(syncedKey, id);
}

export function log(level: 'info' | 'warn' | 'error', message: string) {
  stmts.log.run(now(), level, message);
  const line = `[sync] ${level}: ${message}`;
  if (level === 'error') console.error(line);
  else console.log(line);
}
export function logTail(limit = 50) {
  return stmts.logTail.all(limit) as { at: string; level: string; message: string }[];
}
export function metaGet(key: string): string | null {
  return (stmts.metaGet.get(key) as { value: string } | undefined)?.value ?? null;
}
export function metaSet(key: string, value: string) {
  stmts.metaSet.run(key, value);
}

const DISTINCT_COLS = ['category', 'type', 'brand', 'location', 'tag', 'size'] as const;
export type DistinctCol = (typeof DISTINCT_COLS)[number];
const distinctStmts = Object.fromEntries(
  DISTINCT_COLS.map((c) => [c, db.prepare(`SELECT DISTINCT ${c} AS v FROM items WHERE ${c} <> '' ORDER BY ${c}`)]),
) as Record<DistinctCol, Database.Statement>;
export function distinctValues(col: DistinctCol): string[] {
  return (distinctStmts[col].all() as { v: string }[]).map((r) => r.v);
}
export const transaction = <T>(fn: () => T): T => db.transaction(fn)();
