import { google, type drive_v3 } from 'googleapis';
import fs from 'node:fs';
import { config } from './config.js';

/**
 * Google Drive access as the user (OAuth refresh token), not as the service account:
 * service accounts have no storage quota in a personal Drive, so backups must be owned by you.
 *
 * Files: secrets/oauth-client.json (Desktop-app client from Cloud Console)
 *        secrets/drive-token.json  (written by `npm run drive-auth`)
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

interface InstalledClient {
  installed?: { client_id: string; client_secret: string };
  web?: { client_id: string; client_secret: string };
}

export function hasOAuthClient(): boolean {
  return fs.existsSync(config.oauthClientFile);
}
export function hasDriveToken(): boolean {
  return fs.existsSync(config.driveTokenFile);
}

export function loadOAuthClient(redirectUri?: string) {
  const raw = JSON.parse(fs.readFileSync(config.oauthClientFile, 'utf8')) as InstalledClient;
  const c = raw.installed ?? raw.web;
  if (!c) throw new Error(`${config.oauthClientFile} is not an OAuth client JSON (expected "installed")`);
  return new google.auth.OAuth2(c.client_id, c.client_secret, redirectUri);
}

export function saveDriveToken(tokens: object) {
  fs.mkdirSync(require_dirname(config.driveTokenFile), { recursive: true });
  fs.writeFileSync(config.driveTokenFile, JSON.stringify(tokens, null, 2));
}
const require_dirname = (p: string) => p.replace(/[\\/][^\\/]*$/, '');

let client: drive_v3.Drive | undefined;
export function getDrive(): drive_v3.Drive {
  if (client) return client;
  if (!hasOAuthClient()) throw new Error(`missing ${config.oauthClientFile}`);
  if (!hasDriveToken()) throw new Error('Google Drive is not authorised yet; run `npm run drive-auth`');
  const auth = loadOAuthClient();
  auth.setCredentials(JSON.parse(fs.readFileSync(config.driveTokenFile, 'utf8')));
  auth.on('tokens', (t) => {
    // Persist rotated refresh tokens so the login never has to be repeated.
    const current = JSON.parse(fs.readFileSync(config.driveTokenFile, 'utf8'));
    saveDriveToken({ ...current, ...t });
  });
  client = google.drive({ version: 'v3', auth });
  return client;
}

const esc = (s: string) => s.replace(/'/g, "\\'");

export async function findChild(drive: drive_v3.Drive, parent: string, name: string, folder = false) {
  const q = [`'${parent}' in parents`, `name = '${esc(name)}'`, 'trashed = false', folder ? `mimeType = '${FOLDER_MIME}'` : `mimeType != '${FOLDER_MIME}'`].join(' and ');
  const res = await drive.files.list({ q, fields: 'files(id, name, size, modifiedTime)', pageSize: 1, spaces: 'drive' });
  return res.data.files?.[0];
}

export async function ensureFolder(drive: drive_v3.Drive, parent: string, name: string): Promise<string> {
  const existing = await findChild(drive, parent, name, true);
  if (existing?.id) return existing.id;
  const res = await drive.files.create({ requestBody: { name, mimeType: FOLDER_MIME, parents: [parent] }, fields: 'id' });
  return res.data.id!;
}

export interface RemoteFile {
  id: string;
  name: string;
  size: number;
  modifiedTime: string;
}

export async function listFiles(drive: drive_v3.Drive, parent: string): Promise<Map<string, RemoteFile>> {
  const out = new Map<string, RemoteFile>();
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${parent}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`,
      fields: 'nextPageToken, files(id, name, size, modifiedTime)',
      pageSize: 1000,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      out.set(f.name!, { id: f.id!, name: f.name!, size: Number(f.size ?? 0), modifiedTime: f.modifiedTime ?? '' });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/** Upload a local file; updates in place when a file of that name already exists (Drive keeps revisions). */
export async function putFile(drive: drive_v3.Drive, parent: string, name: string, localPath: string, mimeType: string, existingId?: string) {
  const media = { mimeType, body: fs.createReadStream(localPath) };
  if (existingId) {
    const res = await drive.files.update({ fileId: existingId, media, fields: 'id, size' });
    return res.data;
  }
  const res = await drive.files.create({ requestBody: { name, parents: [parent] }, media, fields: 'id, size' });
  return res.data;
}

export async function downloadFile(drive: drive_v3.Drive, fileId: string, localPath: string) {
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(localPath);
    res.data.on('error', reject).pipe(out).on('finish', () => resolve()).on('error', reject);
  });
}
