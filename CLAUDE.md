# Working rules for this repo

## Production is the phone. This laptop never runs prod.

The household uses `http://192.168.1.102:8787`, served by the OnePlus 9 (Termux + proot
Ubuntu, see `docs/RUNBOOK-phone.md`). Every restart there is visible downtime, and a bad build
means a broken app for everyone. Nothing on this machine may sync the sheet or back up to Drive:
the laptop's `data/` is a stale snapshot and the `HomeAssets` scheduled task stays disabled.

Workflow for any server or client change:

1. Develop: `npm run dev` runs the server from source with `.env.test` (port 8788, `data-test/`,
   sheet sync off, backup off) and Vite on 5173 proxying to it. `npm run test:seed` pulls a
   consistent snapshot of the phone's live data into `data-test/` for realistic testing.
2. Build and test the built app: `npm run build`, then `npm run start:test` (http://localhost:8788,
   same `.env.test`). Type-check clean, API calls verified, UI checked at phone width.
3. Deploy: commit, then `scripts/deploy-phone.sh`. It pushes, pulls the commit on the phone,
   builds there, and restarts only if `server/dist` changed. Client-only changes deploy with
   no restart (the built `client/dist` is served live). About 30 s plus 15 s downtime on restart.
4. The script ends with the phone's `status` (item count from the live server). Also open the
   app on a phone after a server change.
5. Rollback: `git revert <sha>`, then `scripts/deploy-phone.sh` again.

Never run two instances against the same data folder or with sheet sync on at the same time.
Never edit code on the phone.

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
- Dev loop and deploy: `docs/DEV-CYCLE.md`. Scope and decisions: `docs/SCOPE.md`. User-facing quirks: `docs/USAGE.md`. Backup: `docs/BACKUP.md`.
- Pending items for the user: `docs/TODO.md`.
