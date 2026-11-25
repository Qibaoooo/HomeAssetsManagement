// Location tree and its sheet tab, against the mock Sheets API. Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, test } from 'node:test';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'home-assets-loc-test-'));
process.env.DATA_DIR = tmp;
process.env.SHEET_ID = 'mock-sheet';
process.env.SHEET_TAB = 'HomeAssets';
process.env.LOCATIONS_TAB = 'Locations';
process.env.BACKUP_INTERVAL_HOURS = '0';

const { startMockSheets } = await import('./mock-sheets.js');
const HEADERS = ['Category', 'Type', 'Design', 'Brand', 'Location', 'Size', 'Quantity', 'Remarks', 'Tag'];
const ROWS = [
  ['Bedding', 'Pillow', '', '', 'MasterBR', '', '2', '', ''],
  ['Clothing', 'Scarf', '', '', 'MasterBR right-top shelf', '', '1', '', ''],
  ['Suitcase', 'Carry on', '', '', 'StorageRoom', '', '1', '', ''],
  ['Shoes', 'Boots', '', '', '', '', '1', '', ''],
];
const mock = await startMockSheets({ tab: 'HomeAssets', rows: [HEADERS, ...ROWS] });
process.env.SHEETS_API_URL = mock.url;

const { syncNow } = await import('../src/sync.js');
const db = await import('../src/db.js');
const loc = await import('../src/locations.js');

const col = (name: string) => mock.grid()[0]!.findIndex((h) => h.toLowerCase() === name.toLowerCase());
const locOf = (type: string) => mock.grid().find((r) => r[1] === type)![col('Location')];
const tabPaths = () => (mock.tab('Locations') ?? []).slice(1).map((r) => r[0]);

