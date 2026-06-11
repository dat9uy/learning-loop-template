---
title: "Cold-session probe: fail-to-finding conditional emission"
description: "Refactor cold-session-discoverability.test.cjs (L1 test 3, L2 test 5) and claude-code-mcp-loading.test.cjs to write a meta-state finding only on novel failure. Pass path: write nothing. Fail path: dedup-write via tryClaimSessionId. Remove the soft-delete-on-gap-close branch. Migrates the 9 stale mcp-client-loading entries to a single change-log via meta_state_supersede. Implements the loop-design loop-design-cold-session-fail-to-finding-conditional-emission and ships with TDD coverage: a regression-guard test asserting the probe does NOT write to meta-state.jsonl on pass."
status: completed
priority: P2
branch: "main"
tags: ["meta-state", "test", "conditional-emission", "tdd", "self-model"]
blockedBy: []
blocks: []
created: "2026-06-11T13:12:02.538Z"
createdBy: "ck:plan"
source: skill
---

# Cold-session probe: fail-to-finding conditional emission

## Overview

The cold-session test currently writes a `finding` to `meta-state.jsonl` on every gap-open run (deduped by `(session_id, subtype, runtime, layer)` via `tryClaimSessionId`) and soft-deletes it on every gap-close run. The result is 9 stale historical entries (plus 8 archived + 1 resolved pre-terminal entries) that are *test-execution events* being logged as *self-knowledge*, conflating "I ran" with "I learned something."

> **Red-team correction (Finding 5, Finding 9):** The "18 historical entries" framing is a misstatement of the actual registry state. Verified count from `meta-state.jsonl`: 8 are `archived` (lines 18, 60, 61, 487, 488, 501, 502, 506), 1 is `resolved` (line 58, the `meta-260608T1410Z-...` correction finding), 1 is `stale` (line 43, claude-code probe), and 8 are `stale` (lines 519, 523, 526-531, cold-session L2). The 9 stale entries (8 cold-session L2 + 1 claude-code) are the migration target. The 8 archived + 1 resolved entries are pre-existing terminal states and require no migration.

This plan implements the conditional-emission refactor in `plans/reports/problem-solving-260611-1300-cold-session-fail-to-finding-promotion.md` (the operator-approved counter-proposal to the channel-split plan in `plans/reports/problem-solving-260611-1220-meta-state-evidence-channel-split.md`, which is now `status: superseded`).

**The one insight**: a passing test is not evidence; a failing test is a finding. The test runner's pass/fail exit code is the authoritative signal; the registry's role is to capture *what was learned* from a failure, not to log the test's existence.

