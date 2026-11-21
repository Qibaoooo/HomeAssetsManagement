# TODO

## Google Drive backup: one-time setup (blocked on you)

Cloud Console, project `homeassetmanagement`:

- [ ] APIs & Services → Library → enable **Google Drive API**
- [ ] OAuth consent screen: External, app name "Home Assets", scope `.../auth/drive.file`,
      test user `luozhengiw@gmail.com`, then **Publishing status → In production**
      (Testing status expires the login every 7 days)
- [ ] Credentials → Create credentials → OAuth client ID → **Desktop app** → download JSON
      → save as `secrets/oauth-client.json`
- [ ] In the repo: `npm run drive-auth`, open the printed URL, sign in as luozhengiw@gmail.com, allow
- [ ] Restart the server, then **Back up now** in Settings (or `npm run backup`)
- [ ] Check the "HomeAssets Backup" folder appears in Drive with `home-assets.sqlite` and `photos/`

Full details: [BACKUP.md](BACKUP.md).

## Credentials to keep safe (never commit; repo is public)

- `secrets/service-account.json` (sheet access)
- `secrets/oauth-client.json` (Drive app identity)
- `secrets/drive-token.json` (Drive login; optional to carry, can re-auth instead)

Store copies in a password manager or carry by AirDrop/USB when moving to the Mac.
See the credentials table in [BACKUP.md](BACKUP.md) for what to do if one leaks.

## Later

- [ ] Run `scripts/install-task.ps1` (logon task) and `scripts/firewall.ps1` (admin) on the Windows laptop,
      or follow [RUNBOOK-mac.md](RUNBOOK-mac.md) when moving to the Mac
- [ ] Consider making the GitHub repo private (Sprout Lands assets are non-redistributable)
- [ ] Tailscale for access outside home (phase 2)
