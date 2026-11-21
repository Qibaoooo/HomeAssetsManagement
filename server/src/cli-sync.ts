// One-off sync from the command line: `npm run sync`
import { syncNow } from './sync.js';

const result = await syncNow('cli');
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
