// Run the mock Sheets API on its own, for manual testing with the test instance:
//   npm run mock:sheets             -> http://127.0.0.1:8790/
//   SHEETS_API_URL=http://127.0.0.1:8790/ SHEET_SYNC=on npm run start:test
import { startMockSheets } from './mock-sheets.js';

const HEADERS = ['Category', 'Type', 'Design', 'Brand', 'Location', 'Size', 'Quantity', 'Remarks', 'Tag'];
const rows = [
  HEADERS,
  ['Bedding', 'Pillow', '-', 'Taobao', 'MasterBR', '', '2', 'To buy 2 more', '-'],
  ['Bedding', 'Bedsheet', 'Beige', 'Downland', 'MasterBR', '', '1', '', 'A'],
  ['Suitcase', 'Carry on', 'Green', 'Paul', 'StorageRoom', '', '1', '', ''],
];
const mock = await startMockSheets({ tab: process.env.SHEET_TAB ?? 'HomeAssets', rows, port: 8790 });
console.log(`mock Sheets API at ${mock.url} with ${rows.length - 1} rows (Ctrl-C to stop)`);
setInterval(() => {
  const g = mock.grid();
  console.log(`[mock] ${g.length - 1} rows, ${mock.calls.length} calls so far`);
}, 60_000).unref();
