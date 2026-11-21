# TODO

## Google Drive backup: one-time setup (blocked on you)

Cloud Console, project `homeassetmanagement` (the OAuth pages are under **Google Auth Platform**):

- [ ] APIs & Services → Library → enable **Google Drive API**
- [ ] Google Auth Platform → **Branding**: app name "Home Assets", your email as support/contact
- [ ] Google Auth Platform → **Data access**: add scope `https://www.googleapis.com/auth/drive.file`
- [ ] Google Auth Platform → **Audience**: External; add test user `luozhengiw@gmail.com`;
      set publishing status **In production** (Testing status expires the login every 7 days)
- [ ] Google Auth Platform → **Clients → Create client**: type **Desktop app** → Create →
      download the JSON → save as `secrets/oauth-client.json`
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
