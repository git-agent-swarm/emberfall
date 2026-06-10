#!/usr/bin/env bash
# Build EMBERFALL, serve it locally, and open it in Chrome for a play-test.
# Runs fully standalone (no Devvit server) — it falls back to a default course.
#   Keyboard:  Space/W = jump (hold = float, again in air = double-jump)
#              Shift/K = dash (arrows aim it)   ·   S/Down = ground-pound
#   Mouse:     left half = jump   ·   right half = dash (drag to aim)
set -e
cd "$(dirname "$0")"
PORT=8791

echo "building…"
npm run build >/tmp/emberfall-build.log 2>&1 || { echo "build failed — see /tmp/emberfall-build.log"; exit 1; }

# (re)start the static server, fully detached, and wait until it actually binds
pkill -f "http.server ${PORT}" 2>/dev/null || true
sleep 0.4
( cd dist/client && setsid python3 -m http.server "${PORT}" --bind 127.0.0.1 >/tmp/emberfall-http.log 2>&1 < /dev/null & )
# wait for the port (up to ~5s) before opening the window
for i in $(seq 1 25); do
  if curl -s -o /dev/null "http://127.0.0.1:${PORT}/game.html"; then break; fi
  sleep 0.2
done
if ! curl -s -o /dev/null "http://127.0.0.1:${PORT}/game.html"; then
  echo "server failed to start — see /tmp/emberfall-http.log"; exit 1
fi
echo "server up on http://127.0.0.1:${PORT}/game.html"

echo "opening EMBERFALL…  (Space = jump, Shift = dash, S = pound)"
DISPLAY=:0 setsid google-chrome \
  --user-data-dir=/tmp/emberfall-chrome2 \
  --no-first-run --no-default-browser-check \
  --window-size=900,720 --window-position=80,60 \
  --app="http://127.0.0.1:${PORT}/game.html" >/dev/null 2>&1 < /dev/null &
echo "→ window opening on your screen. (If it doesn't, open the URL above in any browser.)"
