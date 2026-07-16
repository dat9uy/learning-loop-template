#!/usr/bin/env bash
# compact-registry.sh — Registry compaction helper for the meta-state stream.
#
# Plan 260716-1101 Tier 2: Phase B ships `--check` (early-signal stats only);
# Phase C ships `--full` (the actual compaction primitive). Threshold: when
# raw_lines >= 1000 the registry is "compaction_eligible" (the warning level
# the plan sets).
#
# Usage:
#   compact-registry.sh --check [paths...]
#     - default path: meta-state.jsonl change-log.jsonl (post-Tier-1-split)
#     - one or more positional args accepted (override the default)
#     - exits 0 when below threshold, 1 when eligible, 2 on missing/invalid
#
#   compact-registry.sh --full [paths...]
#     - Phase C only; placeholder for now (prints guidance, exits 2)
#
# Output shape (--check):
#   raw_lines=N
#   deduped_ids=M
#   dead_version_lines=K   (raw_lines - deduped_ids; superseded versions)
#   compaction_eligible=true|false  (raw_lines >= 1000)
#
# Read-only: no side effects, no gate preflight required.
# Deterministic: stable output for stable input.

set -euo pipefail

# Threshold (raw_lines). Plan 260716-1101 Phase B step 15.
COMPACTION_THRESHOLD="${COMPACTION_THRESHOLD:-1000}"

usage() {
  cat <<EOF
Usage: compact-registry.sh --check|--full [paths...]
  --check   Print stats (raw_lines / deduped_ids / dead_version_lines /
             compaction_eligible). Phase B surface; ships this round.
  --full    Run compaction (Phase C; not yet implemented).
  paths...  Default: meta-state.jsonl change-log.jsonl (post-Tier-1-split).
             Override with one or more positional args.

Exit codes:
  0  --check: stats printed, below threshold.
  1  --check: stats printed, eligible for compaction (raw_lines >= ${COMPACTION_THRESHOLD}).
  2  Missing/invalid input, or unknown flag.
EOF
}

if [[ $# -eq 0 ]]; then
  usage >&2
  exit 2
fi

MODE="$1"
shift

case "$MODE" in
  --check)
    : # proceed
    ;;
  --full)
    echo "compact-registry.sh --full: Phase C only (not yet implemented)." >&2
    echo "  hint: Phase C ships in plans/260716-1101-tier2-versioned-append-mutable-stream/phase-03-*.md." >&2
    exit 2
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    echo "compact-registry.sh: unknown flag '$MODE'" >&2
    usage >&2
    exit 2
    ;;
esac

# Default path: both files at CWD (post-Tier-1-split).
if [[ $# -eq 0 ]]; then
  set -- meta-state.jsonl change-log.jsonl
fi

# Validate every input exists and is readable; bail with exit 2 + hint.
# Tolerate an absent default-file pair: skip with a notice (matches
# registry-table.sh behavior).
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
  echo "compact-registry.sh: no registry files found at CWD (looked for: $*)" >&2
  echo "  hint: pass JSONL registry paths as positional args, e.g. \\" >&2
  echo "        tools/scripts/compact-registry.sh --check meta-state.jsonl" >&2
  exit 2
fi
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "compact-registry.sh: notice — absent file(s), skipping: ${missing[*]}" >&2
fi
set -- "${present[@]}"

# Compute raw_lines (sum of non-blank lines across files).
raw_lines=0
for p in "$@"; do
  while IFS= read -r line; do
    [[ -n "$line" ]] && raw_lines=$((raw_lines + 1))
  done < "$p"
done

# Compute deduped_ids via the same projection as registry-table.sh:
# group by id, keep max_by(.version). Counts distinct ids across all
# files (the projection union).
if command -v jq >/dev/null 2>&1; then
  deduped_ids=$(jq -sc 'group_by(.id) | map(max_by(.version)) | length' "$@")
else
  echo "compact-registry.sh: jq not on PATH; cannot compute deduped_ids." >&2
  exit 2
fi

# dead_version_lines = raw_lines - deduped_ids (the non-max-version lines
# per id — the candidates for compaction).
dead_version_lines=$((raw_lines - deduped_ids))

if [[ "$raw_lines" -ge "$COMPACTION_THRESHOLD" ]]; then
  compaction_eligible="true"
  exit_code=1
else
  compaction_eligible="false"
  exit_code=0
fi

cat <<EOF
raw_lines=${raw_lines}
deduped_ids=${deduped_ids}
dead_version_lines=${dead_version_lines}
compaction_eligible=${compaction_eligible}
EOF

exit "$exit_code"
