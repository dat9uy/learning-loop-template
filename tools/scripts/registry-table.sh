#!/usr/bin/env bash
# registry-table.sh — Project the JSONL registry(ies) to one-line-per-id JSONL.
#
# Mirrors the contract shape of tools/scripts/vitest-failures.sh:
#   - green: print nothing on a no-op (the output is the data), exit 0.
#   - missing/invalid: print guidance to stderr, exit 2.
#
# Usage:
#   registry-table.sh [paths...]
#     - default path: meta-state.jsonl
#     - one or more positional args accepted (post-split defaults become
#       "meta-state.jsonl change-log.jsonl" — Red Team F11a)
#     - file set is concatenated in argument order; each file is deduped
#       independently before the cross-file union
#
# Projection: jq -s 'group_by(.id) | map(max_by(.version))[]'
#   - slurp to array, group by id, pick max version per id, stream back.
#   - On a one-line-per-id file: identity.
#   - On a versioned multi-line-per-id file: last-wins-by-max-version.
#   - Tier 2 swap: replace this jq expression with the same `lastWinsByMaxVersion`
#     projection when the chokepoint gains it (see core/read-registry-cache.js).
#
# Read-only: no side effects, no gate preflight required.
# Deterministic: stable output for stable input. Exits 0 on success, 2 on
# missing/invalid file, 1 on jq failure (unexpected).

set -euo pipefail

# Default path: meta-state.jsonl at CWD. When the change-log stream split
# lands (Phase 2), this default becomes "meta-state.jsonl change-log.jsonl"
# — see Red Team F11a.
if [[ $# -eq 0 ]]; then
  set -- meta-state.jsonl
fi

# Validate every input exists and is readable; bail with exit 2 + hint.
missing=()
for p in "$@"; do
  if [[ ! -f "$p" ]]; then
    missing+=("$p")
  fi
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "registry-table.sh: file(s) not found:" >&2
  for p in "${missing[@]}"; do
    echo "  - $p" >&2
  done
  echo "  hint: pass JSONL registry paths as positional args, e.g. \\" >&2
  echo "        tools/scripts/registry-table.sh meta-state.jsonl" >&2
  echo "  Tier 2: tools/scripts/registry-table.sh meta-state.jsonl change-log.jsonl" >&2
  exit 2
fi

# Validate each file is valid JSON (jq -e . per file); on failure, exit 2.
for p in "$@"; do
  if ! jq -e . "$p" >/dev/null 2>&1; then
    echo "registry-table.sh: invalid JSON in $p" >&2
    echo "  hint: regenerate via the loop or run the migration (Phase 01a dedupe + Phase 2 split)" >&2
    exit 2
  fi
done

# Project: dedupe by id, keep max_by(.version). Identity on a one-line-per-id
# file; last-wins on a versioned file. Slurp + group + max + stream back.
#
# Multi-file: jq -s reads each file into its own array; we -s together so the
# union is a single array, then group_by(.id) spans both. The cross-file
# sort is irrelevant to the projection — we re-stream by max-version groups.
#
# -c: compact output (one line per element). The `fx` workflow assumes
# one-line-per-id JSONL; without -c jq pretty-prints and the projection
# output is multi-line per entry.
jq -sc 'group_by(.id) | map(max_by(.version))[]' "$@"
