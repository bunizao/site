#!/usr/bin/env bash
# Transcrypt output is suppressed because configuration messages can contain the key.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

if [[ -z "${DESK_KEY:-}" ]]; then
  printf 'desk locked (no DESK_KEY)\n'
  exit 0
fi

for command in git openssl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'desk unlock requires %s\n' "$command" >&2
    exit 1
  fi
done

if git config --local --get transcrypt.version >/dev/null; then
  # Never replace an existing key or discard local edits on an owner checkout.
  if [[ "$(git config --local --get transcrypt.password)" != "$DESK_KEY" ]]; then
    printf 'desk unlock refused: this checkout already uses a different key\n' >&2
    exit 1
  fi
else
  hooks_path=$(git config --get core.hooksPath || true)
  if [[ -n "$hooks_path" && ! -d "$hooks_path" ]]; then
    printf 'desk unlock refused: configured Git hooks directory is missing; repair core.hooksPath first\n' >&2
    exit 1
  fi
  if ! git diff-index --quiet HEAD --; then
    printf 'desk unlock refused: commit or stash tracked changes first\n' >&2
    exit 1
  fi
  if ! bash scripts/vendor/transcrypt -c aes-256-cbc -p "$DESK_KEY" -y >/dev/null 2>&1; then
    printf 'desk unlock failed; no files were intentionally discarded\n' >&2
    exit 1
  fi
fi

if ! node --input-type=module -e "import { isDeskUnlocked } from './scripts/desk-lock.mjs'; process.exit(isDeskUnlocked() ? 0 : 1)"; then
  printf 'desk unlock failed: source is still locked (check the key)\n' >&2
  exit 1
fi
printf 'desk unlocked\n'
