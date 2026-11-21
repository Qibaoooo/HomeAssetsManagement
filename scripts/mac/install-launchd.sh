#!/usr/bin/env bash
# Registers a launchd agent so the server starts at login and restarts if it dies.
# Usage (from the repo root):  bash scripts/mac/install-launchd.sh
# Logs: data/server.log      Remove: bash scripts/mac/uninstall-launchd.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO="$(pwd)"
LABEL="com.homeassets.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"

[ -f server/dist/index.js ] || { echo "server/dist missing; run bash scripts/mac/setup.sh first" >&2; exit 1; }
mkdir -p data "$HOME/Library/LaunchAgents"

# Unload a previous version quietly.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$REPO/server/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$REPO/data/server.log</string>
  <key>StandardErrorPath</key><string>$REPO/data/server.log</string>
</dict>
</plist>
EOF

launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"
sleep 2
if launchctl print "gui/$(id -u)/$LABEL" | grep -q 'state = running'; then
  echo "Agent $LABEL is running. Log: $REPO/data/server.log"
else
  echo "Agent registered but not running yet; check $REPO/data/server.log" >&2
fi
echo "LAN address: http://$(ipconfig getifaddr en0 2>/dev/null || echo '<ip>'):8787"