beforeEach(() => {
  db.db.exec('DELETE FROM items; DELETE FROM meta; DELETE FROM sync_log; DELETE FROM locations;');
  mock.set([HEADERS, ...ROWS]);
  mock.dropTab('Locations');
});
after(async () => {
  await mock.close();
  db.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('first sync seeds the list from item locations and creates the tab', async () => {
  const r = await syncNow('test');
  assert.equal(r.ok, true);
  assert.deepEqual(loc.listPaths(), ['MasterBR', 'MasterBR right-top shelf', 'StorageRoom']);
  assert.deepEqual(mock.tab('Locations')![0], ['Location']);
  assert.deepEqual(tabPaths(), ['MasterBR', 'MasterBR right-top shelf', 'StorageRoom']);
  assert.deepEqual(loc.locationUsage().unlisted, []);
});

test('moving a node under a new parent rewrites its items and adds the missing parents', async () => {
  await syncNow('test');
  const changed = loc.renamePath('MasterBR right-top shelf', 'MasterBR > Right shelf > Top', 'tester');
  assert.equal(changed, 1);
  assert.deepEqual(loc.listPaths(), ['MasterBR', 'MasterBR > Right shelf', 'MasterBR > Right shelf > Top', 'StorageRoom']);

  const r = await syncNow('test');
  assert.equal(r.pushed, 1);
  assert.equal(locOf('Scarf'), 'MasterBR > Right shelf > Top');
  assert.equal(mock.grid().find((x) => x[1] === 'Scarf')![col('updated_by')], 'tester');
  assert.deepEqual(tabPaths(), loc.listPaths());
});

test('renaming a parent carries every sub-location and item with it, in place', async () => {
  await syncNow('test');
  loc.renamePath('MasterBR right-top shelf', 'MasterBR > Right shelf > Top', 't');
  const changed = loc.renamePath('MasterBR', 'Master Bedroom', 't');
  assert.equal(changed, 2);
  assert.deepEqual(loc.listPaths(), [
    'Master Bedroom',
    'Master Bedroom > Right shelf',
    'Master Bedroom > Right shelf > Top',
    'StorageRoom',
  ]);
  await syncNow('test');
  assert.equal(locOf('Pillow'), 'Master Bedroom');
  assert.equal(locOf('Scarf'), 'Master Bedroom > Right shelf > Top');
});

test('a node cannot move inside itself or past the depth limit', async () => {
  await syncNow('test');
  assert.throws(() => loc.renamePath('MasterBR', 'MasterBR > Inside', 't'), /inside itself/);
  assert.throws(() => loc.addPath('A > B > C > D > E'), /at most 4 levels/);
  loc.addPath('A > B > C');
  loc.addPath('X > Y');
  assert.throws(() => loc.renamePath('X', 'A > B > C > X', 't'), /deeper than 4/);
});

test('deleting a used location requires a target and moves its items there', async () => {
  await syncNow('test');
  assert.throws(() => loc.deletePath('StorageRoom', null, 't'), /choose where they go/);
  const changed = loc.deletePath('StorageRoom', 'MasterBR', 't');
  assert.equal(changed, 1);
  assert.ok(!loc.hasPath('StorageRoom'));
  await syncNow('test');
  assert.equal(locOf('Carry on'), 'MasterBR');
  assert.deepEqual(tabPaths(), ['MasterBR', 'MasterBR right-top shelf']);

  loc.deletePath('MasterBR right-top shelf', '', 't');
  await syncNow('test');
  assert.equal(locOf('Scarf') ?? '', '');
});

test('a hand edit of the location tab is adopted and normalised', async () => {
  await syncNow('test');
  mock.setTab('Locations', [['Location'], ['MasterBR'], ['Garage>Shelf 1'], ['StorageRoom']]);
  await syncNow('test');
  assert.deepEqual(loc.listPaths(), ['MasterBR', 'Garage', 'Garage > Shelf 1', 'StorageRoom']);
  // the typed path was normalised and its parent added, then written back
  assert.deepEqual(tabPaths(), ['MasterBR', 'Garage', 'Garage > Shelf 1', 'StorageRoom']);
  // the dropped node's item is now reported as unlisted, not rewritten
  assert.deepEqual(loc.locationUsage().unlisted.map((u) => u.location), ['MasterBR right-top shelf']);
  assert.equal(locOf('Scarf'), 'MasterBR right-top shelf');
});

test('an unlisted location typed in the sheet is kept and can be mapped onto a node', async () => {
  await syncNow('test');
  const idx = mock.grid().findIndex((r) => r[1] === 'Boots');
  mock.cell(idx, col('Location'), 'shoe cabinet');
  await syncNow('test');
  assert.deepEqual(loc.locationUsage().unlisted, [{ location: 'shoe cabinet', active: 1, retired: 0 }]);

  loc.addPath('Hallway > Shoe cabinet');
  const changed = loc.renamePath('shoe cabinet', 'Hallway > Shoe cabinet', 't');
  assert.equal(changed, 1);
  await syncNow('test');
  assert.equal(locOf('Boots'), 'Hallway > Shoe cabinet');
  assert.deepEqual(loc.locationUsage().unlisted, []);
});

test('reorder swaps siblings and the tab follows', async () => {
  await syncNow('test');
  loc.reorderPath('StorageRoom', 'up');
  assert.deepEqual(loc.listPaths(), ['MasterBR', 'StorageRoom', 'MasterBR right-top shelf']);
  loc.reorderPath('MasterBR', 'up'); // already first: no change
  assert.deepEqual(loc.listPaths(), ['MasterBR', 'StorageRoom', 'MasterBR right-top shelf']);
  await syncNow('test');
  assert.deepEqual(tabPaths(), loc.listPaths());
});

test('usage counts items in a node and in its whole subtree', async () => {
  await syncNow('test');
  loc.renamePath('MasterBR right-top shelf', 'MasterBR > Right shelf > Top', 't');
  const node = loc.locationUsage().nodes.find((n) => n.path === 'MasterBR')!;
  assert.equal(node.active, 1);
  assert.equal(node.subtreeActive, 2);
  assert.equal(node.depth, 0);
  assert.equal(node.name, 'MasterBR');
});
