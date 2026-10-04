#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! node --input-type=module -e "import { isDeskUnlocked } from './scripts/desk-lock.mjs'; process.exit(isDeskUnlocked() ? 0 : 1)"; then
  exec "$@"
fi

# Public Actions logs and reports must not publish decrypted source snippets.
umask 077
output=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/desk-ci.XXXXXX")
summary=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/desk-ci-summary.XXXXXX")
export DESK_CI_SUMMARY="$summary"
trap 'rm -f "$output" "$summary"' EXIT
if "$@" >"$output" 2>&1; then
  printf 'Private desk validation passed.\n'
else
  result=$?
  cat "$summary"
  printf 'Private desk validation failed (exit %s). Reproduce this step in an unlocked local checkout; source output is withheld from public logs.\n' "$result" >&2
  exit "$result"
fi
