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

## Server moved to the phone (live since 2026-11-21)

Prod runs on the OnePlus 9 at `http://192.168.1.102:8787` (IP bound to its MAC in the router).
See [RUNBOOK-phone.md](RUNBOOK-phone.md). Still to do:

- [ ] Disable the laptop's scheduled task so it never starts a second syncing server at logon:
      `Disable-ScheduledTask -TaskName HomeAssets` in PowerShell.
- [ ] Install Termux:Boot (F-Droid/GitHub) and open it once; set Termux battery to Unrestricted.
- [ ] Tell the household the new address (or bind `.101` to the phone later; the vacuum holds it now).
- [ ] Tap **Back up now** in Settings once and check the Drive folder updated from the phone.

If a secret ever leaks: see the table in [BACKUP.md](BACKUP.md) for how to revoke and
recreate each one.
