#!/data/data/com.termux/files/usr/bin/bash
# Control the Home Assets server on the phone. Runs on the Termux side; the server itself runs
# inside the Ubuntu proot at /root/home-assets. Installed to ~/home-assets-ctl.sh by
# scripts/deploy-phone.sh.
#
#   home-assets-ctl.sh start [env-file]   start prod (no env file) or e.g. ".env.test" (port 8788)
#   home-assets-ctl.sh stop
#   home-assets-ctl.sh restart [env-file]
#   home-assets-ctl.sh status
#   home-assets-ctl.sh logs [n]
#
# proot stays alive as long as the server runs, so start it in the background on this side and
# find it again by its command line, not by a pid file.
set -u
APP=/root/home-assets
LOG=$HOME/home-assets-server.log
PATTERN='^node .*server/dist/index\.js'

running() { pgrep -f "$PATTERN"; }

case "${1:-}" in
  start)
    if running >/dev/null; then echo "already running (pid $(running | head -1))"; exit 0; fi
    ENVFILE=${2:-}
    nohup proot-distro login ubuntu -- bash -c \
      "cd $APP && exec node ${ENVFILE:+--env-file=$ENVFILE} server/dist/index.js" >>"$LOG" 2>&1 &
    for i in $(seq 1 45); do
      if running >/dev/null; then break; fi; sleep 1
    done
    if ! running >/dev/null; then echo "failed to start; see: $0 logs"; exit 1; fi
    # Node under proot takes ~15 s to start listening.
    for i in $(seq 1 60); do
      for p in 8787 8788; do
        if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$p/api/items"; then
          echo "started (pid $(running | head -1)) listening on $p${ENVFILE:+ with $ENVFILE}"; exit 0
        fi
      done
      sleep 1
    done
    echo "process is up (pid $(running | head -1)) but no port answered after 60 s; see: $0 logs"; exit 1
    ;;
  stop)
    if ! running >/dev/null; then echo "not running"; exit 0; fi
    pkill -f "$PATTERN"
    for i in $(seq 1 20); do running >/dev/null || break; sleep 1; done
    if running >/dev/null; then pkill -9 -f "$PATTERN"; fi
    echo "stopped"
    ;;
  restart)
    "$0" stop && "$0" start "${2:-}"
    ;;
  status)
    if running >/dev/null; then echo "running (pid $(running | head -1))"; else echo "not running"; fi
    for p in 8787 8788; do
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$p/api/items")
      [ "$code" = 200 ] && echo "port $p answers: $(curl -s --max-time 5 http://127.0.0.1:$p/api/items | grep -o '"id"' | wc -l) items"
    done
    ;;
  logs)
    tail -n "${2:-50}" "$LOG"
    ;;
  *)
    echo "usage: $0 start [env-file] | stop | restart [env-file] | status | logs [n]"; exit 2
    ;;
esac
