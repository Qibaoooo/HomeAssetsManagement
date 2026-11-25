/**
 * Location tree: a fixed list the household manages in Settings, with levels.
 *
 * - Each node is a full path such as "Master Bedroom > Right shelf > Top". Items store that same
 *   path text in their Location cell, so the sheet stays readable and self-describing.
 * - The list lives in SQLite and is mirrored to its own sheet tab (config.locationsTab), one path
 *   per row in tree order. App changes rewrite the tab; hand edits to the tab are adopted on sync.
 * - Renaming or moving a node rewrites every item under it (one bulk update, one sync).
 * - Item locations not in the list (typed by hand in the sheet) are kept as-is and reported as
 *   "unlisted" so Settings can map or add them.
 */
import { db, log, metaGet, metaSet, now, transaction } from './db.js';
import { createLocationsTab, readLocationsTab, writeLocationsTab } from './sheets.js';

export const SEP = ' > ';
export const MAX_DEPTH = 4;
const NAME_MAX = 60;
const PATH_MAX = 200;

db.exec(`CREATE TABLE IF NOT EXISTS locations (path TEXT PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 0)`);

// ---- path helpers -------------------------------------------------------------
export const splitPath = (p: string): string[] =>
  String(p ?? '')
    .split('>')
    .map((s) => s.trim())
    .filter(Boolean);
export const joinPath = (parts: string[]) => parts.join(SEP);
export const normalizePath = (p: string) => joinPath(splitPath(p));
export const parentOf = (p: string) => joinPath(splitPath(p).slice(0, -1));
export const isUnder = (path: string, root: string) => path === root || path.startsWith(root + SEP);

/** Returns a human-readable problem with a path, or null when it is acceptable. */
export function validatePath(p: string): string | null {
  const parts = splitPath(p);
  if (!parts.length) return 'a location name is required';
  if (parts.length > MAX_DEPTH) return `locations can be at most ${MAX_DEPTH} levels deep`;
  if (parts.some((s) => s.length > NAME_MAX)) return `each level can be at most ${NAME_MAX} characters`;
  if (joinPath(parts).length > PATH_MAX) return `the full location is too long (max ${PATH_MAX} characters)`;
  return null;
}

// ---- storage -------------------------------------------------------------------
const stmts = {
  all: db.prepare(`SELECT path, sort FROM locations`),
  has: db.prepare(`SELECT 1 FROM locations WHERE path = ?`),
  insert: db.prepare(`INSERT OR IGNORE INTO locations (path, sort) VALUES (?, ?)`),
  del: db.prepare(`DELETE FROM locations WHERE path = ?`),
  setSort: db.prepare(`UPDATE locations SET sort = ? WHERE path = ?`),
  clear: db.prepare(`DELETE FROM locations`),
  moveItems: db.prepare(
    `UPDATE items SET location = @to || substr(location, @n + 1), updated_at = @at, updated_by = @by, dirty = 1
     WHERE location = @from OR substr(location, 1, @n2) = @fromSep`,
  ),
  countUnder: db.prepare(`SELECT COUNT(*) AS n FROM items WHERE location = @p OR substr(location, 1, @n2) = @pSep`),
  reassign: db.prepare(
    `UPDATE items SET location = @to, updated_at = @at, updated_by = @by, dirty = 1
     WHERE location = @p OR substr(location, 1, @n2) = @pSep`,
  ),
  usage: db.prepare(`SELECT location, status, COUNT(*) AS n FROM items WHERE location <> '' GROUP BY location, status`),
};

const markDirty = () => metaSet('locations_dirty', '1');
export const hasPath = (p: string) => !!stmts.has.get(p);

function rows(): { path: string; sort: number }[] {
  return stmts.all.all() as { path: string; sort: number }[];
}

/** Every path in tree order: depth first, siblings by sort then name. */
export function listPaths(): string[] {
  const kids = new Map<string, { path: string; sort: number }[]>();
  for (const r of rows()) {
    const p = parentOf(r.path);
    (kids.get(p) ?? kids.set(p, []).get(p)!).push(r);
  }
  for (const list of kids.values()) list.sort((a, b) => a.sort - b.sort || a.path.localeCompare(b.path));
  const out: string[] = [];
  const walk = (parent: string) => {
    for (const r of kids.get(parent) ?? []) {
      out.push(r.path);
      walk(r.path);
    }
  };
  walk('');
  return out;
}