**One insight, eight eliminations** (the cascade):
- Eliminates the 9-stale-entry pollution pattern (entries are born on failure only; on a healthy CI run, the test writes zero registry entries).
- Eliminates the soft-delete-on-gap-close branch (replaced by a single `meta_state_resolve` call on the active finding when the gap closes; this preserves the rule's "no active findings" invariant).
- Eliminates the `status: "stale"` lifecycle misuse as a test-cleanup signal.
- Eliminates the dead reference chain (no chain; the test event doesn't reference a parent finding).
- Eliminates the temporal race on a "live parent" (the test is its own parent).
- Eliminates the `entry_kind: "probe-evidence"` schema migration (no new entry_kind).
- Eliminates the parallel `records/meta/probe-evidence/` JSONL channel (the test runner's stdout IS that channel).
- Eliminates the slug bloat cascade urgency (slugs only exist on failure paths, which are rare).

**Implements the loop-design**: `loop-design-cold-session-fail-to-finding-conditional-emission` (active, severity: medium, affected_system: mcp-tools). This plan is the ship event for that design; on plan completion, the design's `status` flips to `inactive` and `shipped_in_plan` is set to this plan's dir.

## Goals

1. **Test refactor (TDD-first)**: `cold-session-discoverability.test.cjs` tests 3 and 5, plus `claude-code-mcp-loading.test.cjs`, emit a `finding` only on novel failure. Pass path: write nothing. Fail path: dedup-write via `tryClaimSessionId` (atomic helper, preserved). The gap-close branch calls `meta_state_resolve` on the active finding (one registry mutation per session), replacing the previous soft-delete cycle. The probe logic is extracted into `probe-helpers.cjs` as importable pure functions that accept a `root` parameter (Findings 1, 3, 8).
2. **Regression guard**: a new test imports the `probeL1`/`probeL2` helpers and asserts they do NOT write to `meta-state.jsonl` on a synthetic pass with `root=tempRoot`. This locks the conditional-emission invariant so a future contributor cannot re-introduce the conflation.
3. **Cross-CLI parity**: the same refactor applies to `claude-code-mcp-loading.test.cjs`; the claude-code probe is ported from `writeEntry + readRegistry.find` to the `probeL1` helper (eliminates a TOCTOU race; Finding 8).
4. **Migration**: the 9 stale historical `mcp-client-loading` entries (8 cold-session L2 + 1 claude-code) are superseded by a single change-log entry explaining the conditional-emission refactor. The 8 archived + 1 resolved entries are skipped (pre-existing terminal states). The migration script is operator-only (`OPERATOR_MODE=1`; Findings 6, 13) with manual idempotency (Findings 4, 12) and a registry-resident checkpoint (not a tempdir file).
5. **Loop-design closeout**: `meta_state_patch` flips `loop-design-cold-session-fail-to-finding-conditional-emission` to `status: "inactive"` with `shipped_in_plan: "plans/260611-1300-cold-session-fail-to-finding"` and `shipped_at: <now>`. The patch is preceded by a `meta_state_list` to fetch the current version, and the return value is explicitly checked (Finding 11).
6. **Rule unchanged**: `rule-cold-session-test-must-pass-before-resolution` is not modified. Its evidence contract is preserved; the predicate `subtype === "mcp-client-loading" && session_id === "test-cold-session-mcp-client-loading"` continues to gate `meta_state_resolve` on `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list`. The gap-close `meta_state_resolve` ensures no active findings persist that would block the rule.

## Non-Goals

- Building a parallel `records/meta/probe-evidence/` JSONL channel (rejected by operator review as over-engineered; see `plans/reports/problem-solving-260611-1220-meta-state-evidence-channel-split.md` for the rejected option A).
- Adding a new `entry_kind: "probe-evidence"` to the meta-state schema (the 4-kind union `finding | change-log | rule | loop-design` is the canonical partition; tests-as-evidence is the absence of a finding, not a new kind).
- Modifying `core/gate-logic.js#checkResolutionEvidence` (the rule's evidence contract stays exactly the same; only the *frequency* of test writes changes).
- Soft-deleting findings on gap-close (the registry's normal lifecycle handles cleanup; the test does not need to manage it).
- Applying the deterministic-slug cascade from `plans/reports/problem-solving-260611-0940-mcp-client-loading-slug-bloat.md` (cosmetic; low priority; the slug is naturally bounded because it only exists on failure paths).

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Test-first refactor of L1+L2 probes](./phase-01-test-first-refactor-of-l1-l2-probes.md) | Pending | 2h | P1 |
| 2 | [Migrate 9 stale historical entries](./phase-02-migrate-18-historical-entries.md) | Pending | 30m | P2 |
| 3 | [Regression guard + cross-CLI parity](./phase-03-regression-guard-cross-cli-parity.md) | Pending | 2h | P2 |
| 4 | [Journal + loop-design closeout](./phase-04-journal-loop-design-closeout.md) | Pending | 20m | P3 |

## TDD Discipline

Phase 1 is the heart of this plan. It follows strict TDD:

1. **Red**: write a failing test that asserts the cold-session probe does NOT write to `meta-state.jsonl` on a passing run. The test will fail because the current probe writes on every gap-close run (soft-delete branch) and on every gap-open run.
2. **Green**: refactor the probe to write only on novel failure. The test passes.
3. **Refactor**: clean up the code (remove the soft-delete branch, simplify the L1/L2 branches to a shared helper, ensure the dedup-via-`tryClaimSessionId` path is the only write path).
4. **Verify**: run `pnpm test` to confirm 100% pass + the regression-guard test catches a re-introduction.

The regression-guard test (Phase 3) is a *meta-test*: it asserts the conditional-emission invariant by stubbing the probe result to "pass" and verifying the registry is untouched. This catches a future contributor who re-introduces unconditional writes.

## Cross-Plan Dependencies

| Plan | Status | Relationship |
|------|--------|--------------|
| `260611-1000-remove-expired-status` (drop `expired` status enum) | done (5/5) | Independent; both plans share the `meta-260608T1522Z-...` finding id but make orthogonal changes. No `blockedBy`/`blocks`. |
| `260610-1203-cold-session-churn-and-cross-compat-fix` (TOCTOU + layer isolation) | completed | Predecessor: ships the `tryClaimSessionId` helper this plan uses. No overlap. |
| `260606-cold-session-test-rule-promotion` (initial probe design) | completed | Predecessor: ships the `rule-cold-session-test-must-pass-before-resolution` rule. This plan preserves the rule unchanged. |

## Related Loop-Design

This plan ships `loop-design-cold-session-fail-to-finding-conditional-emission` (status: active, severity: medium, affected_system: mcp-tools, created 2026-06-11T12:43:11.721Z). On plan completion, the design is patched to `status: "inactive"` with `shipped_in_plan: "plans/260611-1300-cold-session-fail-to-finding"` and `shipped_at: <now>`.

The design's `proposed_design_for` lists the three artifacts this plan modifies:
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`
- `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`
- `rule-cold-session-test-must-pass-before-resolution` (preserved unchanged; the design's `proposed_design_for` is the *target list*, not the modification list)

The design's `addresses` lists three findings this plan responds to:
- `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` (the original gap)
- `meta-260608T1410Z-finding-meta-260606t0443z-mcp-tools-not-loaded-into-agent-to` (the "premature resolution" correction)
- `meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env` (the L2-skip finding)

## Success Criteria

- [x] Phase 1: probe logic extracted into `tools/learning-loop-mcp/__tests__/probe-helpers.cjs` with `probeL1(root, opts)` and `probeL2(root, opts)` accepting a `root` parameter.
- [x] Phase 1: `cold-session-discoverability.test.cjs` tests 3 and 5 emit a `finding` only on novel failure via `tryClaimSessionId` (atomic). The gap-close branch calls `meta_state_resolve` on the active finding (one registry mutation per session). The TOCTOU-vulnerable `readRegistry + writeEntry` pattern is NOT introduced.
- [x] Phase 1: regression-guard test added (imports `probeL1`/`probeL2` from `probe-helpers.cjs`, calls with `root=tempRoot` and `gapOpen=false`, asserts registry is empty).
- [x] Phase 3: `claude-code-mcp-loading.test.cjs` is refactored to use the `probeL1` helper (replacing the `writeEntry + readRegistry.find` pattern; Finding 8).
- [x] Phase 2: 9 stale `mcp-client-loading` entries superseded by a single change-log via `meta_state_supersede` (8 archived + 1 resolved entries are skipped; Finding 5).
- [x] Phase 2: migration script aborts without `OPERATOR_MODE=1`; idempotency is enforced via a Step 2 registry lookup (not relying on `meta_state_log_change`'s non-existent idempotency; Finding 4).
- [x] Phase 3: regression-guard test in `claude-code-mcp-loading.test.cjs` mirrors the cold-session pattern.
- [x] Phase 3: `pnpm test` reports 100% pass with no new failures.
- [x] Phase 4: `meta_state_list` is called to fetch the loop-design's current version before `meta_state_patch`; the return value is explicitly checked for `patched: false` (Finding 11).
- [x] Phase 4: `meta_state_patch` flips `loop-design-cold-session-fail-to-finding-conditional-emission` to `status: "inactive"` with `shipped_in_plan: "plans/260611-1300-cold-session-fail-to-finding"`.
- [x] Phase 4: a journal entry in `docs/journals/260611-cold-session-fail-to-finding.md` records the conditional-emission refactor, the operator's pushback on the channel-split plan, and the loop-design's ship event.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Regression in test 1's L2 skip check | medium | Test 1 calls `probeL2Gap` (the L2 probe) directly; if the L2 probe stops writing on pass, test 1's skip-on-L2-gap-open behavior is unaffected (it reads `l2Result.gapClosed`, not the registry). Verify with the existing test 1 assertions after refactor. |
| The dedup-via-`tryClaimSessionId` semantics differ from current write behavior | low | `tryClaimSessionId` was designed for this exact pattern (idempotent dedup by `(session_id, subtype, runtime, layer)`). The refactor uses the same key the current code uses. Verify the test fixture in test 4 ("cold-session test soft-deletes persisted finding on gap-close") still passes; if not, update it to reflect the new "no soft-delete" invariant. |
| Future contributor re-introduces unconditional writes | medium | Phase 3's regression-guard test catches re-introduction at PR time. The test asserts the registry size is unchanged after a synthetic pass run. |
| Migration of 9 stale historical entries affects other rules | low | All 9 entries are `status: "stale"` (per the `260610-1203` churn fix; the 8 archived + 1 resolved entries are pre-existing terminal and are not migrated per Red-team Finding 5); superseding stale entries is a no-op for any active rule. Verify with `meta_state_query_drift` after migration. |
| Loop-design closeout flips the design before the rule's evidence contract is fully verified | low | Phase 3 runs `pnpm test` *before* Phase 4's loop-design closeout. The closeout is the last step. |

## Red Team Review

### Session — 2026-06-11

**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (3 lenses for 4-phase plan)
**Findings:** 15 (14 accepted, 1 rejected)
**Severity breakdown:** 4 Critical, 4 High, 6 Medium, 0 Low

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 1 code example replaces atomic `tryClaimSessionId` with TOCTOU `readRegistry + writeEntry`; predecessor plan `260610-1203` specifically fixed this race | Critical | Accept | Phase 1 Architecture + Step 1 |
| 2 | Test file uses `node:test` with no mock framework; regression-guard test cannot stub the probe as written | Critical | Accept | Phase 1 Step 1 |
| 3 | Probe hardcodes `projectRoot`; regression-guard test on `tempRoot` does not exercise the real probe | Critical | Accept | Phase 1 Step 1 (extract pure functions with `root` param) |
| 4 | `meta_state_log_change` is NOT idempotent (timestamp-based id, unconditional write); migration script's idempotency claim is false | Critical | Accept | Phase 2 Step 2 (manual idempotency via registry lookup) |
| 5 | Plan claims "all 18 are stale" but actual count is 8 archived + 1 resolved + 9 stale; superseding already-terminal entries creates double-terminal state | High | Accept | Phase 2 Step 1 (filter for `status === "stale"` only) |
| 6 | `meta_state_supersede` requires `OPERATOR_MODE=1`; plan does not document this or the role-system gap | High | Accept | Phase 2 (script-level guard) |
| 7 | "Pass path: write nothing" + "soft-delete branch removed" + "rule still gates on active findings" are mutually exclusive | High | Accept | Phase 1 Architecture (gap-close branch calls `meta_state_resolve` on active finding) |
| 8 | `claude-code-mcp-loading.test.cjs` uses `writeEntry + readRegistry.find` (TOCTOU), not `tryClaimSessionId`; cross-CLI parity claim is false | High | Accept | Phase 3 Step 2 (refactor to use `probeL1` helper) |
| 9 | 18-entry count includes 1 claude-code entry + 1 `meta-260608T1410Z-...` (no session_id) that the plan's filter would mis-handle | Medium | Accept | Phase 2 Step 1 (filter: `status === "stale" && session_id !== undefined`) |
| 10 | `applies_to.schemas: ['core/gate-logic.js#checkResolutionEvidence']` uses `#anchor` suffix inconsistent with 6 prior change-logs | Medium | Accept | Phase 2 Step 3 (use plain path) |
| 11 | `meta_state_patch` returns `version_mismatch` without throwing; plan's pseudocode does not check return value; loop-design entry has no `version` field | Medium | Accept | Phase 4 Step 2 (fetch version via `meta_state_list`, assert result) |
| 12 | Migration script's `migrated-ids.txt` checkpoint in tempdir is a data-integrity hazard (not git-tracked, OS may clean) | Medium | Accept | Phase 2 Step 4 (registry-resident marker) |
| 13 | Migration script at `scripts/migrate-cold-session-pollution.mjs` bypasses write-gate and bash-gate (neither protects `scripts/**`) | Medium | Accept | Phase 2 (operator-only guard + sibling signpost file) |
| 14 | Plan omits the operator-capture annotation that AGENTS.md documents as a forward decision | Medium | Reject | (open schema decision, not a current requirement) |
| 15 | Test 4 rewrite creates a verification ordering coupling between Phase 1 and Phase 2 (do not run `pnpm test` between commits) | Medium | Accept | Phase 1 Step 4 (explicit ordering note) |

### Whole-Plan Consistency Sweep

After applying the 14 accepted findings, the plan was re-read end-to-end. The following contradictions were resolved:

1. **Phase 1 Architecture code example vs prose**: The original code example showed `readRegistry + early return + writeEntry`; the prose said "uses `tryClaimSessionId`." The corrected Architecture section now shows the gap-open branch as UNCHANGED (preserves atomic helper) and the gap-close branch as a single `meta_state_resolve` call. The contradiction is resolved by Finding 1 + Finding 7.

2. **"18 entries" framing vs actual count**: The Overview, Goals, and Success Criteria now consistently reference "9 stale entries" (8 cold-session L2 + 1 claude-code). The 8 archived + 1 resolved entries are explicitly excluded from migration. The contradiction is resolved by Finding 5 + Finding 9.

3. **"No new writes on pass" vs rule's "no active findings"**: The gap-close branch now calls `meta_state_resolve` (one mutation per session) instead of returning silently. The rule's evidence contract is preserved. The contradiction is resolved by Finding 7.

4. **`applies_to.schemas` convention**: The change-log payload uses plain paths (`"core/gate-logic.js"`), matching the 6 prior change-logs. The contradiction is resolved by Finding 10.

5. **Cross-CLI parity**: Phase 3 Step 2 explicitly includes a behavior change for `claude-code-mcp-loading.test.cjs` (port from `writeEntry + readRegistry.find` to `probeL1` helper). The effort estimate increases from 1h to 2h. The contradiction is resolved by Finding 8.

6. **Loop-design patch return-value check**: Phase 4 Step 2 now explicitly fetches the version via `meta_state_list` and asserts the patch return value. The silent-failure mode is closed. The contradiction is resolved by Finding 11.

7. **Migration script idempotency**: Phase 2 Step 2 adds a manual idempotency check via registry lookup. The "idempotent by `meta_state_log_change`" claim is removed; idempotency is now script-level. The contradiction is resolved by Finding 4.

No additional unresolved contradictions remain. The plan is ready for implementation pending operator approval of the 14 accepted red-team findings.

### Files Modified

- `plan.md` — Overview, Goals, Success Criteria, Risk Assessment, Phases table effort, new `## Red Team Review` section
- `phase-01-test-first-refactor-of-l1-l2-probes.md` — Architecture (preserve atomic helper; gap-close = `meta_state_resolve`), Step 1 (extract pure functions with `root` param), Steps 2-6 (revised TDD flow)
- `phase-02-migrate-18-historical-entries.md` — Architecture (idempotency guard, `OPERATOR_MODE` requirement, filter for `status === "stale"` only), Steps 1-6 (revised migration flow), Risk Assessment expanded
- `phase-03-regression-guard-cross-cli-parity.md` — Frontmatter `effort: "2h"`, Overview (claude-code refactor scope), Step 2 (refactor + regression-guard)
- `phase-04-journal-loop-design-closeout.md` — Step 2 split into 2a (fetch version) + 2b (patch with explicit return-value check)
