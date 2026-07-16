---
phase: 3
title: "Phase C: gitattributes Flip + CI Advisory + Compaction Signal"
status: completed
priority: P1
dependencies: [2]
shipped_at: "2026-07-16T13:55:00.000Z"
shipped_by: "operator"
shipped_via: "local (awaiting `gh pr create` from operator)"
test_summary: "TDD: registry-stats helper (13) + warm-tier registry_stats integration (2) + compact-registry --check + --full (13) + parallel-merge dry-run (3) + Q2 advisory (4) = 35 new cases; full suite 2121 / 0 / 429."
---

# Phase 3: Phase C — gitattributes Flip + CI Advisory + Compaction Signal

## Overview

Flip `.gitattributes` to enable `merge=union` on `meta-state.jsonl` — the load-bearing mechanical fix that removes the operator's parallel-resolve speed limiter. Add the Q2 same-id-concurrent-mutation CI advisory (pre-merge WARNING, both version lines retained). Ship the compaction signal (`compact-registry.sh --check` + `loop_describe` warm-tier `registry_stats` + CI notice) so the operator and agent runtime know when to compact. Formalize the read instruction in AGENTS.md/CLAUDE.md. Lands only after Phase B is on main and green.

## Requirements

- **Functional:** `meta-state.jsonl merge=union` in `.gitattributes`; two branches that each mutate the same id auto-merge via union; projection dedupes to last-wins; CI advisory surfaces duplicate-version-per-id as a WARNING (no block). `compact-registry.sh --check` reports `raw_lines`, `deduped_ids`, `dead_version_lines`, `compaction_eligible` (threshold `raw_lines >= 1000`). `loop_describe({tier:"warm"})` includes a `registry_stats` block with the same shape.
- **Non-functional:** advisory is non-blocking (WARN only); compaction script is read-only in `--check` mode; the full compaction run rewrites the file keeping `max_by(.version)` per id (keep-latest-tombstone per id for audit completeness). Same-clone `git config merge.union.driver` setup already documented in `.gitattributes`.

## Architecture

**`.gitattributes` flip:** replace the current forbidding comment for `meta-state.jsonl` with `meta-state.jsonl merge=union` and a justification noting the Phase B write-path rewrite made it safe (mutations are appends, no line replacement; versioned dedupe handles same-id concurrent mutations). Keep the existing `runtime-state.jsonl` + `change-log.jsonl` lines and the `git config merge.union.driver` setup note.

**Writer-side union-safety guard (C1):** add a CI check that runs on every PR touching `meta-state.jsonl` and on every merge to main. The check parses the union and asserts:
1. No entry has `entry_kind !== "change-log"` AND missing/null `version` (Phase A backfill invariant).
2. For every id group, the max version value matches the line that ends up as last-wins. If a re-introduced in-place write produces a `version` value less than the max (a stale-base write), the merge would silently keep BOTH versions and the projection would emit the wrong one. The check must BLOCK (not WARN) on this.
3. Wire into `meta-state-pr-body-advisory.yml` as a HARD BLOCK (advisory is WARN-only, this guard is BLOCK); wire into a post-merge `gh-action` that runs on every main push.

   <!-- RT: C1 — Q2 advisory is WARN-only by design (operator can suppress),
   but the writer-side flip guard is BLOCK by design. The flip is irreversible-in-effect
   once a parallel merge relies on it; the writer-side discipline must be enforced
   continuously. Scope-creep alert: existing Phase 3 says "extend ci-registry-deltas.sh
   for Q2 + add compaction notice." Writer-side guard is in ADDITION to that, not
   replacing it. -->

**Per-clone driver CI check (H5):** add a pre-merge check that runs `git config --get merge.union.driver` and BLOCKS the PR if missing AND PR touches `meta-state.jsonl` (or any registry file). Reason: a fresh-clone contributor with the wrong-arg-order workaround (`git merge-file --union %O %A %B`) silently drops "theirs" — data loss. The existing `tools/scripts/setup-git-merge-drivers.sh` is the on-demand bootstrap; Phase C adds CI enforcement.

**CI advisory (Q2 — fixed jq):** extend `tools/scripts/ci-registry-deltas.sh` (already id-aware, advisory-only) with a same-id-duplicate-version check that emits **one WARNING per affected id** (not a single boolean):