const siblings = (parent: string) =>
  rows()
    .filter((r) => parentOf(r.path) === parent)
    .sort((a, b) => a.sort - b.sort || a.path.localeCompare(b.path));

/** Insert a node and any missing ancestors; new nodes go last among their siblings. */
function insertNode(path: string) {
  const parts = splitPath(path);
  for (let i = 1; i <= parts.length; i++) {
    const p = joinPath(parts.slice(0, i));
    if (hasPath(p)) continue;
    const sibs = siblings(joinPath(parts.slice(0, i - 1)));
    stmts.insert.run(p, sibs.length ? Math.max(...sibs.map((s) => s.sort)) + 1 : 0);
  }
}

export function addPath(raw: string): string {
  const path = normalizePath(raw);
  const problem = validatePath(path);
  if (problem) throw new LocationError(problem);
  transaction(() => insertNode(path));
  markDirty();
  return path;
}

export class LocationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const n2 = (p: string) => (p + SEP).length;

/**
 * Rename or move `from` to `to`. `from` may be a listed node (its subtree moves with it) or an
 * unlisted item value (its items are mapped onto `to`). Moving onto an existing node merges.
 * Returns how many items changed.
 */
export function renamePath(fromRaw: string, toRaw: string, by: string): number {
  const from = String(fromRaw ?? '').trim();
  const to = normalizePath(toRaw);
  if (!from) throw new LocationError('the current location is required');
  const problem = validatePath(to);
  if (problem) throw new LocationError(problem);
  if (to === from) throw new LocationError('the new location is the same as the current one');
  if (hasPath(from) && isUnder(to, from)) throw new LocationError('a location cannot be moved inside itself');

  let changed = 0;
  transaction(() => {
    // parents before children, so each child's new parent already exists when it is inserted
    const moving = rows()
      .filter((r) => isUnder(r.path, from))
      .sort((x, y) => splitPath(x.path).length - splitPath(y.path).length);
    if (moving.length) {
      const deepest = Math.max(...moving.map((r) => splitPath(r.path).length - splitPath(from).length));
      if (splitPath(to).length + deepest > MAX_DEPTH) throw new LocationError(`that move would go deeper than ${MAX_DEPTH} levels`);
    }
    for (const r of moving) {
      const next = to + r.path.slice(from.length);
      stmts.del.run(r.path);
      if (hasPath(next)) continue; // merging into an existing node
      if (r.path !== from) stmts.insert.run(next, r.sort);
      else if (parentOf(from) === parentOf(to)) stmts.insert.run(next, r.sort); // rename in place keeps its position
      else insertNode(next); // moved under a new parent: goes last there
    }
    if (!moving.length) insertNode(to); // mapping an unlisted value: make sure the target exists
    changed = stmts.moveItems.run({ from, fromSep: from + SEP, to, n: from.length, n2: n2(from), at: now(), by }).changes;
  });
  markDirty();
  return changed;
}

/** Items under a node (the node itself and every sub-location), any status. */
export const itemsUnder = (p: string) => (stmts.countUnder.get({ p, pSep: p + SEP, n2: n2(p) }) as { n: number }).n;

/**
 * Delete a node and its sub-locations. When items still use it, `reassignTo` says where they go:
 * a listed location, or '' for no location. Returns how many items changed.
 */
export function deletePath(path: string, reassignTo: string | null, by: string): number {
  if (!hasPath(path)) throw new LocationError(`"${path}" is not in the location list`, 404);
  const used = itemsUnder(path);
  let target = reassignTo == null ? null : normalizePath(reassignTo);
  if (used && target == null) throw new LocationError(`${used} item(s) still use this location; choose where they go`, 409);
  if (target && !hasPath(target)) throw new LocationError(`"${target}" is not in the location list`);
  if (target && isUnder(target, path)) throw new LocationError('items cannot move into the location being deleted');
  let changed = 0;
  transaction(() => {
    if (used) changed = stmts.reassign.run({ p: path, pSep: path + SEP, n2: n2(path), to: target ?? '', at: now(), by }).changes;
    for (const r of rows()) if (isUnder(r.path, path)) stmts.del.run(r.path);
  });
  markDirty();
  return changed;
}

