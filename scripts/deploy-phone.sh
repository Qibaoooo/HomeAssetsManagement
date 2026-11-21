#!/usr/bin/env bash
# Deploy the current commit to the phone server (Termux + proot Ubuntu, see docs/RUNBOOK-phone.md).
# Run from the repo root on the laptop, AFTER the normal workflow in CLAUDE.md has passed here
# (npm run build, test on 8788, npm test for server changes). Everything must be committed.
#
#   scripts/deploy-phone.sh              push, pull on the phone, build, restart only if server/dist changed
#   scripts/deploy-phone.sh --restart    same, but always restart
#   scripts/deploy-phone.sh --no-push    skip git push (already pushed)
#
# PHONE=<ip> overrides the phone address.
set -euo pipefail
PHONE=${PHONE:-192.168.1.102}
SSH="ssh -p 8022 -o BatchMode=yes -o ConnectTimeout=10 $PHONE"
FORCE_RESTART=0; PUSH=1
for a in "$@"; do case $a in --restart) FORCE_RESTART=1;; --no-push) PUSH=0;; *) echo "unknown arg $a"; exit 2;; esac; done

cd "$(dirname "$0")/.."
if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes. Commit (or stash) first; the phone deploys the pushed commit."; exit 1
fi
[ $PUSH = 1 ] && git push
HEAD=$(git rev-parse --short HEAD)

echo "== installing control scripts"
scp -q -P 8022 scripts/phone/home-assets-ctl.sh "$PHONE:home-assets-ctl.sh"
$SSH 'chmod +x ~/home-assets-ctl.sh; mkdir -p ~/.termux/boot'
scp -q -P 8022 scripts/phone/boot.sh "$PHONE:.termux/boot/home-assets.sh"
$SSH 'chmod +x ~/.termux/boot/home-assets.sh'

echo "== pulling and building on the phone"
RESULT=$($SSH 'proot-distro login ubuntu -- bash -c "
set -e
cd /root/home-assets
before_lock=\$(git rev-parse HEAD:package-lock.json)
before_srv=\$(find server/dist -type f 2>/dev/null | sort | xargs -r md5sum | md5sum)
git pull -q --ff-only
after_lock=\$(git rev-parse HEAD:package-lock.json)
[ \"\$before_lock\" != \"\$after_lock\" ] && npm ci --no-audit --no-fund >/dev/null
npm run build >/dev/null
after_srv=\$(find server/dist -type f | sort | xargs -r md5sum | md5sum)
echo HEAD=\$(git rev-parse --short HEAD)
[ \"\$before_srv\" != \"\$after_srv\" ] && echo SERVER_CHANGED || echo SERVER_SAME
"' 2>&1 | grep -v 'proot info')
echo "$RESULT"
echo "$RESULT" | grep -q "HEAD=$HEAD" || { echo "phone is not at $HEAD; aborting"; exit 1; }

if [ $FORCE_RESTART = 1 ] || echo "$RESULT" | grep -q SERVER_CHANGED; then
  echo "== restarting server on the phone"
  $SSH '~/home-assets-ctl.sh restart'
else
  echo "== client-only change: no restart needed (client/dist is served live)"
fi

echo "== verifying"
$SSH '~/home-assets-ctl.sh status'
