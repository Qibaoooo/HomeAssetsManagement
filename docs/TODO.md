# TODO

Google Drive backup is set up and running (OAuth client created, app published, login done,
first backup verified on 2026-11-21). What remains is housekeeping for the secret files.

## Credentials to keep safe (never commit; the repo is public)

| File | What it is | Keep a copy? |
| --- | --- | --- |
| `secrets/service-account.json` | Sheet access for the server | Yes |
| `secrets/oauth-client.json` | Identifies the app to Google for Drive | Yes |
| `secrets/drive-token.json` | Your Drive login for the app | Optional; `npm run drive-auth` can recreate it |

- [ ] Store copies of the three files in a password manager (secure note or attachment),
      or in a password-protected archive, so a dead laptop doesn't lose them.
      Not in Drive, email or chat as plain JSON.

## When moving the server to the Mac

- [ ] Stop the Windows server first (so the database isn't mid-write).
- [ ] Copy `secrets/` to the Mac by AirDrop or USB (or from the password manager).
- [ ] Rebuild `data/` on the Mac from the Drive backup: `npm run restore`
      (or copy the Windows `data/` folder if you prefer the exact current state).
- [ ] Follow [RUNBOOK-mac.md](RUNBOOK-mac.md) for Node, clone, build and the login agent.
- [ ] Decommission the Windows side once the Mac has run a day:
      `Unregister-ScheduledTask -TaskName HomeAssets -Confirm:$false` (if it was ever installed).

If a secret ever leaks: see the table in [BACKUP.md](BACKUP.md) for how to revoke and
recreate each one.
