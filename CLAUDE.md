# Working rules for this repo

## Port 8787 is production. Do not restart it casually.

The household uses `http://192.168.1.101:8787` from their phones all day. Every restart is
visible downtime, and a bad build means a broken app for everyone.

Workflow for any server or client change:

1. Build: `npm run build`.
2. Test on the **test instance**, never on 8787:
   `npm run start:test` → http://localhost:8788
   It uses `.env.test`: its own `data-test/` folder, Google Sheet sync **off**, Drive backup
   **off**. Nothing it does can reach the sheet, Drive, or prod data.
   `npm run test:seed` copies the prod database and photos into `data-test/` for realistic data.
3. Only when the test instance works (type-check clean, API calls verified, UI checked at phone
   width), restart prod: stop the process on 8787 and start it again with `npm start`.
   Client-only changes need **no restart**: the built `client/dist` is served live.
4. Verify prod answers right after the restart (`curl localhost:8787/api/items`).

Never run two instances against the same `data/` folder or with sheet sync on at the same time.

## Automated tests: required for backend or database changes

`npm test` runs the sync engine and data layer against an in-memory mock of the Google Sheets
API (`server/test/mock-sheets.ts`), in a throwaway data folder. It never touches the real sheet.

- Run it after any change under `server/src` (sync, sheets, db, routes, backup, types).
  It must pass before the prod restart in the workflow above.
- Add a test when fixing a sync or data bug, so the bug stays fixed.
- Pure UI changes under `client/` do not need it; a type-check and a look at the test
  instance are enough.
- `npm run mock:sheets` starts the mock on port 8790 for manual testing with sync on:
  `SHEETS_API_URL=http://127.0.0.1:8790/ SHEET_SYNC=on npm run start:test`.

## Other rules

- Secrets live in `secrets/` and are git-ignored. Never commit them, never print their contents.
- The GitHub repo is public. Keep the Sprout Lands assets usage non-commercial (see README).
- Sheet column headers are the source of field names; app labels match them exactly.
- Scope and decisions: `docs/SCOPE.md`. User-facing quirks: `docs/USAGE.md`. Backup: `docs/BACKUP.md`.
- Pending items for the user: `docs/TODO.md`.
