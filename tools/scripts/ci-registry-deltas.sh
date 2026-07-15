#!/usr/bin/env bash
# ci-registry-deltas.sh — Parse a meta-state.jsonl + change-log.jsonl diff and
# emit a delta summary + ref-validation WARNINGs to $GITHUB_STEP_SUMMARY.
# Advisory-only; always exits 0.
#
# Usage: ci-registry-deltas.sh <diff-file>
#
# Plan 260715-0801 Tier 1 Phase 3 step 1 (Red Team F12): use jq -c for robust
# per-line ref extraction (consolidated_into, consolidates, supersedes,
# reopens, proposed_design_for, addresses, promoted_to_rule, origin). The
# previous grep-based id-only extractor was fragile (hand-curated substring
# regex); jq gives us structured access to every ref field. Refs whose
# target isn't in (added ids ∪ base union) are surfaced as WARNINGs. Per
# Validation Session 1 Q2, `consolidates` is an array (z.array(z.string()))
# post-migration; jq iterates the array.
#
# Per Validation Session 1 Q3 (down-tier): cross-PR orphans self-heal on
# merge; the post-merge BLOCK is the only defense. Pre-merge this script
# only warns on refs whose target is absent from the PR's own added set OR
# the base union. Cross-PR refs are NOT warned here.
#
# Red Team M1: escape_md() on all interpolated strings.

set -euo pipefail

DIFF_FILE="${1:?Usage: ci-registry-deltas.sh <diff-file>}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

# Markdown escape: replace & < > with HTML entities
escape_md() {
  printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g'
}

# Extract "id" field value from a JSON line. Tolerates jq absence (falls back
# to grep -oP). jq is preferred because it handles escaping correctly.
# Strips the leading +/- diff marker before parsing.
extract_id() {
  local line="$1"
  # Strip the leading +/- diff marker if present
  local body="${line#+}"
  body="${body#-}"
  if [[ -z "$body" ]]; then return; fi
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$body" | jq -r '.id // empty' 2>/dev/null || true
  else
    if printf '%s' "$body" | grep -qoP '"id"\s*:\s*"'; then
      printf '%s' "$body" | grep -oP '"id"\s*:\s*"\K[^"]+'
    fi
  fi
}

# Plan 260715-0801 Phase 3 step 1 (Red Team F12): extract every ref field
# in one jq -c pass. Returns a tab-separated list of "field:value" pairs,
# one pair per line. Tolerates arrays (consolidates, reopens, proposed_design_for,
# addresses) — jq emits each element on its own line.
extract_refs() {
  local line="$1"
  if ! command -v jq >/dev/null 2>&1; then return; fi
  local body="${line#+}"
  body="${body#-}"
  if [[ -z "$body" ]]; then return; fi
  printf '%s' "$body" | jq -r '
    [
      (.consolidated_into // empty | "consolidated_into:\(.)"),
      (.consolidates // [] | .[] | "consolidates:\(.)"),
      (.supersedes // empty | "supersedes:\(.)"),
      (.reopens // [] | .[] | "reopens:\(.)"),
      (.proposed_design_for // [] | .[] | "proposed_design_for:\(.)"),
      (.addresses // [] | .[] | "addresses:\(.)"),
      (.promoted_to_rule // empty | "promoted_to_rule:\(.)"),
      (.origin // empty | "origin:\(.)")
    ] | .[]
  ' 2>/dev/null || true
}

added_ids=()
removed_ids=()
added_refs=()

while IFS= read -r line; do
  case "$line" in
    +*)
      # Added line (skip +++ header)
      if [[ "$line" == "+++"* ]]; then continue; fi
      id=$(extract_id "$line")
      if [[ -n "$id" ]]; then
        added_ids+=("$id")
      fi
      # Capture refs from the added line for cross-reference validation
      while IFS= read -r ref; do
        [[ -n "$ref" ]] && added_refs+=("$ref")
      done < <(extract_refs "$line")
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

# Resolve the base registry union (meta-state + change-log) for the PR's base
# ref. We can't easily fetch the base file from the workflow context here
# (the script runs on /tmp/registry.diff only), so the WARN list is computed
# against the CURRENT working tree's union — refs whose target isn't in the
# added set OR the current working tree. This is a slight over-warn (refs
# already merged into main are also accepted) but never under-warns. The
# post-merge BLOCK signal in `meta-state-refs-check.yml` is the canonical
# defense.
base_ids=$(jq -r '.id' meta-state.jsonl change-log.jsonl 2>/dev/null | sort -u || true)
orphan_refs=()
for ref in "${added_refs[@]}"; do
  target=${ref#*:}
  target_in_added=0
  for id in "${added_ids[@]}"; do
    if [[ "$id" == "$target" ]]; then target_in_added=1; break; fi
  done
  target_in_base=0
  if printf '%s\n' "$base_ids" | grep -qxF "$target"; then target_in_base=1; fi
  if [[ "$target_in_added" -eq 0 && "$target_in_base" -eq 0 ]]; then
    orphan_refs+=("$ref")
  fi
done

{
  echo "## Meta-state registry deltas"
  echo ""

  if [[ $added_count -eq 0 && $removed_count -eq 0 ]]; then
    echo "- **No deltas** detected in \`meta-state.jsonl\` or \`change-log.jsonl\`."
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

  # Plan 260715-0801 Phase 3 step 1: ref-validation WARNINGs. Refs whose
  # target id is absent from (added set ∪ base union) are flagged here.
  # Cross-PR orphans self-heal on merge (Validation Session 1 Q3); the
  # post-merge BLOCK in `meta-state-refs-check.yml` is the canonical defense.
  orphan_count=${#orphan_refs[@]}
  if [[ $orphan_count -gt 0 ]]; then
    echo ""
    echo "## Ref-validation warnings (${orphan_count})"
    echo ""
    echo "Refs whose target id is absent from the PR's added set AND the base registry union. Cross-PR orphans self-heal on merge."
    echo ""
    for ref in "${orphan_refs[@]}"; do
      escaped_ref=$(escape_md "$ref")
      echo "- \`${escaped_ref}\`"
    done
  fi
} >> "$SUMMARY"

exit 0
