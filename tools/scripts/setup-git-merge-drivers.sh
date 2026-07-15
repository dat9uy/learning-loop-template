#!/usr/bin/env bash
# setup-git-merge-drivers.sh — One-time per-clone setup for the git union-merge
# driver. Configures `merge.union.driver` so `.gitattributes`'s `merge=union`
# actually runs on this clone (git config is per-clone, not committable).
#
# Usage:
#   tools/scripts/setup-git-merge-drivers.sh [--force]
#
# Behavior:
#   - canonical correct value: 'git merge-file --union %A %O %B'
#   - unset -> sets it; exits 0
#   - set to the correct value -> no-op; exits 0
#   - set to a DIFFERENT value (e.g. the wrong `%O %A %B`):
#       - exit 1, print a warning identifying the wrong order + the data-loss
#         risk, do NOT silently overwrite. Operator must pass --force to
#         acknowledge and overwrite.
#   - --force: overwrite any existing value (correct or wrong) with the
#     canonical value
#
# The widely-cited "git merge-file --union %O %A %B" is WRONG — `git merge-file`
# writes its result to the first arg, so the result lands in %O and git reads
# the unchanged %A (ours), silently dropping the other side. This is the
# data-loss `merge=union` exists to prevent. Verified by the Plan 260715-1608
# Phase 4 fixture (two branches from a shared base, each appending a
# change-log at the same EOF position; corrected driver keeps both lines,
# wrong driver keeps only one).
#
# Mirrors the contract shape of tools/scripts/registry-table.sh:
#   - set -euo pipefail
#   - clear exit codes
#   - fail-closed (wrong-order detection does not silently overwrite)

set -euo pipefail

# Canonical correct value. Arg order matters: result MUST land in %A (ours).
CANONICAL_DRIVER='git merge-file --union %A %O %B'
# The WRONG order that's documented elsewhere — used to detect a misconfigured
# clone without silently overwriting it.
WRONG_DRIVER_PATTERN='%O %A %B'

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --help|-h)
      cat <<USAGE
Usage: setup-git-merge-drivers.sh [--force]

Sets merge.union.driver to the canonical correct value
  'git merge-file --union %A %O %B'.

If the driver is already set to a DIFFERENT value (e.g. the wrong
'%O %A %B' order), exit 1 and warn — do not silently overwrite. Pass
--force to acknowledge and overwrite.
USAGE
      exit 0
      ;;
    *)
      echo "setup-git-merge-drivers.sh: unknown argument: $arg" >&2
      echo "  hint: pass --force to overwrite an existing config" >&2
      exit 2
      ;;
  esac
done

# Read the current value (exit 0 if set, exit 1 if unset).
CURRENT=$(git config --get merge.union.driver || true)

if [[ -z "$CURRENT" ]]; then
  git config merge.union.driver "$CANONICAL_DRIVER"
  echo "configured merge.union.driver (correct order: %A %O %B)"
  exit 0
fi

# Already correct -> no-op (idempotent).
if [[ "$CURRENT" == "$CANONICAL_DRIVER" ]]; then
  echo "merge.union.driver already configured correctly (idempotent no-op)"
  exit 0
fi

# Wrong order detected (the documented data-loss bug).
if [[ "$CURRENT" == *"$WRONG_DRIVER_PATTERN"* ]]; then
  if [[ "$FORCE" == "1" ]]; then
    git config merge.union.driver "$CANONICAL_DRIVER"
    echo "overwrote wrong-order merge.union.driver with corrected value (--force)"
    exit 0
  fi
  cat >&2 <<EOF
setup-git-merge-drivers.sh: WRONG ARG ORDER detected in merge.union.driver.

  Current value:  $CURRENT
  Canonical:      $CANONICAL_DRIVER

Why this matters: git merge-file writes its result to the FIRST argument.
With '%O %A %B' the result lands in %O (the ancestor copy), and git reads
the unchanged %A (ours) — silently dropping the other side. That is the
exact data-loss merge=union exists to prevent.

To overwrite, pass --force:
  tools/scripts/setup-git-merge-drivers.sh --force

(Not silently overwriting because an explicit operator setting is a
signal. Wrong-order drivers were the canonical bug before Plan 260715-1608.)
EOF
  exit 1
fi

# Some other value entirely. Fail closed: warn + exit 1, unless --force.
if [[ "$FORCE" == "1" ]]; then
  git config merge.union.driver "$CANONICAL_DRIVER"
  echo "overwrote non-canonical merge.union.driver with corrected value (--force)"
  exit 0
fi

cat >&2 <<EOF
setup-git-merge-drivers.sh: non-canonical merge.union.driver value detected.

  Current value:  $CURRENT
  Canonical:      $CANONICAL_DRIVER

To overwrite, pass --force:
  tools/scripts/setup-git-merge-drivers.sh --force
EOF
exit 1