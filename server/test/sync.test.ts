// Sync engine against the mock Sheets API. Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';

// Environment must be set before the app modules load (config reads it at import time).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'home-assets-test-'));
process.env.DATA_DIR = tmp;
process.env.SHEET_ID = 'mock-sheet';
process.env.SHEET_TAB = 'HomeAssets';
process.env.BACKUP_INTERVAL_HOURS = '0';

const { startMockSheets } = await import('./mock-sheets.js');
const HEADERS = ['Category', 'Type', 'Design', 'Brand', 'Location', 'Size', 'Quantity', 'Remarks', 'Tag'];
const ROW1 = ['Bedding', 'Pillow', '-', 'Taobao', 'MasterBR', '', '2', 'To buy 2 more', '-'];
const ROW2 = ['Suitcase', 'Carry on', 'Green', 'Paul', 'StorageRoom', '', '1', '', ''];
const mock = await startMockSheets({ tab: 'HomeAssets', rows: [HEADERS, ROW1, ROW2] });
process.env.SHEETS_API_URL = mock.url;

const { syncNow } = await import('../src/sync.js');
const db = await import('../src/db.js');
await import('../src/locations.js'); // creates the locations table the reset below clears

const col = (name: string) => mock.grid()[0]!.findIndex((h) => h.toLowerCase() === name.toLowerCase());
const sheetRow = (type: string) => mock.grid().find((r) => r[1] === type);
const resetAll = () => {
  db.db.exec('DELETE FROM items; DELETE FROM meta; DELETE FROM sync_log; DELETE FROM backup_history; DELETE FROM locations;');
  mock.set([HEADERS, ROW1, ROW2]);
  mock.dropTab('Locations');
};

