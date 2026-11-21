// Copy production data into data-test/ so the test instance has realistic data.
// Usage: npm run test:seed            from the PHONE (production, see docs/RUNBOOK-phone.md)
//        npm run test:seed -- --local from this machine's data/ (stale once prod moved to the phone)
// Stop the test instance first; prod can keep running (the phone copy is a consistent snapshot).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dst = path.join(root, 'data-test');
const PHONE = process.env.PHONE ?? '192.168.1.102';
const local = process.argv.includes('--local');

let src = path.join(root, 'data');
if (!local) {
  // Snapshot on the phone with the SQLite backup API (safe while the server writes), stage it in
  // the Termux home (visible from inside Ubuntu), scp it here.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ha-seed-'));
  const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  console.log(`seeding from the phone at ${PHONE} ...`);
  run('ssh', ['-p', '8022', '-o', 'BatchMode=yes', PHONE, '~/home-assets-snapshot.sh']);
  run('scp', ['-q', '-P', '8022', '-r', `${PHONE}:seed/home-assets.sqlite`, `${PHONE}:seed/photos`, tmp]);
  run('ssh', ['-p', '8022', '-o', 'BatchMode=yes', PHONE, 'rm -rf ~/seed']);
  src = tmp;
}

if (!fs.existsSync(path.join(src, 'home-assets.sqlite'))) {
  console.error(`no database at ${src}`);
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(path.join(dst, 'photos'), { recursive: true });
// Copy the database and its WAL/SHM side files if present (a live prod writes to them).
for (const f of ['home-assets.sqlite', 'home-assets.sqlite-wal', 'home-assets.sqlite-shm']) {
  if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
let n = 0;
for (const f of fs.readdirSync(path.join(src, 'photos'))) {
  fs.copyFileSync(path.join(src, 'photos', f), path.join(dst, 'photos', f));
  n++;
}
console.log(`seeded data-test/ from ${local ? 'local data/' : 'the phone'}: database + ${n} photo files`);
if (!local) fs.rmSync(src, { recursive: true, force: true });
