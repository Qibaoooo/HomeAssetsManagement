# Runbook: moving the server to a Mac

The app is one Node process. Moving it means: get the code, the service-account key and
the `data/` folder onto the Mac, build, start it at login, and stop the Windows copy.

## 0. Before you start

- Only one server should sync the sheet at a time. Two servers with two SQLite files
  will treat each other's writes as hand edits; harmless but noisy. Stop the Windows one
  at the end of this runbook (step 6).
- The `data/` folder is the only thing the sheet cannot rebuild: it holds the photos and
  the SQLite file. Copy it; do not recreate it.

## 1. Install Node 22+

```sh
brew install node@22
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zprofile && source ~/.zprofile
node -v
```

If `npm install` later complains about building `better-sqlite3` or `sharp`, install the
Xcode command line tools and retry: `xcode-select --install`. Normally prebuilt binaries
are used and no compiler is needed.

## 2. Get the code

Either reuse the GitHub SSH key from the Windows laptop (copy `~/.ssh/id_ed25519_qibaoooo`
and its `.pub` into `~/.ssh/` on the Mac, `chmod 600` the private key, and add the same
`Host github-qibaoooo` block to `~/.ssh/config`), or make a new key on the Mac and add it
to the Qibaoooo GitHub account. Then:

```sh
git clone git@github-qibaoooo:Qibaoooo/HomeAssetsManagement.git ~/home-assets
cd ~/home-assets
git config user.name Qibaoooo
git config user.email luozhengiw@gmail.com
```

## 3. Copy the private files from the Windows laptop

From Windows, these two folders (AirDrop, USB stick, or `scp` from the Mac):

| From (Windows) | To (Mac) |
| --- | --- |
| `D:\learn\home-assets\secrets\` | `~/home-assets/secrets/` |
| `D:\learn\home-assets\data\` | `~/home-assets/data/` |

`scp` example, run on the Mac while both are on the same Wi-Fi and OpenSSH Server is
enabled on Windows:

```sh
scp -r thomas.luo59@192.168.1.101:/d/learn/home-assets/secrets ~/home-assets/
scp -r thomas.luo59@192.168.1.101:/d/learn/home-assets/data ~/home-assets/
```

Stop the Windows server before copying `data/` so the SQLite file is not mid-write.
Optional: copy `.env` too if you created one.

## 4. Build and test

```sh
cd ~/home-assets
bash scripts/mac/setup.sh      # npm install + build
npm start                      # foreground test; Ctrl-C to stop
```

The first time Node listens on the port, macOS asks "Allow incoming network connections?"
Click **Allow**. If you missed it: System Settings, Network, Firewall, Options, add `node`
and allow. Then open the printed LAN address on a phone. The Mac is also reachable as
`http://<computer-name>.local:8787` on most phones, which survives IP changes.

## 5. Start at login

```sh
bash scripts/mac/install-launchd.sh
```

This writes `~/Library/LaunchAgents/com.homeassets.server.plist`, starts the server, and
restarts it if it crashes or after a reboot and login. Logs go to `data/server.log`.

Useful commands:

```sh
tail -f ~/home-assets/data/server.log
launchctl kickstart -k gui/$(id -u)/com.homeassets.server   # restart after a rebuild
bash scripts/mac/uninstall-launchd.sh                        # remove
```

After pulling code changes: `npm run build`, then the kickstart line above. Client-only
changes are served without a restart; server changes need it.

Keep the Mac awake when plugged in so the server stays reachable:

```sh
sudo pmset -c sleep 0 displaysleep 10
```

Give the Mac a DHCP reservation on the router, same as the Windows laptop had.

## 6. Retire the Windows server

In PowerShell on the laptop:

```powershell
Unregister-ScheduledTask -TaskName HomeAssets -Confirm:$false
Remove-NetFirewallRule -DisplayName HomeAssets     # admin shell, optional
```

Keep the Windows `data/` folder as a backup until the Mac has run for a while.

## Rollback

Everything is in git plus two folders. To go back to Windows: stop the Mac agent, copy
`data/` back, re-register the scheduled task.
