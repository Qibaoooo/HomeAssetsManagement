# Scope and decisions (agreed 2026-11-21)

## In scope (v1)
- Only the `HomeAssets` tab of the sheet. Budget tabs (2020–2023) are out of scope.
- Mobile-first UI: browse grouped by category/location, search and filter,
  add/edit with cover photo, quick quantity adjust, retire.
- Hosted on the home laptop, reached over LAN (`http://192.168.1.101:<port>`).
  Tailscale is phase 2 for outside access and HTTPS.

## Stack
- Front end: Vue 3 + Vite + TypeScript + Pinia + Vue Router + Vuetify 3.
- Back end: Node 22 + Fastify + better-sqlite3, serving the built SPA on one port.
- Google Sheets via `googleapis` with a **service account** (sheet shared with
  the service account email; JSON key kept in `secrets/`, git-ignored).

## Data model
Sheet columns today: Category, Type, Design, Brand, Location, Size, Quantity,
Remarks, Tag.

Columns to add to the sheet (hidden where sensible):
- `id` (UUID) and `updated_at` (ISO timestamp) for reliable sync.
- `status` (`active` | `retired`). Retire is the normal "remove" action.
- `purchase_date`, `price` — nullable, not tracked for every item.
- `photo` — not in the sheet. Cover photo file lives on laptop disk, path in SQLite.

Kept as-is:
- `Tag` stays a single free-text column (sets A/B/C and owners mom/maomao mixed).
- `Size` kept in the sheet and the form.

## Sync
- SQLite is what the app reads and writes.
- Every app write goes through to the sheet immediately (write-through).
- Hand edits in the sheet still happen occasionally, so: periodic pull
  (every ~5 min) plus a manual Sync button. Conflicts resolve by
  last-write-wins on `updated_at`.
- Rows are matched by `id`; existing rows get backfilled once.

## Users
- No login. Each device picks a display name once; it is stamped on edits.
- Laptop is always on; no power-plan changes needed.

## Out of scope (v1)
- Budget tabs, login/auth, offline mode, photo gallery per item, photo backup.
