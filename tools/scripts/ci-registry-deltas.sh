#!/usr/bin/env bash
# ci-registry-deltas.sh — Parse a meta-state.jsonl + change-log.jsonl diff and
# emit a delta summary + ref-validation WARNINGs to $GITHUB_STEP_SUMMARY.
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
# Plan 260715-1608 Phase 1 (red-team F6) backstop: change-log refs
# (`consolidates`, `supersedes`) on a NEW change-log added in this PR are
# immune to post-merge cleanup (change-logs are immutable), and the post-merge
# validator's source-keyed exemption (Phase 1 `historical` bucket) means they
# never block. To close the typo / fabrication hole, this script FAILS the
# check (exits non-zero) when a new unresolved `consolidates` or `supersedes`
# ref is detected. Non-change-log diffs stay advisory (exit 0).
#
# Red Team M1: escape_md() on all interpolated strings.
#
# Exit codes:
#   0 — no change-log ref violations (advisory warnings may still be reported)
#   1 — at least one new unresolved `consolidates`/`supersedes` ref from a
#       change-log added in the PR
#   2 — usage / parse error (e.g. missing diff file)

set -euo pipefail

DIFF_FILE="${1:?Usage: ci-registry-deltas.sh <diff-file>}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
# Plan 260715-1608 Phase 1: opt-out via CHANGE_LOG_REF_GATE=0 (do NOT fail the
# change-log backstop gate — useful for non-change-log PRs that do not need
# this). Default: enabled.
CHANGE_LOG_REF_GATE="${CHANGE_LOG_REF_GATE:-1}"

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
# Plan 260715-1608 Phase 1: track ids of change-log entries added in this PR
# so the backstop gate can distinguish change-log-only refs (consolidates,
# supersedes) from refs on other source kinds (which stay advisory).
added_change_log_ids=()

detect_kind() {
  local line="$1"
  local body="${line#+}"
  body="${body#-}"
  if [[ -z "$body" ]]; then printf '%s' ""; return; fi
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$body" | jq -r '.entry_kind // empty' 2>/dev/null || true
  fi
}

while IFS= read -r line; do
  case "$line" in
    +*)
      # Added line (skip +++ header)
      if [[ "$line" == "+++"* ]]; then continue; fi
      id=$(extract_id "$line")
      if [[ -n "$id" ]]; then
        added_ids+=("$id")
        kind=$(detect_kind "$line")
        if [[ "$kind" == "change-log" ]]; then
          added_change_log_ids+=("$id")
        fi
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
# Plan 260715-1608 Phase 1: separately track change-log-only orphan refs
# (`consolidates`, `supersedes`) on ids added in this PR. These trigger the
# backstop FAIL.
cl_orphan_refs=()
for ref in "${added_refs[@]}"; do
  field="${ref%%:*}"
  target="${ref#*:}"
  target_in_added=0
  for id in "${added_ids[@]}"; do
    if [[ "$id" == "$target" ]]; then target_in_added=1; break; fi
  done
  target_in_base=0
  if printf '%s\n' "$base_ids" | grep -qxF "$target"; then target_in_base=1; fi
  if [[ "$target_in_added" -eq 0 && "$target_in_base" -eq 0 ]]; then
    orphan_refs+=("$ref")
    # Change-log-only fields. Other ref fields stay advisory.
    if [[ "$field" == "consolidates" || "$field" == "supersedes" ]]; then
      cl_orphan_refs+=("$ref")
    fi
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

  # Plan 260715-1608 Phase 1 (red-team F6) backstop: the post-merge BLOCK
  # validator exempts change-log sources as `historical` (immutable; cannot be
  # patched). To catch typos / fabricated refs BEFORE the change-log is
  # rendered immutable by merge, surface new unresolved `consolidates` /
  # `supersedes` refs as a BLOCK.
  cl_orphan_count=${#cl_orphan_refs[@]}
  if [[ $cl_orphan_count -gt 0 ]]; then
    echo ""
    echo "## Change-log ref-resolution FAIL (${cl_orphan_count})"
    echo ""
    echo "New change-log entries in this PR reference ids absent from the PR's added set AND the base registry union. Because change-logs are immutable post-merge, the post-merge BLOCK validator exempts these as \`historical\` — typos/fabrications are caught HERE only. Resolve by adding the referenced ids in this PR or correcting the refs."
    echo ""
    for ref in "${cl_orphan_refs[@]}"; do
      escaped_ref=$(escape_md "$ref")
      echo "- \`${escaped_ref}\`"
    done
  fi
} >> "$SUMMARY"

# Plan 260715-1608 Phase 1: fail the step when a new change-log-only orphan
# ref was detected. The workflow's "Emit delta summary" step then surfaces
# as red on the PR's Checks tab. Opt-out via CHANGE_LOG_REF_GATE=0 for
# pre-existing-condition exempts / safe WIP branches.
if [[ "$CHANGE_LOG_REF_GATE" == "1" && ${#cl_orphan_refs[@]} -gt 0 ]]; then
  exit 1
fi

exit 0
