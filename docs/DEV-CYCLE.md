# Dev cycle: code on the laptop, production on the phone

Production is the OnePlus 9 at `http://192.168.1.102:8787` (see [RUNBOOK-phone.md](RUNBOOK-phone.md)).
The laptop holds the repo and never runs production: its `data/` folder is a stale snapshot,
and the `HomeAssets` scheduled task stays disabled. Code is never edited on the phone.

## The loop

1. **Develop.** `npm run dev` starts the server from source with `.env.test` (port 8788,
   `data-test/`, sheet sync off, Drive backup off) and Vite on http://localhost:5173 proxying
   `/api` and `/photos` to it. Nothing it does can reach the sheet, Drive, or the phone.
   Vite is on the LAN too, so a phone can open `http://192.168.1.104:5173` to try the UI.
2. **Realistic data.** `npm run test:seed` takes a consistent snapshot of the phone's live
   database (SQLite backup API, safe while the phone serves) plus its photos into `data-test/`.
   Stop the test instance first. `-- --local` seeds from the laptop's own `data/` instead.
3. **Build and check the built app.** `npm run build`, then `npm run start:test` on
   http://localhost:8788 with the same `.env.test`. Type-check clean, API calls verified, UI
   checked at phone width. Server changes: `npm test` must pass (mock Sheets API, throwaway data).
4. **Deploy.** Commit, then:

   ```sh
   scripts/deploy-phone.sh
   ```

   It refuses on a dirty tree, pushes, pulls that commit on the phone, runs `npm ci` only when
   the lockfile changed, builds there, and restarts the server only if `server/dist` changed.
   Client-only changes deploy with no restart. About 30 seconds; a restart adds 15 to 20
   seconds of downtime. It ends with `status` from the phone: the live item count.
   `--restart` forces a restart, `--no-push` skips the push.
5. **Verify.** The script's status line, then the app on a phone after a server change.

## Rollback

```sh
git revert <bad commit>
scripts/deploy-phone.sh
```

Emergency pin without a revert, on the phone: `proot-distro login ubuntu`, then
`cd /root/home-assets && git checkout <sha> && npm run build`, then on the Termux side
`~/home-assets-ctl.sh restart`. Return to `main` afterwards or the next deploy's pull fails.

## Trade-offs to know

- A UI tweak now costs a commit and a 30-second deploy; before, `npm run build` was live
  at once. The commit requirement is deliberate: the phone always runs a known revision.
- A lockfile change means `npm ci` on the phone, a few minutes.
- `npm run dev` and the phone can run at the same time; only one of them syncs the sheet, and
  that is the phone.

## Where things are

| | Laptop | Phone |
| --- | --- | --- |
| Code | `D:\learn\home-assets` | `/root/home-assets` inside Ubuntu |
| Data | `data-test/` (seeded), `data/` (stale) | `/root/home-assets/data` |
| Secrets | `secrets/` | `/root/home-assets/secrets` |
| Server log | terminal | `~/home-assets-server.log` (Termux side) |
| Control | npm scripts | `~/home-assets-ctl.sh` (Termux side) |
