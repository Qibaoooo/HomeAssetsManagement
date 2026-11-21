# Usage guide and quirks

## Everyday use

- **New category, brand, location, tag:** just type it in the form. Those fields are free
  text with suggestions. A category appears as a filter chip once one item has it. Spelling
  matters: `Kitchen` and `kitchen` become two categories, so pick the suggestion when one exists.
- **Remove an item:** use *Retire*. It stays in the sheet with `status = retired` and is hidden
  in the app unless *Show retired* is on in Settings. There is no hard delete in the app.
- **Who edited what:** set *Your name* in Settings once per phone. It is written to `updated_by`.
- **Pending changes:** if the laptop cannot reach Google, saves still succeed locally and show a
  cloud icon in the list. They are pushed on the next successful sync (every minute, or
  *Sync now* in Settings).

## Editing the sheet by hand

Safe:
- Change any value in an existing row. It is picked up within a minute and stamped
  `updated_by = sheet`.
- Add a row at the bottom. Leave `id`, `updated_at`, `status` empty; the sync fills them in.
- Sort, filter, freeze, colour cells, reorder columns. Rows are matched by `id`, columns by
  header name.
- Add a new column with a new header. The app ignores it but never overwrites it.
- Delete a row. The item becomes *retired* in the app. It is not re-added.

Not safe:
- Editing or copying the `id` cell. A duplicated id is ignored with a warning in the sync log;
  clear the id on the copy and it gets a fresh one.
- Renaming an existing header (for example `Remarks` to `Notes`). The sync sees a missing
  column and appends a new empty `Remarks`. Rename the field in code instead.
- Formulas inside data rows. The app writes plain values back and the formula is lost.
- Changing a row in the sheet and in the app within the same one-minute window. The app edit
  wins and the sync log records a conflict.
- Applying a date format to `purchase_date`. Keep it plain text `YYYY-MM-DD`.
- Prices with a thousands comma: `1,250` is read as `1250`, which is fine, but `12,50` is
  read as `1250`. Use a dot for decimals.

Values: `status` counts as retired only when the cell says `retired` (any case); anything
else is active. Non-numeric `Quantity` or `price` is read as blank.

## Adding a column the app should understand

A hand-added column is stored but invisible to the app. To make the app read, write and
show a new field (say `warranty_until`):

1. `server/src/types.ts`: add it to `SheetFields` and to `SHEET_COLUMNS` (header text and
   field name). The header is appended to the sheet automatically on the next sync.
2. `server/src/db.ts`: add the column to the `CREATE TABLE`, the `ALTER TABLE` migration
   block, `ITEM_COLS`, the insert and update statements, and `buildItem`.
3. `server/src/sync.ts`: add it to `parseRow`, `toSheetFields` and, if users may edit it by
   hand, `CONTENT_FIELDS` so hand edits are detected.
4. `client/src/types.ts` and `client/src/views/ItemFormView.vue`: add the field and an input.
   Optionally show it in `ItemsView.vue`.
5. `npm run build`, restart the server. Existing rows get an empty cell; old SQLite files
   migrate on start.

## Operations

- Everything lives in `data/`: `home-assets.sqlite` and `photos/`. Back that folder up if the
  photos matter. The sheet alone can rebuild the rows, not the photos.
- Deleting `data/` and restarting rebuilds the database from the sheet. Photos are gone.
- Server log when run as the scheduled task: `data/server.log`. Sync log is also in the app
  under Settings.
- Change port, sheet id or sync interval in `.env` (see `.env.example`), then restart.
- If the service account key is rotated, replace `secrets/service-account.json` and restart.
- Moving the inventory to a different tab: set `SHEET_TAB` in `.env`. The tab must have the
  headers in row 1.
