---
phase: "01a"
title: "Pre-merge dedupe (4 historical dup-id groups)"
status: completed
priority: P2
dependencies: []
---

# Phase 01a: Pre-merge dedupe

## Overview

Before Phase 1 ships `registry-table.sh` (which claims identity on a "one-line-per-id" file), remove the 4 historical duplicate-id groups currently in `meta-state.jsonl` (313 lines / 309 unique ids). The dedupe makes the live file a true one-line-per-id file so the script's manual-check acceptance criterion — "produces one line per id" — is literally true (Red Team F9 + Validation Session 1 Q4). Self-contained one-time PR; ships BEFORE Phase 1.

## Why this exists

`registry-table.sh` runs `jq -s 'group_by(.id) | map(max_by(.version))[]'`. Against a file with intra-file duplicate ids, the projection picks one of the ties (jq tie-break: first in array order) — silently dropping the other. For two of the 3 change-log pairs both at `version=0`, the "canonical newer" entry could be silently dropped. Phase 1's forward-compat promise requires the live file to already be one-line-per-id by the time the script lands. This phase does that cleanup.

## The 4 duplicate-id groups

Verified against live `meta-state.jsonl` (313 lines, 309 unique ids):

1. `meta-260614T2138Z-...` — same id, two lines, both `version=0`. Both `entry_kind=change-log`.
2. `meta-260617T0113Z-...` — same id, two lines, both `version=0`. Both `entry_kind=change-log`.
3. `meta-260710T2353Z-...` — same id, two lines, both `version=0`. Both `entry_kind=change-log`.
4. `loop-design-vitest-migration-...` — same id, one line is `entry_kind=change-log` (with `supersedes` to a finding); the other line is the finding it supersedes (`resolution` field says "Repair registry corruption: entry_kind was incorrectly set to 'finding' by an earlier meta_state_patch"). Already partially resolved; keep the `loop-design` line, drop the corrupt finding copy.

## Requirements

- Functional: `meta-state.jsonl` post-phase has 309 entries (one per unique id); the 4 dup-id groups collapse to a single line each via `max_by(.version)` with documented tie-break (prefer later `created_at` for `version=0`).
- Non-functional: no schema change; no field rename; no entry-shape mutation. Pure read-modify-write of the existing entries.

## Architecture

Inline migration in the PR (no separate script). Read `meta-state.jsonl`, dedupe by id, write back atomically (`persistRegistryAtomic`-equivalent: `writeFileSync(tmpPath, ...); renameSync(tmpPath, path)`). `invalidateCache` not needed — this is a one-time file rewrite on a single-process flow.

**Dedupe rule (canonical, documented):** for each id-group, keep the entry with the largest `version`. Tie-break: prefer the entry with the LATER `created_at` (an `updated`-on-write heuristic). For `loop-design-vitest-migration-...` specifically, KEEP the `entry_kind=loop-design` line (the canonical replacement), DROP the corrupt `entry_kind=finding` line that claims to have been repaired by an earlier patch.

## Related Code Files

- Create: `tools/learning-loop-mastra/tools/handlers/scripts/dedupe-meta-state-history.mjs` (or inline script in the PR)
- Modify: `meta-state.jsonl` (the actual dedupe — committed in the same PR)
- No code in `tools/learning-loop-mastra/core/*` is touched (pure data cleanup)

## Implementation Steps

1. Audit: read `meta-state.jsonl`, group by `id`, list each group with size > 1. Confirm the 4 groups above and that no other dup-ids exist (use `jq -s 'group_by(.id) | map(select(length > 1)) | length'`).
2. Write the dedupe script (or inline): for each group, pick the survivor via the canonical rule above; write back atomically. Dry-run prints the before/after counts and a sample of each dup group BEFORE touching the file.
3. Run on a clean main checkout. Verify counts: input 313 lines, output 309 lines; one survivor per id; the loop-design survivor kept; the corrupt finding copy dropped.
4. Commit `meta-state.jsonl` in the same PR; merge on main with no parallel registry PRs.
5. Re-run the `jq -s 'group_by(.id) | map(max_by(.version)) | length'` projection against the post-PR file: should equal 309 (identity on a true one-line-per-id file).

## Success Criteria

- [x] `meta-state.jsonl` post-PR has 309 lines, 309 unique ids.
- [x] The 4 historical dup-id groups are collapsed; specific survivors match the documented rule.
- [x] `pnpm test` green (no code changes; pure data cleanup).
- [x] `jq -s 'group_by(.id) | map(max_by(.version)) | length' meta-state.jsonl` returns 309, not 313.
- [x] Manual: `head` of the file shows one line per id in the affected groups.

## Risk Assessment

Low. Pure data cleanup; no code changes; no schema changes. The 4 dup-id groups are documented in the codebase; the dedupe is non-controversial (the malformed `loop-design-vitest-migration-...` finding copy already has a `resolution` field describing the previous repair). Risk: a hidden 5th dup-id group. Mitigation: step 1 enumerates ALL groups via the jq projection; verify the count equals the 4 documented groups before running.
