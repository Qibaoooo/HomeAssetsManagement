# Google Drive backup

The server backs up `data/` (the SQLite database and all photos) into a folder called
**HomeAssets Backup** in your own Google Drive. The sheet already holds the rows; this covers
the photos and gives a point-in-time copy of the database.

- Runs every hour, 90 seconds after the server starts if a backup is overdue, and about five
  minutes after the last edit. Each run first fingerprints the data locally and uploads nothing
  when nothing changed, so hourly costs a couple of metadata calls.
- **Back up now** in Settings triggers it from a phone. `npm run backup` does the same from a shell.
- The database file is updated in place; Drive keeps earlier revisions for 30 days, so an
  accidental bad write can be rolled back from Drive's "Manage versions". Photos are only added
  or replaced, never deleted remotely.
- Cost: none. The Drive API is free, and the data is a few hundred KB plus your photos.

## One-time setup

Service accounts cannot store files in a personal Drive, so backups use **your** Google login
through OAuth. This needs an OAuth client in the same Cloud project as the sheet key.

1. Cloud Console, project `homeassetmanagement`: **APIs & Services → Library**, enable
   **Google Drive API**.
2. **Google Auth Platform** (the renamed OAuth consent screen):
   - **Branding**: app name "Home Assets", your email as support and developer contact.
   - **Data access**: add the scope `https://www.googleapis.com/auth/drive.file`.
   - **Audience**: External, add `luozhengiw@gmail.com` as a test user, then set the
     publishing status to **In production**. The `drive.file` scope is non-sensitive, so no
     verification is needed; Google shows an "unverified app" screen once during login,
     click Advanced → continue. Leaving the app in *Testing* status makes the login expire
     every 7 days.
3. **Clients → Create client**, application type **Desktop app**, any name. Download the JSON
   from the client's row and save it as `secrets/oauth-client.json`.
4. On the server machine:

   ```sh
   npm run drive-auth
   ```

   Open the printed URL, sign in as luozhengiw@gmail.com, allow. The script saves
   `secrets/drive-token.json`. Restart the server; Settings now shows the backup card.
5. First run: `npm run backup`, or tap **Back up now** in Settings. Check the folder in Drive.

## Restore (or move to a new machine)

With the server stopped and the two secret files in place:

```sh
npm run restore            # refuses if data/home-assets.sqlite already exists
npm run restore -- --force # overwrite
```

This downloads the database and every photo. It is also the easiest way to move to the Mac:
clone the repo, copy `secrets/`, run `npm run restore`, start the server.

## Credentials: what they are and how to carry them

Everything secret lives in `secrets/`, which git ignores. **Never commit any of these; the
GitHub repo is public.**

| File | What it is | If it leaks |
| --- | --- | --- |
| `secrets/service-account.json` | Key that lets the server edit the sheet | Delete the key in Cloud Console → Service accounts → Keys, create a new one |
| `secrets/oauth-client.json` | Identifies the app to Google; useless without a login | Low risk, but can be deleted and recreated in Credentials |
| `secrets/drive-token.json` | Refresh token granting Drive access to files the app created | Revoke at https://myaccount.google.com/permissions, run `drive-auth` again |

Moving them to the Mac, pick one:

- AirDrop or a USB stick, folder to folder. Simplest.
- A password manager that holds attachments or secure notes (1Password, Bitwarden). Good
  long-term home; paste the file contents back on the new machine.
- Google Drive is acceptable for a personal project only if the files are inside an encrypted
  archive: `7z a -p secrets.7z secrets/` (Windows) or `zip -er secrets.zip secrets/` (Mac).
  Do not put the raw JSON in Drive, email, or chat.

GitHub Secrets are for CI pipelines, not for a server you run at home; nothing here needs them.

`drive-token.json` is optional to carry: with only `oauth-client.json` present, run
`npm run drive-auth` on the new machine and sign in again.
