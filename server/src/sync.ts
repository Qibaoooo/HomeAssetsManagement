import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { dirtyItems, listItems, log, markSynced, metaGet, metaSet, now, transaction, updateItem, upsertFromSheet } from './db.js';
import { appendRows, fieldsToRow, readSheet, rowToFields, writeRows, type SheetSnapshot } from './sheets.js';
import type { Item, ItemStatus, SheetFields } from './types.js';

export interface SyncResult {
  at: string;
  ok: boolean;
  error?: string;
  pulled: number; // rows taken from sheet into sqlite
  pushed: number; // sqlite rows written over sheet rows
  appended: number; // new sqlite rows added to the sheet
  backfilled: number; // sheet rows that got an id
  retired: number; // sqlite rows retired because their sheet row vanished
  conflicts: number;
  durationMs: number;
}

const numOrNull = (s: string): number | null => {
  if (s === '') return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const parseStatus = (s: string): ItemStatus => (s.trim().toLowerCase() === 'retired' ? 'retired' : 'active');

function parseRow(f: Record<keyof SheetFields, string>): SheetFields {
  return {
    category: f.category,
    type: f.type,
    design: f.design,
    brand: f.brand,
    location: f.location,
    size: f.size,
    quantity: numOrNull(f.quantity),
    remarks: f.remarks,
    tag: f.tag,
    id: f.id,
    updated_at: f.updated_at,
    updated_by: f.updated_by,
    status: parseStatus(f.status),
    purchase_date: f.purchase_date || null,
    price: numOrNull(f.price),
  };
}

/** The user-editable content, as comparable strings. */
const CONTENT_FIELDS: (keyof SheetFields)[] = [
  'category', 'type', 'design', 'brand', 'location', 'size', 'quantity', 'remarks', 'tag', 'status', 'purchase_date', 'price',
];
export function contentKey(f: SheetFields): string {
  return CONTENT_FIELDS.map((k) => {
    const v = f[k];
    return v == null ? '' : String(v);
  }).join('\u0001');
}

const toSheetFields = (i: Item): SheetFields => ({
  category: i.category, type: i.type, design: i.design, brand: i.brand, location: i.location, size: i.size,
  quantity: i.quantity, remarks: i.remarks, tag: i.tag, id: i.id, updated_at: i.updated_at, updated_by: i.updated_by,
  status: i.status, purchase_date: i.purchase_date, price: i.price,
});

/** Take the sheet's version of a row into sqlite and remember it as the synced state. */
const takeFromSheet = (sheet: SheetFields) => upsertFromSheet({ ...sheet, synced_key: contentKey(sheet) });

async function doSync(reason: string): Promise<SyncResult> {
  const started = Date.now();
  const result: SyncResult = {
    at: now(), ok: false, pulled: 0, pushed: 0, appended: 0, backfilled: 0, retired: 0, conflicts: 0, durationMs: 0,
  };
  try {
    const snap: SheetSnapshot = await readSheet();
    const local = new Map(listItems('all').map((i) => [i.id, i]));
    const seen = new Set<string>();
    const updates: { rowNumber: number; values: (string | number)[] }[] = [];
    const appends: (string | number)[][] = [];
    // rows written to the sheet this run; marked clean only after the write succeeds
    const written: { id: string; key: string }[] = [];

    transaction(() => {
      snap.rows.forEach((row, idx) => {
        if (row.every((c) => c === '')) return;
        const rowNumber = idx + 2;
        const sheet = parseRow(rowToFields(snap, row));

        if (!sheet.id) {
          // Hand-added row (or pre-migration row): give it an identity and import it.
          sheet.id = randomUUID();
          sheet.updated_at = now();
          sheet.updated_by = sheet.updated_by || 'sheet';
          takeFromSheet(sheet);
          updates.push({ rowNumber, values: fieldsToRow(snap, sheet) });
          result.backfilled++;
          seen.add(sheet.id);
          return;
        }
        if (seen.has(sheet.id)) {
          log('warn', `duplicate id ${sheet.id} at sheet row ${rowNumber}; row ignored`);
          return;
        }
        seen.add(sheet.id);

        const mine = local.get(sheet.id);
        if (!mine) {
          takeFromSheet(sheet);
          result.pulled++;
          if (!sheet.updated_at) {
            sheet.updated_at = now();
            updates.push({ rowNumber, values: fieldsToRow(snap, sheet) });
          }
          return;
        }

        const mineFields = toSheetFields(mine);
        const sheetKey = contentKey(sheet);
        const differs = sheetKey !== contentKey(mineFields);

        if (mine.dirty) {
          // App edit not yet written: the app wins. A conflict is when the sheet also moved since we last synced it.
          if (mine.synced_key && sheetKey !== mine.synced_key) {
            result.conflicts++;
            log('warn', `conflict on ${describe(mine)}: app edit overwrote a hand edit in the sheet (row ${rowNumber})`);
          }
          updates.push({ rowNumber, values: fieldsToRow(snap, mineFields) });
          written.push({ id: mine.id, key: contentKey(mineFields) });
          result.pushed++;
          return;
        }

        if (differs) {
          if (sheet.updated_at > mine.updated_at) {
            takeFromSheet(sheet);
          } else {
            // Edited by hand without touching updated_at: take it and stamp it.
            sheet.updated_at = now();
            sheet.updated_by = 'sheet';
            takeFromSheet(sheet);
            updates.push({ rowNumber, values: fieldsToRow(snap, sheet) });
          }
          result.pulled++;
          log('info', `pulled hand edit for ${describe(sheet)} (row ${rowNumber})`);
          return;
        }

        // Same content; keep timestamps and the synced marker aligned without counting it as a change.
        if (sheet.updated_at !== mine.updated_at || sheet.updated_by !== mine.updated_by || mine.synced_key !== sheetKey) {
          if (sheet.updated_at) takeFromSheet(sheet);
          else updates.push({ rowNumber, values: fieldsToRow(snap, mineFields) });
        }
      });

      for (const mine of local.values()) {
        if (seen.has(mine.id)) continue;
        if (mine.dirty) {
          const fields = toSheetFields(mine);
          appends.push(fieldsToRow(snap, fields));
          written.push({ id: mine.id, key: contentKey(fields) });
          result.appended++;
        } else if (mine.status !== 'retired') {
          updateItem({ ...mine, status: 'retired', updated_at: now(), updated_by: 'sheet-deleted', dirty: 0 });
          result.retired++;
          log('warn', `row for ${describe(mine)} vanished from the sheet; retired locally`);
        }
      }
    });

    await writeRows(snap, updates);
    await appendRows(snap, appends);
    transaction(() => written.forEach((w) => markSynced(w.id, w.key)));

    result.ok = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    log('error', `sync (${reason}) failed: ${result.error}`);
  }
  result.durationMs = Date.now() - started;
  metaSet('last_sync', JSON.stringify(result));
  if (result.ok) {
    const changed = result.pulled + result.pushed + result.appended + result.backfilled + result.retired;
    log('info', `sync (${reason}) ok in ${result.durationMs}ms: ${changed ? JSON.stringify(summary(result)) : 'no changes'}`);
  }
  return result;
}

const describe = (f: { category: string; type: string; design: string }) =>
  [f.category, f.type, f.design].filter(Boolean).join(' / ') || '(blank item)';
const summary = (r: SyncResult) =>
  Object.fromEntries(
    (['pulled', 'pushed', 'appended', 'backfilled', 'retired', 'conflicts'] as const).filter((k) => r[k]).map((k) => [k, r[k]]),
  );

// Runs are serialised; every caller gets its own full run after any in-flight one.
let queue: Promise<unknown> = Promise.resolve();
export function syncNow(reason = 'manual'): Promise<SyncResult> {
  const run = queue.then(() => doSync(reason));
  queue = run.catch(() => undefined);
  return run;
}

export function lastSync(): SyncResult | null {
  const raw = metaGet('last_sync');
  return raw ? (JSON.parse(raw) as SyncResult) : null;
}
export const pendingCount = () => dirtyItems().length;

let timer: NodeJS.Timeout | undefined;
export function startScheduler() {
  if (timer) return;
  void syncNow('startup');
  timer = setInterval(() => void syncNow('scheduled'), config.syncIntervalMs);
  timer.unref();
}
