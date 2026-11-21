// Restore data/ (SQLite + photos) from the Google Drive backup:  npm run restore [-- --force]
// Refuses to overwrite an existing database unless --force is given. Stop the server first.
import fs from 'node:fs';
import path from 'node:path';
import { config, dbFile, photosDir } from './config.js';
import { PHOTOS_FOLDER, SQLITE_NAME } from './backup.js';
import { downloadFile, ensureFolder, findChild, getDrive, listFiles } from './drive.js';

const force = process.argv.includes('--force');
if (fs.existsSync(dbFile) && !force) {
  console.error(`${dbFile} already exists. Re-run with --force to overwrite it (and stop the server first).`);
  process.exit(1);
}

const drive = getDrive();
const root = await findChild(drive, 'root', config.backupFolder, true);
if (!root?.id) {
  console.error(`No "${config.backupFolder}" folder found in this Drive. Has a backup run yet?`);
  process.exit(1);
}
const dbRemote = await findChild(drive, root.id, SQLITE_NAME);
if (!dbRemote?.id) {
  console.error(`No ${SQLITE_NAME} in the backup folder.`);
  process.exit(1);
}

fs.mkdirSync(photosDir, { recursive: true });
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
await downloadFile(drive, dbRemote.id, dbFile);
console.log(`restored ${SQLITE_NAME} (${dbRemote.size} bytes, modified ${dbRemote.modifiedTime})`);

const photosFolder = await ensureFolder(drive, root.id, PHOTOS_FOLDER);
const remote = await listFiles(drive, photosFolder);
let n = 0;
for (const f of remote.values()) {
  const local = path.join(photosDir, f.name);
  if (fs.existsSync(local) && fs.statSync(local).size === f.size) continue;
  await downloadFile(drive, f.id, local);
  n++;
}
console.log(`restored ${n} photo file(s); ${remote.size} in the backup`);
process.exit(0);