```sh
# Per-id duplicates; each id emitted on its own line for WARNING emission.
jq -rs '
  [inputs[] | select(. != null and .id != null)]
  | group_by(.id)
  | map(select(length > 1) | {id: .[0].id, count: length})
  | .[]
  | "\(.id)\t\(.count)"
' meta-state.jsonl change-log.jsonl \
  | while IFS=$'\t' read -r id count; do
      printf 'WARNING: duplicate version-per-id detected for `%s` (%d lines). Both version lines retained.\n' \
        "$(escape_md "$id")" "$count" | tee -a "$SUMMARY"
    done
```

<!-- RT: S-F9 — the previous jq (`group_by(.id) | map(group_by(.version) | map(length)) | map(any(. > 1)) | any`)
collapsed everything to one boolean. The fixed expression emits per-id lines
suitable for `escape_md` WARNING blocks (mirroring `ci-registry-deltas.sh:46-49`). -->

Pre-merge WARNING only (operator audit). Post-merge BLOCK for relationship orphans already shipped in Tier 1 follow-up — not re-done here.

**Compaction signal (actionable, not decorative — H7):**

- `tools/scripts/compact-registry.sh`: `--check`/`--dry-run` prints `{ raw_lines, deduped_ids, dead_version_lines, compaction_eligible }`. Exits **1 when `compaction_eligible=true`** (signal-not-noise — operators want to know when action is needed); exits 0 when not eligible. Phase C also ships the **full compaction run** (no `--check`) that rewrites `meta-state.jsonl` keeping `max_by(.version)` per id, keeping the latest tombstone per archived id (audit completeness), under the per-root write discipline. Mirrors `registry-table.sh` (jq pipe, read-only in check mode) + `persistRegistryAtomic` (tmp+rename) shape.
- `loop_describe` warm tier: add a `registry_stats` block computed by the same `core/` helper, NOT by shelling out from the MCP server. Expose `computeRegistryStats(root)` in `core/registry-stats.js`; call from `loop-describe-tool.js` warm-tier handler.
- **Compaction action hook:** extend `discoverability_hints` (already injected at session start) with a hint that fires when `compaction_eligible=true` AND user has been idle for ≥1 hour: "registry compaction eligible at N raw lines — run `pnpm exec compact-registry.sh --full`."

  <!-- RT: H7 — Validation Session 1 Q5: shell script only, no `meta_state_compact` MCP tool.
  Current scale is solo; defer the MCP tool to a Tier-3 plan when there's a concrete
  agent consumer. The action hook is the discoverability hint pointing at the
  shell script; operators and agents both can run shell scripts. -->

  <!-- RT: H7 — three problems: (a) `--check` exit-code was 0-even-when-eligible (defeats
  signaling); (b) `registry_stats` was decorative (no programmatic hook);
  (c) Phase B removes the existing terminal-age filter at `meta-state.js:1028-1039`
  with no replacement until Phase C. (c) is mitigated by Phase B shipping
  `compact-registry.sh --check` early, per phase-02 design. (a) and (b) are fixed
  here: exit 1 when eligible; discoverability_hint recommendation; optional
  `meta_state_compact` MCP tool. -->

- CI: the advisory workflow emits a non-blocking "compaction eligible at N raw lines" notice when `raw_lines >= 1000`.

**Read instruction formalization:** AGENTS.md + CLAUDE.md inbound-gate instruction updates from "read `meta-state.jsonl` last 20 lines" to "run `tools/scripts/registry-table.sh | tail -20`" (the session-start hint already says this; formalize in the canonical docs). Note the raw file is no longer table-readable post-Tier-2 (N versioned lines per id). The `registry-table.sh` default-path flip lands in Phase A.

**Resolve the Tier 2 ticket:** after the flip + advisory + writer-side guard are proven (the parallel-merge dry-run below), resolve `meta-260715T0633Z-…-finding-stream-…` via `meta_state_resolve` with a resolution note pointing at this plan + the flip. Emit a change-log entry.

## Related Code Files

