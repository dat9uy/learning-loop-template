---
phase: 3
title: "Phase C: gitattributes Flip + CI Advisory + Compaction Signal"
status: pending
priority: P1
dependencies: [2]
---

# Phase 3: Phase C — gitattributes Flip + CI Advisory + Compaction Signal

## Overview

Flip `.gitattributes` to enable `merge=union` on `meta-state.jsonl` — the load-bearing mechanical fix that removes the operator's parallel-resolve speed limiter. Add the Q2 same-id-concurrent-mutation CI advisory (pre-merge WARNING, both version lines retained). Ship the compaction signal (`compact-registry.sh --check` + `loop_describe` warm-tier `registry_stats` + CI notice) so the operator and agent runtime know when to compact. Formalize the read instruction in AGENTS.md/CLAUDE.md. Lands only after Phase B is on main and green.

## Requirements

- **Functional:** `meta-state.jsonl merge=union` in `.gitattributes`; two branches that each mutate the same id auto-merge via union; projection dedupes to last-wins; CI advisory surfaces duplicate-version-per-id as a WARNING (no block). `compact-registry.sh --check` reports `raw_lines`, `deduped_ids`, `dead_version_lines`, `compaction_eligible` (threshold `raw_lines >= 1000`). `loop_describe({tier:"warm"})` includes a `registry_stats` block with the same shape.
- **Non-functional:** advisory is non-blocking (WARN only); compaction script is read-only in `--check` mode; the full compaction run rewrites the file keeping `max_by(.version)` per id (keep-latest-tombstone per id for audit completeness). Same-clone `git config merge.union.driver` setup already documented in `.gitattributes`.

## Architecture

**`.gitattributes` flip:** replace the current forbidding comment for `meta-state.jsonl` with `meta-state.jsonl merge=union` and a justification noting the Phase B write-path rewrite made it safe (mutations are appends, no line replacement; versioned dedupe handles same-id concurrent mutations). Keep the existing `runtime-state.jsonl` + `change-log.jsonl` lines and the `git config merge.union.driver` setup note.

**CI advisory (Q2):** extend `tools/scripts/ci-registry-deltas.sh` (already id-aware, advisory-only) with a same-id-duplicate-version check over the union of `meta-state.jsonl` + `change-log.jsonl`:
```
jq -s 'group_by(.id) | map(group_by(.version) | map(length)) | map(any(. > 1)) | any' meta-state.jsonl change-log.jsonl
```
Emit a WARNING line per affected id when triggered; both version lines stay in the file (audit-complete, nothing silently lost). Wire into `meta-state-pr-body-advisory.yml` (pre-merge). Post-merge BLOCK for relationship orphans already shipped in Tier 1 follow-up — not re-done here.

**Compaction signal (DRY: one stats helper, three surfaces):**
- `tools/scripts/compact-registry.sh`: `--check`/`--dry-run` prints `{ raw_lines, deduped_ids, dead_version_lines, compaction_eligible }` and exits 0 (eligible prints a notice to stderr, still exit 0 — non-blocking). Full run (no `--check`) rewrites `meta-state.jsonl` keeping `max_by(.version)` per id, keeping the latest tombstone per archived id (audit completeness), under the per-root write discipline. Mirrors `registry-table.sh` (jq pipe, read-only in check mode) + `persistRegistryAtomic` (tmp+rename) shape.
- `loop_describe` warm tier: add a `registry_stats` block computed by the same helper (expose a small function in `core/` that `loop-introspect` + the script both call, or have the script be the single source and the warm tier shell out — pick whichever the codebase finds natural; prefer a `core/` helper imported by both to avoid shelling out from the MCP server).
- CI: the advisory workflow emits a non-blocking "compaction eligible at N raw lines" notice when `raw_lines >= 1000`.

**Read instruction formalization:** AGENTS.md + CLAUDE.md inbound-gate instruction updates from "read `meta-state.jsonl` last 20 lines" to "run `tools/scripts/registry-table.sh | tail -20`" (the session-start hint already says this; formalize in the canonical docs). Note the raw file is no longer table-readable post-Tier-2 (N versioned lines per id).

**Resolve the Tier 2 ticket:** after the flip + advisory are proven (the parallel-merge dry-run below), resolve `meta-260715T0633Z-…-finding-stream-…` via `meta_state_resolve` with a resolution note pointing at this plan + the flip. Emit a change-log entry.

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
3. **Compaction `--check` test.** Fixture with N raw lines, M deduped ids; assert `compact-registry.sh --check` prints `raw_lines=N, deduped_ids=M, dead_version_lines=N-M, compaction_eligible=(N>=1000)` and exits 0. Assert `--check` does not modify the file (mtime unchanged).
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

- [ ] Parallel-merge dry-run: union auto-resolves; projection dedupes; both version lines retained.
- [ ] Advisory detection test passes (WARN on duplicate-version-per-id; silent otherwise).
- [ ] Compaction `--check` test passes (correct stats, no file modification, exit 0).
- [ ] Compaction full-run test passes (last-wins per id, latest tombstone kept, projection unchanged).
- [ ] `registry_stats` warm-tier test passes.
- [ ] `.gitattributes` flipped with justification; same-clone `merge.union.driver` note preserved.
- [ ] AGENTS.md/CLAUDE.md read instruction formalized to `registry-table.sh | tail -20`.
- [ ] `meta-260715T0633Z-…-finding-stream-…` resolved; Tier 2 change-log entry emitted.
- [ ] Full test suite green (`pnpm test:iter`); PR body enumerates registry deltas.

## Risk Assessment

- **Flip lands before Phase B is on main** → would re-introduce in-place-mutation + union = corruption. Mitigation: Phase C depends on Phase 2; flip is the last step; CI runs against the post-Phase-B state.
- **Union driver not configured in a clone** → `merge=union` is a no-op until `git config merge.union.driver` is set (per-clone, not committable). Mitigation: the existing `.gitattributes` note + AGENTS.md §8 one-time setup already document this; verify in the dry-run.
- **Advisory false-positive on change-logs** → change-logs are immutable singletons per id; `group_by(.version)` on a singleton is length 1. Mitigation: the detection test covers the no-duplicate case.
- **Compaction drops a tombstone the audit needs** → mitigated by keep-latest-tombstone-per-id (success criterion + test).
- **`registry_stats` shelling out from MCP server** → prefer a `core/` helper imported by both the warm-tier handler and the script to avoid subprocess overhead + gate concerns.