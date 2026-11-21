// Copy the production data folder into data-test/ so the test instance has realistic data.
// Usage: npm run test:seed   (stop the test instance first; prod can keep running)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'data');
const dst = path.join(root, 'data-test');

if (!fs.existsSync(path.join(src, 'home-assets.sqlite'))) {
  console.error('no production database at data/home-assets.sqlite');
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
console.log(`seeded data-test/ from data/: database + ${n} photo files`);