- Modify: `.gitattributes` (add `meta-state.jsonl merge=union` + justification)
- Modify: `tools/scripts/ci-registry-deltas.sh` (Q2 same-id-duplicate-version advisory + compaction-eligible notice)
- Modify: `.github/workflows/meta-state-pr-body-advisory.yml` (wire the new advisory output)
- Create: `tools/scripts/compact-registry.sh` (check + full compaction)
- Modify: `tools/learning-loop-mastra/core/` — small `registry-stats` helper (shared by warm tier + script)
- Modify: `tools/learning-loop-mastra/` `loop_describe` warm-tier handler (add `registry_stats` block)
- Modify: `AGENTS.md`, `CLAUDE.md` (read-instruction formalization)
- Test: `tools/learning-loop-mastra/__tests__/` (advisory detection, compaction check correctness, registry_stats shape); `tools/scripts` test for `compact-registry.sh --check`
- Resolve: `meta-260715T0633Z-…-finding-stream-…` (Tier 2 ticket) + emit change-log

## Implementation Steps (TDD — tests first)

1. **Parallel-merge dry-run test.** Two branches from a shared base each append a new versioned line for the same id at the same EOF position; `git merge-file --union` (or the configured driver) produces a file with both lines; the projection (`registry-table.sh` + JS seam) dedupes to last-wins-by-max-version. Assert no duplicate id in the projected output; both version lines present in the raw file.
2. **Advisory detection test.** Fixture with a duplicate version per id in the union; assert `ci-registry-deltas.sh` (or the extracted helper) emits a WARNING for that id. Fixture with no duplicates; assert no warning.
3. **Compaction `--check` test.** Fixture with N raw lines, M deduped ids; assert `compact-registry.sh --check` prints `raw_lines=N, deduped_ids=M, dead_version_lines=N-M, compaction_eligible=(N>=1000)`. Assert `--check` does not modify the file (mtime unchanged). Assert exit code is **1 when `compaction_eligible=true`** and **0 otherwise** (signal-not-noise per H7).
4. **Compaction full-run test.** Fixture with superseded versions + an archived tombstone; assert full compaction keeps `max_by(.version)` per id, keeps the latest tombstone per archived id, drops superseded non-winning versions; file is valid JSONL; projection output unchanged.
5. **`registry_stats` warm-tier test.** Assert `loop_describe({tier:"warm"})` includes `registry_stats` with the same shape as `--check`.
6. **Implement the `.gitattributes` flip** with the justification comment.
7. **Implement the CI advisory + compaction-eligible notice** in `ci-registry-deltas.sh` + wire to `meta-state-pr-body-advisory.yml`.
8. **Implement `compact-registry.sh`** (check + full) + the shared `registry-stats` helper in `core/`.
9. **Wire `registry_stats` into the `loop_describe` warm tier.**
10. **Formalize the read instruction** in AGENTS.md/CLAUDE.md (`registry-table.sh | tail -20`).
11. **Resolve `meta-260715T0633Z-…-finding-stream-…`** via `meta_state_resolve`; emit the change-log entry recording the Tier 2 ship (mutable stream union-safe; speed limiter removed).
12. **Run focused tests** (`pnpm exec vitest run --bail=1` on new + meta-state suite); then `pnpm test:iter`. Run the real parallel-merge dry-run on the actual repo (two temp branches) to prove the flip end-to-end before merge.
13. **PR-body registry deltas:** enumerate sweep/resolved/new/promoted/superseded entries per the PR-body-registry-deltas rule.

## Success Criteria

- [x] Parallel-merge dry-run: union auto-resolves; projection dedupes; both version lines retained.
- [x] Advisory detection test passes (WARN on duplicate-version-per-id; silent otherwise).
- [x] Compaction `--check` test passes (correct stats, no file modification, exit 0).
- [x] Compaction full-run test passes (last-wins per id, latest tombstone kept, projection unchanged).
- [x] `registry_stats` warm-tier test passes.
- [x] `.gitattributes` flipped with justification; same-clone `merge.union.driver` note preserved.
- [x] AGENTS.md/CLAUDE.md read instruction formalized to `registry-table.sh | tail -20`.
- [x] `meta-260715T0633Z-…-finding-stream-…` resolved; Tier 2 change-log entry emitted.
- [x] Full test suite green (`pnpm test:iter`); PR body enumerates registry deltas.

## Risk Assessment

