#!/usr/bin/env bash
# Garbage-collects merged and stale git worktrees of this repository.
# Dry run by default; pass --apply to remove.
#
# A worktree is removable only when BOTH hold:
#   - its tracked state is clean (no modified or untracked files; ignored
#     files like node_modules do not count)
#   - its HEAD commit is already contained in the main branch
# The main checkout and the worktree the script runs from are never touched.
set -euo pipefail

apply=0
if [ "${1:-}" = "--apply" ]; then
  apply=1
elif [ -n "${1:-}" ]; then
  echo "usage: $0 [--apply]" >&2
  exit 2
fi

git fetch -q origin main 2>/dev/null || true
main_ref=main
if git rev-parse --verify -q origin/main >/dev/null; then
  main_ref=origin/main
fi

current=$(git rev-parse --show-toplevel)

entries=()
path=""
while IFS= read -r line; do
  case "$line" in
    "worktree "*) path=${line#worktree } ;;
    "HEAD "*) entries+=("$path|${line#HEAD }") ;;
  esac
done < <(git worktree list --porcelain)

main_wt=${entries[0]%%|*}
removable=0
kept=0

for entry in "${entries[@]}"; do
  wt=${entry%%|*}
  sha=${entry##*|}
  if [ "$wt" = "$main_wt" ] || [ "$wt" = "$current" ]; then
    continue
  fi
  if [ ! -d "$wt" ]; then
    echo "prune   $wt (directory missing)"
    continue
  fi
  if [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
    echo "keep    $wt (dirty)"
    kept=$((kept + 1))
    continue
  fi
  if ! git merge-base --is-ancestor "$sha" "$main_ref" 2>/dev/null; then
    echo "keep    $wt (not merged into $main_ref)"
    kept=$((kept + 1))
    continue
  fi
  removable=$((removable + 1))
  if [ "$apply" = 0 ]; then
    echo "remove  $wt (merged into $main_ref)"
    continue
  fi
  # Stop a dev server recorded in the worktree's astro lockfile before removal.
  lock="$wt/.astro/dev.json"
  if [ -f "$lock" ]; then
    pid=$(sed -n 's/.*"pid":[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$lock" | head -1)
    if [ -n "$pid" ] && ps -p "$pid" -o command= 2>/dev/null | grep -q astro; then
      kill "$pid" 2>/dev/null || true
    fi
  fi
  # Ignored files (node_modules, .astro, .claude) block a plain remove; the
  # tracked state was verified clean above, so --force is safe as a fallback.
  git worktree remove "$wt" 2>/dev/null || git worktree remove --force "$wt"
  echo "removed $wt"
done

echo
if [ "$apply" = 0 ]; then
  echo "$removable removable, $kept kept. Dry run: pass --apply to remove."
else
  git worktree prune
  echo "removed $removable, kept $kept, pruned stale registrations."
fi
