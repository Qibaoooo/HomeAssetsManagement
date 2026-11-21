#!/usr/bin/env bash
# Stops the server agent and removes it from login items.
set -euo pipefail
LABEL="com.homeassets.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "Agent $LABEL removed."
