#!/usr/bin/env bash
# ci-registry-deltas.sh — Parse a meta-state.jsonl diff and emit a delta summary
# to $GITHUB_STEP_SUMMARY. Advisory-only; always exits 0.
#
# Usage: ci-registry-deltas.sh <diff-file>
#
# Red Team H8 simplification: single-pass grep on +/- lines, 3 categories.
# Red Team M1: escape_md() on all interpolated strings.

set -euo pipefail

DIFF_FILE="${1:?Usage: ci-registry-deltas.sh <diff-file>}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

# Markdown escape: replace & < > with HTML entities
escape_md() {
  printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g'
}

# Extract "id" field value from a JSON line
extract_id() {
  local line="$1"
  # Use grep -oP for Perl regex; fall back to sed if unavailable
  if echo "$line" | grep -qoP '"id"\s*:\s*"'; then
    echo "$line" | grep -oP '"id"\s*:\s*"\K[^"]+'
  else
    echo ""
  fi
}

added_ids=()
removed_ids=()

while IFS= read -r line; do
  case "$line" in
    +*)
      # Added line (skip +++ header)
      if [[ "$line" == "+++"* ]]; then continue; fi
      id=$(extract_id "$line")
      if [[ -n "$id" ]]; then
        added_ids+=("$id")
      fi
      ;;
    -*)
      # Removed line (skip --- header)
      if [[ "$line" == "---"* ]]; then continue; fi
      id=$(extract_id "$line")
      if [[ -n "$id" ]]; then
        removed_ids+=("$id")
      fi
      ;;
  esac
done < "$DIFF_FILE"

added_count=${#added_ids[@]}
removed_count=${#removed_ids[@]}

{
  echo "## Meta-state registry deltas"
  echo ""

  if [[ $added_count -eq 0 && $removed_count -eq 0 ]]; then
    echo "- **No deltas** detected in \`meta-state.jsonl\`."
  else
    if [[ $added_count -gt 0 ]]; then
      escaped_ids=()
      for id in "${added_ids[@]}"; do
        escaped_ids+=("$(escape_md "$id")")
      done
      list=$(IFS=,; echo "${escaped_ids[*]}")
      echo "- **+${added_count} entries**: ${list}"
    fi

    if [[ $removed_count -gt 0 ]]; then
      escaped_ids=()
      for id in "${removed_ids[@]}"; do
        escaped_ids+=("$(escape_md "$id")")
      done
      list=$(IFS=,; echo "${escaped_ids[*]}")
      echo "- **-${removed_count} entries**: ${list}"
    fi
  fi
} >> "$SUMMARY"

exit 0
