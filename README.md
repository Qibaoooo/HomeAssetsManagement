# home-assets

Mobile-first web app for managing the household inventory kept in the
`HomeAssets` tab of our Google Sheet. The sheet stays the source of truth;
a local SQLite database on the home laptop is the operational store and
holds photos.

See [docs/SCOPE.md](docs/SCOPE.md) for the agreed scope and decisions.

UI art is the free **Sprout Lands UI Pack** by Cup Nooble (pixel font, panels, buttons,
icons). Its licence is non-commercial and forbids redistribution of the assets, so this
repo must stay a private, personal project. See `client/src/assets/sprout/LICENSE-sprout-lands.txt`.
Sprites are sliced from the raw sheets by `python scripts/slice-sprout.py`.

## Layout

```
client/   Vue 3 + Vite + Vuetify 3 single-page app (mobile first)
server/   Fastify API + SQLite (better-sqlite3) + Google Sheets sync, serves client/dist
scripts/  Windows helpers: scheduled task at logon, firewall rule
data/     SQLite db + photos (git-ignored, created on first run)
secrets/  service-account.json (git-ignored)
```

## One-time setup

1. Node 22+. Then `npm install` at the repo root (installs both workspaces).
2. Put the Google service account key at `secrets/service-account.json` and share
   the sheet with its `client_email` as **Editor**.
3. Optional: copy `.env.example` to `.env` to change port, sheet id, sync interval.

## Run

```sh
npm run build        # builds client/dist and server/dist
npm start            # http://<laptop-ip>:8787  (LAN)
```

Development, with hot reload (API on 8787, UI on 5173, both exposed on the LAN):

```sh
npm run dev
```

One-off sync from the command line: `npm run sync`.

## Run at logon (Windows)

```powershell
.\scripts\install-task.ps1      # normal shell: scheduled task "HomeAssets", log in data\server.log
.\scripts\firewall.ps1          # admin shell: allow inbound 8787 from the local subnet
```

Give the laptop a DHCP reservation on the router so its address stays fixed, then
open `http://192.168.1.101:8787` on a phone and add it to the home screen.

## Backup to Google Drive

Hourly backup of the database and photos into your Drive, with **Back up now** in Settings
and `npm run restore` to rebuild `data/` on a new machine. One-time OAuth setup and the
handling of the secret files are in [docs/BACKUP.md](docs/BACKUP.md).

## Run on a Mac

See [docs/RUNBOOK-mac.md](docs/RUNBOOK-mac.md). Short version: `bash scripts/mac/setup.sh`,
copy `secrets/` and `data/` over, then `bash scripts/mac/install-launchd.sh`.

## How sync works

- The app reads and writes SQLite. Every write is pushed to the sheet immediately.
- Every minute (and on **Sync now** in Settings) the sheet is pulled. Rows are
  matched by the hidden `id` column. Hand edits in the sheet win when the local row
  is clean; an unpushed app edit wins over a hand edit and the overlap is logged.
- A row deleted by hand in the sheet is marked *retired* locally, never re-added.
- A row added by hand in the sheet gets an `id` and `updated_at` on the next sync.
- Photos never go to the sheet. They live in `data/photos` as resized webp files.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/items?status=active\|retired\|all` | list |
| GET | `/api/items/:id` | one item |
| POST | `/api/items` | create (write-through) |
| PUT | `/api/items/:id` | update (write-through) |
| POST | `/api/items/:id/status` | `{status: "active"\|"retired"}` |
| POST | `/api/items/:id/photo` | multipart field `photo` |
| DELETE | `/api/items/:id/photo` | remove cover photo |
| GET | `/api/meta` | distinct categories, brands, locations, tags |
| GET | `/api/sync/status` | last result, pending count, log |
| POST | `/api/sync` | run a sync now |
