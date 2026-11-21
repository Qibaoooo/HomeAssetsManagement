#!/usr/bin/env bash
# One-time setup on a Mac: checks Node, installs dependencies, builds client and server.
# Usage (from the repo root):  bash scripts/mac/setup.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node is not installed. Install it first, e.g.:  brew install node@22" >&2
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 22 ]; then
  echo "Node 22+ required, found $(node -v)." >&2
  exit 1
fi
echo "Node $(node -v) ok"

if [ ! -f secrets/service-account.json ]; then
  echo "Missing secrets/service-account.json. Copy it from the old machine before starting the server." >&2
fi

npm install
npm run build

echo
echo "Build complete. Start manually with:  npm start"
echo "LAN address: http://$(ipconfig getifaddr en0 2>/dev/null || echo '<ip>'):8787"
echo "Also reachable as:  http://$(scutil --get LocalHostName 2>/dev/null || hostname).local:8787"
echo "To start at login:  bash scripts/mac/install-launchd.sh"
