// Run one backup to Google Drive from the command line:  npm run backup
import { backupConfigured, backupNow } from './backup.js';

const state = backupConfigured();
if (state !== 'ready') {
  console.error(state === 'no-client' ? 'Missing secrets/oauth-client.json (see docs/BACKUP.md)' : 'Not authorised; run `npm run drive-auth` first');
  process.exit(1);
}
const result = await backupNow('cli');
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
