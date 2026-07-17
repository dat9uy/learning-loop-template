#!/usr/bin/env bash
# registry-table.sh — Project the JSONL registry(ies) to one-line-per-id JSONL.
#
# Mirrors the contract shape of tools/scripts/vitest-failures.sh:
#   - green: print nothing on a no-op (the output is the data), exit 0.
#   - missing/invalid: print guidance to stderr, exit 2.
#
# Usage:
#   registry-table.sh [--all-versions] [paths...]
#     - --all-versions: bypass the max_by(.version) collapse and emit every
#       line per id, sorted by (id, version) ascending (created_at tie-break).
#       Symmetric to meta_state_list's include_all_versions MCP flag. Must
#       precede any positional path (fails closed with usage otherwise).
#     - default path: meta-state.jsonl change-log.jsonl (post-Tier-1-split,
#       Red Team M2 / Plan 260716-1101 Phase A step 7)
#     - one or more positional args accepted (override the default)
#     - file set is concatenated in argument order; each file is deduped
#       independently before the cross-file union
#
# Projection: jq -s 'group_by(.id) | map(max_by(.version))[]'
#   - slurp to array, group by id, pick max version per id, stream back.
#   - On a one-line-per-id file: identity.
#   - On a versioned multi-line-per-id file: last-wins-by-max-version.
#   - --all-versions swaps it for 'sort_by(.id, .version, .created_at)[]'
#     (identity on a one-line-per-id file).
#   - Tier 2 swap: replace this jq expression with the same `lastWinsByMaxVersion`
#     projection when the chokepoint gains it (see core/read-registry-cache.js).
#
# Read-only: no side effects, no gate preflight required.
# Deterministic: stable output for stable input. Exits 0 on success, 2 on
# missing/invalid file, 1 on jq failure (unexpected).

set -euo pipefail

# Flag sweep: --all-versions must precede positional paths (fail closed).
all_versions=false
positional=()
for a in "$@"; do
  if [[ "$a" == "--all-versions" ]]; then
    if [[ ${#positional[@]} -gt 0 ]]; then
      echo "registry-table.sh: --all-versions must precede positional paths" >&2
      echo "  usage: registry-table.sh [--all-versions] [paths...]" >&2
      exit 2
    fi
    all_versions=true
  else
    positional+=("$a")
  fi
done
set -- ${positional[@]+"${positional[@]}"}

# Default path: both files at CWD. Post-Tier-1-split the registry is two
# files; the JS union chokepoint reads both, and the shell-side helper
# now matches so `registry-table.sh | tail -20` is parity-equivalent to
# `meta_state_list`'s output (Phase A step 7 / Red Team M2). Either file
# may be absent — jq's slurp tolerates the empty array.
if [[ $# -eq 0 ]]; then
  set -- meta-state.jsonl change-log.jsonl
fi

# Validate every input exists and is readable; bail with exit 2 + hint.
# Tolerate an absent default-file pair (one may be missing on pre-split or
# post-split trees): emit a notice on stderr but continue with the
# present files. This preserves the pre-Tier-1 behavior where
# `meta-state.jsonl` alone was the only file.
missing=()
present=()
for p in "$@"; do
  if [[ -f "$p" ]]; then
    present+=("$p")
  else
    missing+=("$p")
  fi
done
if [[ ${#present[@]} -eq 0 ]]; then
  echo "registry-table.sh: no registry files found at CWD (looked for: $*)" >&2
  echo "  hint: pass JSONL registry paths as positional args, e.g. \\" >&2
  echo "        tools/scripts/registry-table.sh meta-state.jsonl" >&2
  echo "        tools/scripts/registry-table.sh meta-state.jsonl change-log.jsonl" >&2
  exit 2
fi
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "registry-table.sh: notice — absent file(s), skipping: ${missing[*]}" >&2
fi
set -- "${present[@]}"

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
if [[ "$all_versions" == true ]]; then
  # All-versions: no collapse — every line per id, sorted by (id, version)
  # with created_at tie-break. Null/missing version reads as 0 (same
  # null-as-0 invariant as the JS reader) so legacy lines parse cleanly.
  jq -sc 'sort_by(.id, (.version // 0), (.created_at // ""))[]' "$@"
else
  jq -sc 'group_by(.id) | map(max_by(.version))[]' "$@"
fi
