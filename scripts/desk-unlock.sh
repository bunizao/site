#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

if [[ "${1:-}" == '--interactive' ]]; then
  shift
  if [[ ! -t 0 ]]; then
    printf 'desk unlock requires a terminal for hidden key input\n' >&2
    exit 1
  fi
  printf 'Desk key (hidden): ' >&2
  IFS= read -r -s DESK_KEY
  printf '\n' >&2
  export DESK_KEY
fi

exec node scripts/desk-unlock.mjs "$@"
