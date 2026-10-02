#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Aleks Linde
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Delete local branches whose remote branch is gone AND that are fully merged
# into the default branch. Safe by design:
#   - only touches branches marked "[gone]" (their upstream was deleted on the remote)
#   - uses `git branch -d` (never -D), which refuses to delete unmerged branches
#   - never deletes the current branch or the default branch
#
# Usage:
#   scripts/prune-merged-branches.sh            # dry run — shows what it WOULD delete
#   scripts/prune-merged-branches.sh --apply    # actually delete
set -euo pipefail

APPLY="${1:-}"

# Default branch (falls back to main if origin/HEAD isn't set).
DEFAULT_BRANCH="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"

# Drop remote-tracking refs for branches deleted on the remote.
git remote prune origin >/dev/null 2>&1 || true

# Branches whose upstream is gone (deleted on the remote).
gone="$(git branch -vv | awk '/: gone]/ {print $1}' | sed 's/^[*+] *//')"

if [ -z "$gone" ]; then
  echo "Nothing to prune — no local branches with a deleted upstream."
  exit 0
fi

current="$(git rev-parse --abbrev-ref HEAD)"

for b in $gone; do
  # Skip the current branch and the default branch, whatever their state.
  if [ "$b" = "$current" ] || [ "$b" = "$DEFAULT_BRANCH" ]; then
    continue
  fi
  if [ "$APPLY" = "--apply" ]; then
    # -d refuses unmerged branches, so unmerged work is never lost.
    git branch -d "$b" || echo "  ! kept $b (not merged into $DEFAULT_BRANCH — review, then delete with -D if intended)"
  else
    echo "would delete: $b"
  fi
done

if [ "$APPLY" != "--apply" ]; then
  echo
  echo "Dry run. Re-run with --apply to delete."
fi
