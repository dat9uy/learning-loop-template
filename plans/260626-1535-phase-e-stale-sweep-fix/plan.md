---
title: "Phase E Plan 7 Fix: corrective batch + sweep-success assertion + audit + docs"
description: "Fix the broken state from Plan 7 (260626-0720): 12 entries (10 mc=true + 2 mc=null) still stale after the 1186c33 commit. Apply corrective batch with `status: active` + `acked_at` to persist past `checkStaleness`. Add sweep-success assertion to cold-tier test. Investigate audit-log gap (direct file write between amends). Correct the change-log entry, journal, and plan.md to match actual sequence and root cause."
status: pending
priority: P2
branch: "phase-e/plan-3-housekeeping"
tags: [phase-e, housekeeping, registry-lifecycle, stale-sweep-fix, sp2-grounding, batch, audit-gap, test-enhancement]
blockedBy: [260626-0720-phase-e-stale-sweep]
blocks: []
created: "2026-06-26T08:37:22.258Z"
createdBy: "ck:plan"
source: skill
---

# Phase E Plan 7 Fix

> **Source:** `plans/reports/code-reviewer-260626-1433-phase-e-plan-7-stale-sweep-report.md` (3 critical + 1 important finding) + `plans/reports/debugger-260626-1445-phase-e-plan-7-stale-sweep-root-cause-report.md` (Q1-Q3 + Q4 audit-gap).
> **Predecessor plan:** Plan 7 (`plans/260626-0720-phase-e-stale-sweep/plan.md`, status=done in CLI but ACTUAL state has 12 stale entries).
> **Sibling plans:** Plan 4 (`260626-0930-phase-e-mastra-code-validation`), Plan 5 (`hardening-r2-lim3-lim4`) — both parallel.
> **Operator decisions captured:** (1) chronic-re-stale policy = set `acked_at` on transition (not raise window, not change `checkStaleness`); (2) include 2 mc=null entries in this plan (not defer to Plan 8).

## Overview

Plan 7 (`1186c33`) shipped with 12 of its 14 swept entries still `status: stale`. Root cause: `checkStaleness` (`meta-state-sweep-tool.js:25-36`) re-stales `status: "active"` entries whose `acked_at || created_at` exceeds `STALENESS_WINDOW_MS` (7 days). The agent's verification sweeps (run at 07:31:24 and 07:41:19 UTC) re-staled the entries the batch had just activated, and a final direct file edit (between amend 1 and amend 2, not in gate-log) re-applied the stale state for the commit.

This plan fixes the broken state without changing `checkStaleness` semantics: corrective batch sets `status: "active"` + `acked_at` (saturated to the batch timestamp). Future `meta_state_sweep` calls will then use `acked_at` instead of `created_at` for the 9 stale-by-age entries, keeping them active.