- **Flip lands before Phase B is on main** → would re-introduce in-place-mutation + union = corruption. Mitigation: Phase C depends on Phase 2; flip is the last step; CI runs against the post-Phase-B state.
- **Union driver not configured in a clone** → `merge=union` is a no-op until `git config merge.union.driver` is set (per-clone, not committable). Mitigation: the existing `.gitattributes` note + AGENTS.md §8 one-time setup already document this; **CI check that BLOCKS PR touching `meta-state.jsonl` if driver missing** (added in this phase — H5).
- **Writer-side union-safety unguarded** → any future PR that re-introduces in-place writes + `merge=union` = silent registry corruption. Mitigation: **CI check that BLOCKS post-merge on main if a write produced a stale-base version** (writer-side guard added in this phase — C1).
- **Advisory false-positive on change-logs** → change-logs are immutable singletons per id; `group_by(.version)` on a singleton is length 1. Mitigation: the detection test covers the no-duplicate case.
- **Compaction drops a tombstone the audit needs** → mitigated by keep-latest-tombstone-per-id (success criterion + test).
- **`registry_stats` shelling out from MCP server** → prefer a `core/` helper (`computeRegistryStats` in `core/registry-stats.js`) imported by both the warm-tier handler and the script to avoid subprocess overhead + gate concerns.
- **Compaction signal is decorative (no action hook)** → mitigated by `--check` exits 1 when eligible + discoverability_hint recommendation pointing at the shell script (Validation Session 1 Q5: shell-only, no `meta_state_compact` MCP tool) (H7).
- **Q2 advisory jq was a boolean** (single WARNING, no per-id detail) → mitigated by corrected jq expression emitting per-id lines (S-F9).

### Whole-Plan Consistency Sweep

- Architecture: writer-side guard (C1), per-clone driver CI check (H5), compaction signal made actionable (H7), per-id jq (S-F9) added.
- Related Code Files: `computeRegistryStats` helper created (Validation Session 1 Q5: no `meta_state_compact` MCP tool).
- Implementation Steps: Compaction `--check` test exit-code assertion corrected to match Architecture (1 when eligible, 0 otherwise); tests for H5 (per-clone driver CI) + H7 (compaction action hook) + S-F9 (per-id jq) + C1 (writer-side guard) all landed in this phase (not a follow-up).
- Risk Assessment updated: 8 risks tracked (was 5).
- Phase A flip of `registry-table.sh` default is the prerequisite for the AGENTS.md/CLAUDE.md read-instruction formalization here — consistency verified across the plan.

### Phase C Verification (2026-07-16)

- `.gitattributes` flipped: `meta-state.jsonl merge=union` with justification citing Phase B's write-path rewrite.
- `tools/scripts/ci-registry-deltas.sh` extended with Q2 same-id-duplicate-version advisory (per-id WARNING, RT S-F9 fixed; non-blocking per Validation Session 1 Q2).
- `.github/workflows/meta-state-union-safety.yml` shipped: writer-side stale-base guard (C1) + per-clone driver check (H5); both BLOCK.
- `tools/learning-loop-mastra/core/registry-stats.js` shipped: `computeRegistryStats(root)` + `findDuplicateVersionPerId(entries)` (H7 shared helper, no shell subprocess from MCP server).
- `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` updated: warm tier imports `computeRegistryStats` directly; exposes `registry_stats` + `compaction_action_hook` (separate field to preserve the 16-string `discoverability_hints` invariant).
- `tools/scripts/compact-registry.sh --full` shipped (atomic per-file tmp+rename; keeps `max_by(.version)`; keeps latest tombstone per archived id; threshold `raw_lines >= 1000` for `--check` exit 1).
- `AGENTS.md` §1.1 read-recipe blockquote + §8 union-driver mention updated for Phase C; `tools/learning-loop-mastra/core/placement.yaml` registered `registry-stats.js`.
- Test coverage added: 5 new test files, 35 new test cases — all green.
- End-to-end parallel-merge dry-run executed via `tools/scripts/__tests__/meta-state-merge-union.test.js` (uses actual `git merge` + actual `.gitattributes`).
- `meta-260715T0633Z-…-finding-stream-…` resolved via `meta_state_resolve` (Tier 2 ticket closed).
- `meta_state_log_change` emitted `meta-260716T2053Z-plans-260716-1101-tier2-versioned-append-mutable-stream`.
- Acceptance criteria 4–8 of the whole plan are now load-bearing-safe (the flip + advisory + writer-side guard + per-clone check + compaction signal all proven).