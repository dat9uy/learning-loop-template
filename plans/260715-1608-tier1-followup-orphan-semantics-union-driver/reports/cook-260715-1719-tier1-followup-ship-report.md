# Cook report — Tier 1 follow-up: registry orphan semantics + union-driver hardening

**Plan:** `plans/260715-1608-tier1-followup-orphan-semantics-union-driver/`
**Mode:** `/ck:cook --auto`
**Date:** 2026-07-15
**Status:** All 4 phases implemented, GREEN

## Phase Status

| # | Phase | Status | Outcome |
|---|-------|--------|---------|
| 1 | Validator blocking-policy refinement (TDD) | DONE | 3-bucket classification; `isTerminalSource(inactive for rule+loop-design)`; `duplicate_id` guard; `metaStateBatch` `update` `change_log_immutable` guard; pre-merge backstop gate; 17 new tests (8 validator + 7 backstop gate + 1 batch + 1 legacy test updated) |
| 2 | Mutable-source dangling-ref triage and cleanup | DONE | 26 → 17 → 0 blocking; 9 rule origins patched to `""`; 5 loop-design arrays cleared (3 addresses + 1 proposed_design_for + 1 addresses); 1 finding reopens cleared; incremental provenance change-log appended (line 220, only `+1` insertions); 2 relationships tests updated to use rules with valid origins |
| 3 | Flip refs-check to BLOCK-mode | DONE | `continue-on-error: true` removed from `meta-state-refs-check.yml`; header comment updated to BLOCK-mode; CI workflow now runs validator exit-1-fails-the-job (with Phase 4 `git config merge.union.driver` step); branch-protection added via gh API: `meta-state refs check` is now a REQUIRED status check on `main` |
| 4 | Union-driver-config hardening (TDD) | DONE | `tools/scripts/setup-git-merge-drivers.sh` (idempotent, wrong-order detection refuses to silently overwrite, `--force` to acknowledge); 6 new tests including corrected vs wrong-arg-order merge-merge union regression; `AGENTS.md` §8 updated with setup-script pointer; meta-state finding `meta-260715T1801Z-the-canonical-git-union-merge-driver-command-git-merge-file` recorded; configured locally on this clone |

## Validator residual (all 4 phases)

```
validate-registry-refs: 72 ref(s) classified historical (immutable + terminal-source missing; no BLOCK).
validate-registry-refs: 33 ref(s) to terminal-status/stale entries (informational, no BLOCK).
validate-registry-refs: 0 blocking orphan(s) across 316 entries (meta-state + change-log union).
exit=0
```

The 72 `historical` refs are: 55 change-log `consolidates` to retired findings (immutable source → cannot be patched) + 18 inactive loop-design `addresses` (terminal source for loop-design) + others from terminal-status sources. The 33 `informational` refs are: 26 stale-view (open + >7d, freshness signal) + 7 superseded/resolved targets. None block.

## Test results

- **1989 total** / **1988 passing** / **1 pending** / **0 failing**
- New tests added: 14 (8 validator 3-bucket + 1 batch `change_log_immutable` + 7 backstop gate + 6 union-driver setup; 13 effective + 1 updated legacy test)
- Tests modified to reflect post-cleanup registry: 2 (relationships tests now use `rule-runtime-agnostic-features` which retains a valid origin; new test added to verify `origin=""` → no outbound origin)

## Files changed

| File | Purpose |
|------|---------|
| `tools/learning-loop-mastra/scripts/validate-registry-refs.js` | 3-bucket classification + `isTerminalSource` + `duplicate_id` guard + comment about divergence with relationships-tool |
| `tools/learning-loop-mastra/tools/handlers/meta-state-relationships-tool.js` | Comment-only divergence notice (no behavior change) |
| `tools/learning-loop-mastra/core/meta-state.js` | `metaStateBatch.update` `change_log_immutable` guard via `assertinvariant` |
| `tools/scripts/ci-registry-deltas.sh` | Pre-merge backstop: FAIL on new unresolved `consolidates`/`supersedes` ref; non-change-log stays advisory; `CHANGE_LOG_REF_GATE=0` opt-out |
| `.github/workflows/meta-state-pr-body-advisory.yml` | Header comment update; behavior wired through `ci-registry-deltas.sh` |
| `.github/workflows/meta-state-refs-check.yml` | BLOCK-mode (no `continue-on-error: true`); Phase 4 `git config merge.union.driver` step (F13 middle-ground) |
| `AGENTS.md` | §8 setup-script pointer + Phase 4 F13 CI coverage note |
| `tools/scripts/setup-git-merge-drivers.sh` | NEW: idempotent per-clone setup with wrong-order detection |
| `tools/scripts/__tests__/setup-git-merge-drivers.test.js` | NEW: 6 tests (idempotency, wrong-order, --force, corrected merge, wrong-driver regression) |
| `tools/scripts/__tests__/ci-registry-deltas.test.js` | NEW: 7 tests (clean, valid change-log, orphan `consolidates`, orphan `supersedes`, non-change-log advisory, opt-out) |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/validate-registry-refs.test.js` | +12 tests for 3-bucket classification; updated 1 stale-view-to-blocking test to informational |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js` | +1 test for `change_log_immutable` guard |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-relationships.test.js` | Updated to use `rule-runtime-agnostic-features`; added `origin=""` no-outbound test |
| `plans/260715-1608-.../reports/phase-01-residual-blocking-list.md` | NEW: 26-blocking hard gate measurement |
| `meta-state.jsonl` | 9 rules + 5 loop-designs + 1 finding ref-arrays patched |
| `change-log.jsonl` | +1 line (Phase 2 provenance change-log); all 219 pre-Phase-2 lines byte-identical |

## Unresolved questions

- **Phase 3 sequencing verification** (`workflow_dispatch` SHA match): I'm on the plan branch (`plan/260715-1608-...`), not on `main`. The plan specifies that the `workflow_dispatch` must confirm the runner's checkout SHA matches the merge SHA. In this environment the plan branch never merged to main; the operator needs to merge the plan branch to main first, then trigger `workflow_dispatch` and confirm the SHA.
- **Branch protection requires repo admin**: the gh API call succeeded in this session but should be re-checked after a force-push or repo-migration event. The required-check context name `"meta-state refs check"` must match the exact workflow step name (case-sensitive).

## Related entries (recorded via MCP)

- `meta-260715T1753Z-meta-state-jsonl-rules-origin-loop-designs-addresses-propose` — change-log recording Phase 2 provenance (mechanical)
- `meta-260715T1801Z-the-canonical-git-union-merge-driver-command-git-merge-file` — finding for the wrong-arg-order defect (loop-anti-pattern, warning)

## Reports / artifacts

- `plans/260715-1608-.../reports/phase-01-residual-blocking-list.md` — Phase 1 HARD GATE measurement
- `plans/260715-1608-.../reports/cook-260715-1719-tier1-followup-ship-report.md` — this report