Also addresses: test gap (cold-tier regression test doesn't validate sweep success); audit-log gap (the direct file write bypassed MCP tools); documentation inaccuracies (journal misattributes root cause to `checkExpiry` vs the actual `checkStaleness`).

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [GroundingAndBatch](./phase-01-groundingandbatch.md) | Pending | All 10 mc=true entries' `evidence_code_ref` files exist + fingerprints match; corrective batch applied; `meta_state_list --status stale` returns ≤ 1; 2 mc=null entries filed as separate finding |
| 2 | [SweepSuccessAssertion](./phase-02-sweepsuccessassertion.md) | Pending | Cold-tier regression test GREEN with new assertion; assertion FAILS against pre-fix state (proves teeth) |
| 3 | [AuditGapInvestigation](./phase-03-auditgapinvestigation.md) | Pending | Audit-log gap mechanism identified (direct Write tool call or unlogged MCP path); recommendation filed as meta-state finding |
| 4 | [DocumentationCorrection](./phase-04-documentationcorrection.md) | Pending | New change-log entry with `supersedes` field filed; journal rewritten with `checkStaleness` mechanism + full sequence; Plan 7 footer corrected |
| 5 | [VerifyAndCommit](./phase-05-verifyandcommit.md) | Pending | Cold-tier + pnpm test GREEN; conventional commit filed; intended files-only diff confirmed |

## Scope Inventory (12 entries — verified 2026-06-26)

| # | Entry id | mc | evidence_code_ref | Issue | Strategy |
|---|----------|-----|-------------------|-------|----------|
| 1 | `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois` | true | `core/gate-logic.js#splitSegments` | created_at 20d | acked_at |
| 2 | `meta-260609T1206Z-handoff-md-the-2026-06-09-mcp-server-stale-code-problem-sect` | true | `docs/mcp-server-restart-protocol.md` | created_at 17d; fingerprint already refreshed | acked_at |
| 3 | `meta-260613T0138Z-vnstock-device-slot-ledger-converted` | true | `scripts/convert-ledger-to-sidecar.mjs` | created_at 13d | acked_at |
| 4 | `meta-260613T1615Z-import-chain-analysis-is-the-canonical-dead-code-detection-m` | true | `core/gate-logic.js#applyPromotedRules` | created_at 13d; has `promoted_to_rule` | acked_at |
| 5 | `meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi` | true | `tools/legacy/meta-state-patch-tool.js` | created_at 12d | acked_at |
| 6 | `meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n` | true | `core/gate-logic.js#GLOB_SCOPE_WHITELIST` | created_at 11d | acked_at |
| 7 | `meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc` | true | `core/gate-logic.js#stripNodeEvalBody` | created_at 11d | acked_at |
| 8 | `meta-260616T0222Z-inbound-gate-js-still-contains-a-local-ttl-based-staleness-c` | true | `hooks/legacy/inbound-gate.js#findStaleObservations` | created_at 10d | acked_at |
| 9 | `meta-260616T1453Z-two-more-dead-write-path-entries-in-write-path-patterns-at-t` | true | `core/gate-logic.js#WRITE_PATH_PATTERNS` | created_at 10d | acked_at |
| 10 | `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` | true | `mastra/create-loop-tool.js` | created_at 8d | acked_at |
| 11 | `meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met` | null | (none — not grounded) | created_at 20d; never grounded | **separate decision: file new finding for grounding** |
| 12 | `meta-260614T1236Z-no-automated-registry-consistency-check-exists-to-detect-ent` | null | (none — not grounded) | created_at 12d; never grounded | **separate decision: file new finding for grounding** |

**Note on entries 11-12:** Both have `mechanism_check: null` (never grounded). Operator chose to include them in this plan, but they cannot be transitioned to `active` cleanly because they have no `evidence_code_ref`. Recommend Phase 1 Step 1 reports these as a separate finding rather than including them in the corrective batch. The plan will document the decision but defer the actual transition for entries 11-12 to a follow-up if operator agrees.

## Resolved Design Decisions

| # | Decision | Source | Rationale |
|---|----------|--------|-----------|
| D1 | Set `acked_at` on transition (not raise window, not change `checkStaleness`) | Operator decision 2026-06-26 | Surgical, audit-friendly, backwards-compatible. `acked_at` becomes the staleness reference, superseding `created_at`. |
| D2 | Include mc=null entries in scope | Operator decision 2026-06-26 | Closes registry debt completely. But flagged for separate handling since they're not grounded. |
| D3 | Single atomic `meta_state_batch` for the corrective transition | Plan 1 D10 + Plan 7 D1 | Single lock, single cache invalidation, all-or-nothing rollback. |
| D4 | Per-op CAS via `_expected_version` | Plan 1 + Plan 3 + Plan 7 D5 | Catches concurrent writers between read and batch. |
| D5 | Add sweep-success assertion to existing cold-tier test (not new test) | KISS + DRY | Test already iterates `mechanism_check=true` findings. Adding 1 assertion is minimal change. |
| D6 | Audit-gap investigation is read-only (no fix in this plan) | Scope discipline | Investigation identifies the mechanism + writes recommendation; fixing the audit gap may touch core code and warrants its own plan. |
| D7 | Correct journal to match actual sequence + checkStaleness mechanism | Review F2 + Debug Q3 | Journal currently misattributes to `checkExpiry`; rewrite for accuracy. |
| D8 | Amend the existing change-log entry (not supersede) | meta-state patch schema | change-log entries are immutable; the corrective work goes in a NEW change-log entry that references the original. |
| D9 | Branch name stays on `phase-e/plan-3-housekeeping` (the working branch) | Plan naming convention | The fix is part of Plan 7's follow-up; same branch as the parent housekeeping work. |

## Open Items

- **OO1 — Entries 11-12 (mc=null) are not grounded.** Cannot transition `status: active` cleanly because `checkGrounding` requires `evidence_code_ref`. Phase 1 will surface this in the precondition probe and document a follow-up finding.
- **OO2 — The chronic-re-stale semantic change is invisible to operators.** Future sweeps will use `acked_at` instead of `created_at` for the 12 transitioned entries. This is the intended behavior, but should be called out in the journal for future readers.
- **OO3 — Audit-log gap root cause is unknown until Phase 3 investigates.** The plan defers fixing the gap to a follow-up plan; this plan only documents the gap.

## Risks and Tradeoffs

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | Direct file write in current state bypasses MCP tools and gate-log | Medium | Phase 3 investigates the mechanism. The corrective batch is via `meta_state_batch` (logged). |
| R2 | Concurrent writer between read and batch (CAS mismatch) | Low | D4: per-op CAS; retry once with fresh version |
| R3 | Cold-tier test enhancement has false positives (other plans legitimately leave stale entries) | Medium | Phase 2 design: assertion checks `mc=true + mc=null` stale count, with threshold based on baseline (was 12 pre-fix, target ≤ 1). Test runs against current state so it's self-correcting. |
| R4 | Operator-supplied ISO timestamp `last_verified_at`/`acked_at` drifts from server time | Very Low | Use `date -u +"%Y-%m-%dT%H:%M:%S.000Z"` (server local); audit via `meta_state_list` shows consistent timestamp |
| R5 | `acked_at` semantic stretch (re-acking entries that were never operator-acked) | Low | Documented in journal as deliberate policy choice; audit fields (`created_at`) preserved |
| R6 | Entries 11-12 cannot be transitioned cleanly (no `evidence_code_ref`) | Low | Phase 1 surfaces this; documented as separate finding; not in corrective batch |
| R7 | Audit-gap investigation reveals a deeper system issue (e.g., unlogged write path) | Medium | Phase 3 is scoped to investigation + recommendation; fixes are out of scope for this plan |

## Verification (how to test the change is right)

1. Phase 1's inline inventory table shows 12 entries with id, mc, evidence_code_ref, current fingerprint, acked_at strategy
2. Phase 1's `meta_state_list --status stale` returns 0 (or 1 if mc=false leftover is preserved) after the batch
3. Phase 2's cold-tier regression test GREEN with new sweep-success assertion
4. Phase 2's test FAILS when run against the pre-fix state (verifies the assertion actually catches the regression)
5. Phase 3's audit-gap report identifies the mechanism + writes a follow-up recommendation
6. Phase 4's change-log entry references the original + corrects the reason
7. Phase 4's journal replaces `checkExpiry` misattribution with `checkStaleness` mechanism
8. Phase 5's `pnpm test` GREEN across 13 namespaces
9. `git diff --stat tools/learning-loop-mastra/` shows only test changes; no production code modifications outside the test
10. `git log -1` shows the conventional commit message

## Cross-references

- Code review: `plans/reports/code-reviewer-260626-1433-phase-e-plan-7-stale-sweep-report.md`
- Debug report: `plans/reports/debugger-260626-1445-phase-e-plan-7-stale-sweep-root-cause-report.md`
- Predecessor plan: `plans/260626-0720-phase-e-stale-sweep/plan.md` (status=done in CLI; broken state)
- Predecessor journal: `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` (to be corrected in Phase 4)
- Predecessor change-log: `meta-260626T1432Z-plans-260626-0720-phase-e-stale-sweep-plan-md` (to be superseded in Phase 4)
- Plan 1 (D10 batch atomicity precedent): `plans/260624-2335-phase-e-foundation/plan.md`
- Plan 3 (D7 stale→active precedent): `plans/260626-0607-phase-e-housekeeping/plan.md`
- Core mechanics:
  - `tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js:25-36` (checkStaleness)
  - `tools/learning-loop-mastra/core/meta-state.js:516-610` (metaStateBatch)
  - `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js:67-100` (existing test)
- Audit logs to consult:
  - `.claude/coordination/gate-log.jsonl` (all MCP tool calls)
  - `.claude/coordination/.gate-decision.log` (gate decisions)
  - `git reflog` (commit timestamps)

---

**Status:** Pending — awaiting operator approval of design decisions + phase structure. Operator has confirmed chronic-re-stale policy (D1) and mc=null scope (D2).
