#!/usr/bin/env bash
# setup-git.sh — One-command per-clone git setup. Runs BOTH per-clone git
# configs a clean clone needs, so "do both" is one command and the
# session-start preflight hooks point here:
#   1. setup-git-merge-drivers.sh  — merge.union.driver (union merge driver)
#   2. setup-git-push.sh           — remote.origin.url + credential helper
# Both configure per-clone git state that is NOT committable, so a clean
# clone must run both. The merge-driver setup has a silent-failure mode
# (merge=union no-ops; parallel change-log PRs conflict), which is why a
# single remembered command matters — forgetting one half is not loud.
#
# Order: merge-drivers FIRST (cheap, local, no network, no mutation risk),
# then push (may rewrite remote.origin.url + helper, write-verified via gh).
# A merge-driver failure (e.g. wrong-order existing config without --force)
# stops before push runs, so an operator signal is not buried by push output.
#
# Each sub-script is idempotent and fail-closed; this orchestrator is too.
# --force passes through to both. A non-zero exit from either sub propagates.
#
# Usage:
#   tools/scripts/setup-git.sh [--force]
#
# Mirrors the contract shape of setup-git-push.sh / setup-git-merge-drivers.sh:
#   - set -euo pipefail
#   - clear exit codes (0 ok / 1 fail-closed / 2 usage)
#   - --force does not change fail-closed semantics for non-GitHub remotes
#     (the push sub-script still rejects non-GitHub origins even with --force)

set -euo pipefail

# ---------------------------------------------------------------- arg parse
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --help|-h)
      cat <<USAGE
Usage: setup-git.sh [--force]

One-command per-clone git setup: configures the union merge driver and the
deterministic push path (SSH->HTTPS + gh credential helper when needed).

Both sub-scripts are idempotent. --force passes through to both (overwrites
a wrong/non-canonical merge-driver order and re-runs the push convert).

Exits non-zero if either sub-script exits non-zero.
USAGE
      exit 0
      ;;
    *)
      echo "setup-git.sh: unknown argument: $arg" >&2
      echo "  hint: pass --force to overwrite non-canonical existing values" >&2
      exit 2
      ;;
  esac
done

# ----------------------------------------------------- locate sibling scripts
# Resolve this script's directory so the orchestrator works from any cwd,
# not just the repo root.
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
MERGE_DRIVERS="$SCRIPT_DIR/setup-git-merge-drivers.sh"
PUSH="$SCRIPT_DIR/setup-git-push.sh"

if [[ ! -x "$MERGE_DRIVERS" ]]; then
  echo "setup-git.sh: missing sibling script: $MERGE_DRIVERS" >&2
  exit 1
fi
if [[ ! -x "$PUSH" ]]; then
  echo "setup-git.sh: missing sibling script: $PUSH" >&2
  exit 1
fi

# ----------------------------------------------------- require a work tree
# The push sub-script checks this too, but fail early with a unified message
# before either sub runs (merge-drivers uses plain `git config`, which would
# otherwise write to the operator's GLOBAL gitconfig outside a repo).
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "setup-git.sh: not inside a git working tree" >&2
  exit 1
fi

# Build the shared arg vector. Declared empty so "${SUB_ARGS[@]}" is safe
# under `set -u` (bash 4.4+ treats a declared-empty array as bound).
SUB_ARGS=()
if [[ "$FORCE" == "1" ]]; then
  SUB_ARGS=(--force)
fi

# ----------------------------------------------------- merge-drivers (first)
# `cmd || rc=$?` disarms errexit for that command so we can capture its exit
# without aborting the orchestrator, then decide to stop.
merge_rc=0
"$MERGE_DRIVERS" "${SUB_ARGS[@]}" || merge_rc=$?

if [[ "$merge_rc" -ne 0 ]]; then
  echo "setup-git.sh: merge-driver setup failed (exit $merge_rc); stopping before push setup" >&2
  exit "$merge_rc"
fi

# ----------------------------------------------------- push (second)
push_rc=0
"$PUSH" "${SUB_ARGS[@]}" || push_rc=$?

if [[ "$push_rc" -ne 0 ]]; then
  echo "setup-git.sh: push setup failed (exit $push_rc)" >&2
  exit "$push_rc"
fi

echo "setup-git.sh: done — merge-driver ✓ | push ✓"
exit 0