/** Move a node one place up or down among its siblings. */
export function reorderPath(path: string, direction: 'up' | 'down') {
  if (!hasPath(path)) throw new LocationError(`"${path}" is not in the location list`, 404);
  transaction(() => {
    const sibs = siblings(parentOf(path));
    const i = sibs.findIndex((s) => s.path === path);
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= sibs.length) return;
    [sibs[i], sibs[j]] = [sibs[j]!, sibs[i]!];
    sibs.forEach((s, k) => stmts.setSort.run(k, s.path));
  });
  markDirty();
}

/** Replace the whole list (a hand edit of the sheet tab). Order of appearance becomes the sort order. */
function replaceAll(paths: string[]) {
  transaction(() => {
    stmts.clear.run();
    for (const raw of paths) {
      const p = normalizePath(raw);
      if (p && !validatePath(p)) insertNode(p);
    }
  });
}

/** First start with this feature: build the list from the locations items already use. */
export function seedLocationsIfNeeded() {
  if (metaGet('locations_seeded')) return;
  transaction(() => {
    const used = db.prepare(`SELECT DISTINCT location AS v FROM items WHERE location <> '' ORDER BY location`).all() as { v: string }[];
    for (const { v } of used) {
      const p = normalizePath(v);
      if (p && !validatePath(p)) insertNode(p);
    }
    metaSet('locations_seeded', now());
  });
}

export interface LocationNode {
  path: string;
  name: string;
  depth: number;
  /** items directly here */
  active: number;
  retired: number;
  /** items here or in any sub-location */
  subtreeActive: number;
  subtreeTotal: number;
}
export function locationUsage(): { nodes: LocationNode[]; unlisted: { location: string; active: number; retired: number }[] } {
  const counts = new Map<string, { active: number; retired: number }>();
  for (const r of stmts.usage.all() as { location: string; status: string; n: number }[]) {
    const c = counts.get(r.location) ?? counts.set(r.location, { active: 0, retired: 0 }).get(r.location)!;
    if (r.status === 'retired') c.retired += r.n;
    else c.active += r.n;
  }
  const paths = listPaths();
  const listed = new Set(paths);
  const nodes = paths.map((path) => {
    let subtreeActive = 0;
    let subtreeTotal = 0;
    for (const [loc, c] of counts) {
      if (!isUnder(loc, path)) continue;
      subtreeActive += c.active;
      subtreeTotal += c.active + c.retired;
    }
    const parts = splitPath(path);
    const own = counts.get(path) ?? { active: 0, retired: 0 };
    return { path, name: parts[parts.length - 1]!, depth: parts.length - 1, ...own, subtreeActive, subtreeTotal };
  });
  const unlisted = [...counts.entries()]
    .filter(([loc]) => !listed.has(loc))
    .map(([location, c]) => ({ location, ...c }))
    .sort((a, b) => a.location.localeCompare(b.location));
  return { nodes, unlisted };
}

// ---- sheet tab sync ---------------------------------------------------------------
/**
 * Called from every sheet sync. App changes (dirty) rewrite the tab; otherwise a tab that differs
 * from the local list is a hand edit and is adopted. A missing or empty tab gets the local list.
 */
export async function syncLocationsTab() {
  seedLocationsIfNeeded();
  const tab = await readLocationsTab();
  const local = listPaths();
  const dirty = metaGet('locations_dirty') === '1';
  if (tab === null) await createLocationsTab();
  if (tab === null || tab.length === 0 || dirty) {
    if (tab === null || tab.join('\n') !== local.join('\n')) await writeLocationsTab(local, tab?.length ?? 0);
    metaSet('locations_dirty', '0');
    if (tab === null) log('info', `created the location tab with ${local.length} locations`);
    return;
  }
  if (tab.join('\n') !== local.join('\n')) {
    replaceAll(tab);
    log('info', `pulled hand edit of the location tab (${tab.length} rows)`);
    // normalise what was typed (spacing, missing parents) back into the tab
    const fixed = listPaths();
    if (fixed.join('\n') !== tab.join('\n')) await writeLocationsTab(fixed, tab.length);
  }
}
