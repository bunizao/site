#!/usr/bin/env bash
# SessionEnd hook. Stops the astro background dev server recorded in this
# checkout's .astro/dev.json lockfile. Pure bash: must work in worktrees
# without node_modules and without node/bun on PATH.
set -u

root="${CLAUDE_PROJECT_DIR:-$PWD}"
lock="$root/.astro/dev.json"

if [ ! -f "$lock" ]; then
  exit 0
fi

pid=$(sed -n 's/.*"pid":[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$lock" | head -1)

if [ -n "$pid" ] && ps -p "$pid" -o command= 2>/dev/null | grep -q astro; then
  kill "$pid" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! ps -p "$pid" >/dev/null 2>&1; then
      break
    fi
    sleep 0.3
  done
  if ps -p "$pid" >/dev/null 2>&1; then
    kill -9 "$pid" 2>/dev/null
  fi
fi

rm -f "$lock"
exit 0
