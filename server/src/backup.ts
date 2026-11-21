import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, dbFile, photosDir } from './config.js';
import { db, log, metaGet, metaSet, now } from './db.js';
import { ensureFolder, getDrive, hasDriveToken, hasOAuthClient, listFiles, putFile } from './drive.js';

export interface BackupResult {
  at: string;
  ok: boolean;
  error?: string;
  /** true when nothing had changed since the previous backup, so nothing was uploaded */
  unchanged: boolean;
  sqliteBytes: number;
  photosUploaded: number;
  photosTotal: number;
  durationMs: number;
}

export const SQLITE_NAME = 'home-assets.sqlite';
export const PHOTOS_FOLDER = 'photos';

export function backupConfigured(): 'ready' | 'no-client' | 'no-token' {
  if (!hasOAuthClient()) return 'no-client';
  if (!hasDriveToken()) return 'no-token';
  return 'ready';
}

/** Resolve (and create if needed) the backup folder tree: <BACKUP_FOLDER>/photos */
export async function backupFolders() {
  const drive = getDrive();
  const root = await ensureFolder(drive, 'root', config.backupFolder);
  const photos = await ensureFolder(drive, root, PHOTOS_FOLDER);
  return { drive, root, photos };
}

const sha256 = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/** Fingerprint of everything we back up, so unchanged data costs no upload. */
function localFingerprint(snapshot: string): { dbHash: string; photos: Map<string, number>; key: string } {
  const dbHash = sha256(snapshot);
  const photos = new Map<string, number>();
  if (fs.existsSync(photosDir)) {
    for (const f of fs.readdirSync(photosDir).filter((n) => n.endsWith('.webp')).sort()) {
      photos.set(f, fs.statSync(path.join(photosDir, f)).size);
    }
  }
  const key = createHash('sha256').update(dbHash).update([...photos].map(([n, s]) => `${n}:${s}`).join('|')).digest('hex');
  return { dbHash, photos, key };
}

async function doBackup(reason: string): Promise<BackupResult> {
  const started = Date.now();
  const result: BackupResult = {
    at: now(), ok: false, unchanged: false, sqliteBytes: 0, photosUploaded: 0, photosTotal: 0, durationMs: 0,
  };
  const snapshot = path.join(config.dataDir, `${SQLITE_NAME}.backup-tmp`);
  try {
    // 1. Consistent SQLite snapshot via the online backup API.
    await db.backup(snapshot);
    result.sqliteBytes = fs.statSync(snapshot).size;
    const fp = localFingerprint(snapshot);
    result.photosTotal = fp.photos.size;

    if (fp.key === metaGet('backup_fingerprint') && lastBackup()?.ok) {
      result.ok = true;
      result.unchanged = true;
    } else {
      const { drive, root, photos } = await backupFolders();

      // 2. Upload the snapshot; an existing file gets a new revision (Drive keeps recent revisions).
      if (fp.dbHash !== metaGet('backup_db_hash')) {
        const existingDb = (await listFiles(drive, root)).get(SQLITE_NAME);
        await putFile(drive, root, SQLITE_NAME, snapshot, 'application/vnd.sqlite3', existingDb?.id);
        metaSet('backup_db_hash', fp.dbHash);
      }

      // 3. Photos: upload anything missing or with a different size. Never deletes remotely.
      const remote = await listFiles(drive, photos);
      for (const [name, size] of fp.photos) {
        const r = remote.get(name);
        if (r && r.size === size) continue;
        await putFile(drive, photos, name, path.join(photosDir, name), 'image/webp', r?.id);
        result.photosUploaded++;
      }
      metaSet('backup_fingerprint', fp.key);
      result.ok = true;
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    log('error', `backup (${reason}) failed: ${result.error}`);
  } finally {
    fs.rmSync(snapshot, { force: true });
  }
  result.durationMs = Date.now() - started;
  metaSet('last_backup', JSON.stringify(result));
  if (result.ok && !result.unchanged) {
    log('info', `backup (${reason}) ok in ${result.durationMs}ms: sqlite ${Math.round(result.sqliteBytes / 1024)} KB, photos +${result.photosUploaded}/${result.photosTotal}`);
  }
  return result;
}

let queue: Promise<unknown> = Promise.resolve();
export function backupNow(reason = 'manual'): Promise<BackupResult> {
  const run = queue.then(() => doBackup(reason));
  queue = run.catch(() => undefined);
  return run;
}

export function lastBackup(): BackupResult | null {
  const raw = metaGet('last_backup');
  return raw ? (JSON.parse(raw) as BackupResult) : null;
}

let timer: NodeJS.Timeout | undefined;
/**
 * Scheduled backups. Runs 90 s after start when overdue (the laptop is not on 24/7), then checks
 * every 10 minutes whether the interval has elapsed. Unchanged data is detected locally and skipped.
 */
export function startBackupScheduler() {
  if (timer || backupConfigured() !== 'ready' || config.backupIntervalMs <= 0) return;
  const due = () => {
    const last = lastBackup();
    return !last?.ok || Date.now() - Date.parse(last.at) > config.backupIntervalMs;
  };
  setTimeout(() => due() && void backupNow('startup'), 90_000).unref();
  timer = setInterval(() => due() && void backupNow('scheduled'), 10 * 60_000);
  timer.unref();
}

let soon: NodeJS.Timeout | undefined;
/** Called after every app write: back up a few minutes after the last change, so a shutdown loses little. */
export function backupSoon(delayMs = 5 * 60_000) {
  if (backupConfigured() !== 'ready' || config.backupIntervalMs <= 0) return;
  if (soon) clearTimeout(soon);
  soon = setTimeout(() => void backupNow('after-edit'), delayMs);
  soon.unref();
}

export const dbPath = dbFile;