before(() => resetAll());
beforeEach(() => resetAll());
after(async () => {
  await mock.close();
  db.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('first sync adds the id/updated_at/status columns and backfills every row', async () => {
  const r = await syncNow('test');
  assert.equal(r.ok, true);
  assert.equal(r.backfilled, 2);
  const g = mock.grid();
  for (const h of ['id', 'updated_at', 'updated_by', 'status', 'purchase_date', 'price']) assert.ok(col(h) >= 0, `header ${h}`);
  assert.match(g[1]![col('id')]!, /^[0-9a-f-]{36}$/);
  assert.equal(g[1]![col('status')], 'active');
  assert.equal(db.listItems('all').length, 2);

  const again = await syncNow('test');
  assert.deepEqual([again.pulled, again.pushed, again.appended, again.backfilled, again.retired], [0, 0, 0, 0, 0]);
});

test('an item created in the app is appended to the sheet and marked clean', async () => {
  await syncNow('test');
  const item = db.buildItem({ category: 'Test', type: 'Widget', quantity: 3, tag: 'x', updated_by: 'me' });
  db.insertItem(item);
  assert.equal(db.getItem(item.id)!.dirty, 1);

  const r = await syncNow('test');
  assert.equal(r.appended, 1);
  const row = sheetRow('Widget')!;
  assert.equal(row[col('id')], item.id);
  assert.equal(row[col('Quantity')], '3');
  assert.equal(row[col('updated_by')], 'me');
  assert.equal(db.getItem(item.id)!.dirty, 0);
  assert.equal(mock.grid().length, 4);
});

test('a hand edit in the sheet is pulled and stamped', async () => {
  await syncNow('test');
  const rowIdx = mock.grid().findIndex((r) => r[1] === 'Pillow');
  mock.cell(rowIdx, col('Remarks'), 'bought 2 more');
  mock.cell(rowIdx, col('Quantity'), '4');

  const r = await syncNow('test');
  assert.equal(r.pulled, 1);
  const item = db.listItems('all').find((i) => i.type === 'Pillow')!;
  assert.equal(item.remarks, 'bought 2 more');
  assert.equal(item.quantity, 4);
  assert.equal(item.updated_by, 'sheet');
  assert.equal(sheetRow('Pillow')![col('updated_by')], 'sheet');
});

test('an unpushed app edit wins over a hand edit and is counted as a conflict', async () => {
  await syncNow('test');
  const item = db.listItems('all').find((i) => i.type === 'Pillow')!;
  db.updateItem(db.buildItem({ remarks: 'app says', updated_by: 'phone' }, item));
  const rowIdx = mock.grid().findIndex((r) => r[1] === 'Pillow');
  mock.cell(rowIdx, col('Remarks'), 'sheet says');

  const r = await syncNow('test');
  assert.equal(r.pushed, 1);
  assert.equal(r.conflicts, 1);
  assert.equal(sheetRow('Pillow')![col('Remarks')], 'app says');
  assert.equal(db.getItem(item.id)!.remarks, 'app says');
});

test('a column added by hand in the sheet survives a push', async () => {
  await syncNow('test');
  const g = mock.grid();
  const extra = g[0]!.length;
  mock.cell(0, extra, 'HandNotes');
  const rowIdx = g.findIndex((r) => r[1] === 'Pillow');
  mock.cell(rowIdx, extra, 'keep me');

  const item = db.listItems('all').find((i) => i.type === 'Pillow')!;
  db.updateItem(db.buildItem({ quantity: 9 }, item));
  const r = await syncNow('test');
  assert.equal(r.pushed, 1);
  const row = sheetRow('Pillow')!;
  assert.equal(row[col('Quantity')], '9');
  assert.equal(row[extra], 'keep me');
});

test('a row deleted by hand retires the item locally and never re-adds it', async () => {
  await syncNow('test');
  mock.deleteRow(mock.grid().findIndex((r) => r[1] === 'Carry on'));

  const r = await syncNow('test');
  assert.equal(r.retired, 1);
  const item = db.listItems('all').find((i) => i.type === 'Carry on')!;
  assert.equal(item.status, 'retired');
  assert.equal(item.updated_by, 'sheet-deleted');
  const again = await syncNow('test');
  assert.equal(again.appended, 0);
  assert.equal(mock.grid().length, 2);
});

test('a row added by hand without an id is imported and given one', async () => {
  await syncNow('test');
  mock.set([...mock.grid(), ['Clothing', 'Jacket', 'Blue', '', '', '', '1', '', 'mom, winter']]);

  const r = await syncNow('test');
  assert.equal(r.backfilled, 1);
  const item = db.listItems('all').find((i) => i.type === 'Jacket')!;
  assert.ok(item);
  assert.equal(item.tag, 'mom, winter');
  assert.equal(sheetRow('Jacket')![col('id')], item.id);
});

test('renaming a category updates every item and the next sync pushes all of them', async () => {
  await syncNow('test');
  db.insertItem(db.buildItem({ category: 'Bedding', type: 'Quilt' }));
  await syncNow('test');

  const changed = db.renameCategory('Bedding', 'Bedroom', 'tester');
  assert.equal(changed, 2);
  assert.ok(db.listItems('all').filter((i) => i.category === 'Bedding').length === 0);

  const r = await syncNow('test');
  assert.equal(r.pushed, 2);
  const g = mock.grid();
  assert.equal(g.filter((row) => row[0] === 'Bedroom').length, 2);
  assert.equal(g.filter((row) => row[0] === 'Bedding').length, 0);
  assert.equal(sheetRow('Pillow')![col('updated_by')], 'tester');
  assert.deepEqual(db.categoryCounts().map((c) => c.category), ['Bedroom', 'Suitcase']);
});

test('tags are normalised to a comma-separated list without duplicates', () => {
  const item = db.buildItem({ category: 'T', tag: ' mom ,A,mom, b ,' });
  assert.equal(item.tag, 'mom, A, b');
  assert.equal(db.buildItem({ category: 'T', tag: '' }).tag, '');
});

test('status cell is read case-insensitively; anything but "retired" is active', async () => {
  await syncNow('test');
  const rowIdx = mock.grid().findIndex((r) => r[1] === 'Pillow');
  mock.cell(rowIdx, col('status'), 'Retired');
  await syncNow('test');
  assert.equal(db.listItems('all').find((i) => i.type === 'Pillow')!.status, 'retired');
  mock.cell(rowIdx, col('status'), 'whatever');
  await syncNow('test');
  assert.equal(db.listItems('all').find((i) => i.type === 'Pillow')!.status, 'active');
});
