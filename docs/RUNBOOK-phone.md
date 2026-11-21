# Runbook: the server on the OnePlus 9 (Termux + proot Ubuntu)

The app runs as one Node process inside an Ubuntu container on the phone. Termux provides
SSH and the boot hook; proot-distro provides Ubuntu; nothing needs root.

| What | Where |
| --- | --- |
| Phone on the LAN | `192.168.1.102` (give it a DHCP reservation in the router) |
| SSH into Termux | `ssh -p 8022 192.168.1.102` (laptop key is installed, no password) |
| Into Ubuntu | `proot-distro login ubuntu` |
| App, data, secrets | `/root/home-assets` inside Ubuntu (`data/` and `secrets/` as on the laptop) |
| Control script | `~/home-assets-ctl.sh start|stop|restart|status|logs` on the Termux side |
| Server log | `~/home-assets-server.log` on the Termux side |
| Boot hook | `~/.termux/boot/home-assets.sh`, run by the Termux:Boot app |

Node under proot starts in about 15 seconds; the control script waits for the port.

## Day to day: develop on the laptop, deploy to the phone

Code changes are never made on the phone. The rules in `CLAUDE.md` still apply on the laptop:
build, run the test instance on 8788, `npm test` for server changes. Then:

```sh
git commit -am "..."
scripts/deploy-phone.sh
```

The script pushes, pulls the commit on the phone, runs `npm ci` only if the lockfile changed,
builds, and restarts the server only if `server/dist` changed (client-only changes are served
live, as on the laptop). It ends with `status`, which prints the item count from the running
server. `--restart` forces a restart, `--no-push` skips the push.

Deploying takes about a minute. The restart itself is 15 to 20 seconds of downtime.

## Checking on it

```sh
ssh -p 8022 192.168.1.102 '~/home-assets-ctl.sh status'
ssh -p 8022 192.168.1.102 '~/home-assets-ctl.sh logs 100'
curl http://192.168.1.102:8787/api/items
```

## Cut-over from the laptop (one time)

Only one server may sync the sheet at a time, and `data/` on the phone is a snapshot taken on
2026-11-21 during setup. Repeat the copy right before switching:

1. Stop the laptop server (the scheduled task `HomeAssets`, or the `npm start` window).
2. Copy fresh data to the phone, from the repo root on the laptop:
   ```sh
   scp -P 8022 data/home-assets.sqlite 192.168.1.102:xfer/
   scp -P 8022 -r data/photos 192.168.1.102:xfer/
   ssh -p 8022 192.168.1.102 'proot-distro login ubuntu -- bash -c "cd /root/home-assets && rm -rf data && mkdir -p data && cp /data/data/com.termux/files/home/xfer/home-assets.sqlite data/ && cp -r /data/data/com.termux/files/home/xfer/photos data/"'
   ```
   (With the laptop server stopped the WAL is checkpointed, so the single `.sqlite` file is
   complete. Alternative: `npm run restore` inside Ubuntu pulls the last Drive backup instead.)
3. Start prod on the phone: `ssh -p 8022 192.168.1.102 '~/home-assets-ctl.sh start'`.
   No env file means production defaults: port 8787, sheet sync on, Drive backup hourly.
4. Verify: `curl http://192.168.1.102:8787/api/items`, open the app on a phone, edit an item,
   check the sheet row updates, tap **Back up now** in Settings and check Drive.
5. Tell the household the new address, or move the `.101` reservation to the phone.
6. Do not start the laptop server again while the phone is live.

## Phone settings that matter

- Keep the phone plugged in. Termux holds a wake lock (`termux-wake-lock`) so Android does
  not freeze it.
- Settings → Apps → Termux → Battery: **Unrestricted**. OnePlus kills background apps
  aggressively otherwise.
- Wi-Fi: keep on during sleep; give the phone a DHCP reservation so the IP never changes.
- Termux:Boot must be installed from the same source as Termux (F-Droid or GitHub) and
  **opened once**, or the boot hook never runs.

## Google credentials

The same three files from `secrets/` work unchanged on the phone: the service-account key is
a plain JSON key, and `drive-token.json` is a refresh token tied to the Google account, not to
a machine. They were copied over SSH during setup. See `docs/BACKUP.md` for what each one is
and how to revoke it.

## If something breaks

- Server not answering: `~/home-assets-ctl.sh status`, then `logs`. `restart` if the process
  is gone.
- Phone rebooted and nothing came back: open Termux once (sshd and the wake lock start from
  the boot hook; if Termux:Boot was never opened, run `~/.termux/boot/home-assets.sh` by hand).
- Need a shell on the phone without Wi-Fi: open Termux on the phone itself.
- Reinstall from scratch: install Termux, `pkg install openssh proot-distro`, `passwd`, `sshd`,
  `ssh-copy-id -p 8022 <ip>` from the laptop, `proot-distro install ubuntu`, then inside
  Ubuntu: Node 22 from NodeSource, `git clone https://github.com/Qibaoooo/HomeAssetsManagement.git /root/home-assets`,
  copy `secrets/` and `data/`, `npm ci && npm run build`. Then `scripts/deploy-phone.sh --no-push`
  from the laptop installs the control and boot scripts.
