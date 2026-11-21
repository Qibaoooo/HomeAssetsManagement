import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo root is two levels up from server/src (dev) or server/dist (prod).
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

try {
  process.loadEnvFile(path.join(REPO_ROOT, '.env'));
} catch {
  /* .env is optional */
}

const env = (key: string, fallback: string) => process.env[key] ?? fallback;

export const config = {
  host: env('HOST', '0.0.0.0'),
  port: Number(env('PORT', '8787')),
  sheetId: env('SHEET_ID', '1tEzE0h4k8TVHYLXmiyBs-3Hsq20Lygv5QNrE0Z_9IH4'),
  sheetTab: env('SHEET_TAB', 'HomeAssets'),
  keyFile: path.resolve(REPO_ROOT, env('GOOGLE_KEY_FILE', 'secrets/service-account.json')),
  dataDir: path.resolve(REPO_ROOT, env('DATA_DIR', 'data')),
  clientDist: path.resolve(REPO_ROOT, 'client', 'dist'),
  syncIntervalMs: Number(env('SYNC_INTERVAL_MIN', '1')) * 60_000,
  // Google Drive backup (as the user, via OAuth). See docs/BACKUP.md.
  oauthClientFile: path.resolve(REPO_ROOT, env('GOOGLE_OAUTH_CLIENT', 'secrets/oauth-client.json')),
  driveTokenFile: path.resolve(REPO_ROOT, env('GOOGLE_DRIVE_TOKEN', 'secrets/drive-token.json')),
  backupFolder: env('BACKUP_FOLDER', 'HomeAssets Backup'),
  backupIntervalMs: Number(env('BACKUP_INTERVAL_HOURS', '1')) * 3_600_000,
};

export const photosDir = path.join(config.dataDir, 'photos');
export const dbFile = path.join(config.dataDir, 'home-assets.sqlite');
