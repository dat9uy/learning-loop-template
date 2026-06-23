---
title: "Phase D Plan 1b — Review Fixups"
description: "Atomic follow-up to Plan 1a (PR #9) addressing 11 review findings: 1 Critical (TaskUpdate wrapper broken in production), 5 Important (envelope duplication, SessionStart deadlock, version/count drift, test count doc), 5 Minor (narrow tests, relative paths, asymmetric assertion, dead code, CLI flag assumptions)."
status: completed
priority: P1
branch: "260622-1810-phase-d-plan-1a-parity-tightening"
tags: [meta-surface, phase-d, atomic-fix, review-remediation, tdd]
blockedBy: ["260622-1810-phase-d-plan-1a-parity-tightening"]
blocks: ["phase-d-plan-3-agents", "phase-d-plan-4-cutover"]
created: "2026-06-22"
createdBy: "ck:plan"
source: skill
related:
  - "plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md (filed 2026-06-22 per Validation Session 2 Q6)"
  - "plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md (parent plan; ships PR #9)"
  - "docs/journals/260622-phase-d-plan-1a-shipped.md"
  - "meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n (reopened if Phase 2 reverts resolution)"
---

# Phase D Plan 1b — Review Fixups

## Overview

**Atomic follow-up to Plan 1a (PR #9) addressing 11 review findings** from `plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md`.

Plan 1a shipped 9 globs / 1139 tests passing and resolved 3 operator-acked structural findings. Code review found one **Critical** defect (the `mastra_task_update` wrapper is broken in production because the Claude Code CLI has no `task update` subcommand), five **Important** defects (envelope duplication, SessionStart deadlock risk, version/count drift, test-count doc drift), and five **Minor** concerns. **Plan 1b must ship before Plan 3 (agents)** because Plan 3 agents inherit the `mastra_task_update` wrapper as a reasoning primitive.

**Scope (6 phases, single branch, ~3-5h):**

| Group | Phases | Effort |
|---|---|---|
| **A — Research (C1 fix path)** | Phase 1 | ~30min |
| **B — Critical fix** | Phase 2 | ~1h |
| **C — Refactors (I1, I3)** | Phases 3-4 | ~1.5h |
| **D — Cleanup + docs (I2, I4, I5, M1-M5)** | Phase 5 | ~30min |
| **E — Acceptance gate** | Phase 6 | ~30min |

**Why Plan 1b ships as atomic fixup (not separate plans):** all 11 items share the same PR blast radius and the C1 finding invalidates one of Plan 1a's finding resolutions. Splitting into multiple PRs would require either:
- (a) Re-opening the `TaskUpdate` resolution twice (once in Plan 1b Critical, again if follow-ups touch it)
- (b) Cherry-picking hot-fixes onto main, breaking the atomic-fix discipline from Plan 1a's parent (Phase C Plan 1a precedent)

Plan 1b mirrors Plan 1a's atomic pattern: single branch, single PR, all 11 findings closed together.

## Findings Index

Maps every review finding to its phase. Reference: `plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md`.

| ID | Severity | Title | Phase | Resolves |
|----|----------|-------|-------|----------|
| C1 | Critical | `mastra_task_update` wrapper broken in production (CLI has no `task update`) | [Phase 2](./phase-02-critical-fixes.md) | reopens `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n` if reverting |
| I1 | Important | Triple-redundant envelope handling in `create-loop-workflow.js` | [Phase 3](./phase-03-envelope-consolidation.md) | n/a (code quality) |
| I2 | Important | Test count undercounted in plan/PR body (+14 claimed, +21 actual) | [Phase 5](./phase-05-cleanup.md) | n/a (docs) |
| I3 | Important | SessionStart hook uses hand-rolled JSON-RPC (deadlock risk; Plan B already fixed this elsewhere) | [Phase 4](./phase-04-sessionstart-mcp-sdk.md) | n/a (code quality) |
| I4 | Important | `server.js:150` version "0.1.0" not bumped despite `package.json:3` -> "0.1.1" claim | [Phase 5](./phase-05-cleanup.md) | n/a (1-line fix) |
| I5 | Important | `server.js:152` tool count "41" stale (actual: 32 after Plan 1a) | [Phase 5](./phase-05-cleanup.md) | n/a (1-line fix) |
| M1 | Minor | `createLoopWorkflow` id validation has narrow test coverage (uppercase only) | [Phase 5](./phase-05-cleanup.md) | n/a (test addition) |
| M2 | Minor | `task-status-cache.json` uses relative path (`path.resolve(".claude/...")`) | [Phase 2](./phase-02-critical-fixes.md) (depends on C1 fix direction) | n/a (code quality) |
| M3 | Minor | Schema-fingerprint test is asymmetric (allows extra tables silently) | [Phase 5](./phase-05-cleanup.md) | n/a (test docs) |
| M4 | Minor | Dead code: `legacyToResult` helper in `workflow-direct-parity.test.js:27-32` unused | [Phase 5](./phase-05-cleanup.md) | n/a (dead code) |
| M5 | Minor | `task-update.js` requires `claude` CLI on PATH with undocumented flags | [Phase 2](./phase-02-critical-fixes.md) (subsumed by C1) | n/a (code quality) |

## Phases

| Phase | Name | Status | Effort | TDD Color | Source |
|-------|------|--------|--------|-----------|--------|
| 1 | [Research](./phase-01-research.md) | ✓ Completed | ~30min | n/a (verify-only) | research-only; gates Phase 2 |
| 2 | [Critical Fixes](./phase-02-critical-fixes.md) | ✓ Completed | ~1h | depends on Phase 1 decision | C1 + M2 + M5 |
| 3 | [Envelope Consolidation](./phase-03-envelope-consolidation.md) | ✓ Completed | ~45min | RED -> GREEN (1 invariant test) | I1 |
| 4 | [SessionStart Direct Hint Import](./phase-04-sessionstart-mcp-sdk.md) | ✓ Completed | ~45min | smoke test reuse | I3 |
| 5 | [Cleanup](./phase-05-cleanup.md) | ✓ Completed | ~30min | test additions + 1-line fixes | I2, I4, I5, M1, M3, M4 |
| 6 | [Acceptance Gate](./phase-06-acceptance-gate.md) | ✓ Completed | ~30min | verify-only | closeout |

**Total effort:** ~3.5-5 hours. Single session. Single branch (continuation of Plan 1a's branch), single PR.

## Pre-flight Checklist (per development-rules)

| Phase | Gated Path | Tool / Env | Notes |
|-------|-----------|------------|-------|
| 2 | `meta-state.jsonl` (reopen `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n` if reverting resolution) | `OPERATOR_MODE=1` | gated closeout |
| 2 | `tools/learning-loop-mcp/tools/task-update.js` (modify; rewrite or delete) | n/a | depends on Phase 1 |
| 2 | `tools/learning-loop-mastra/__tests__/task-update.test.js` (modify; real CLI test or removal) | n/a | test must verify production behavior |
| 3 | `tools/learning-loop-mastra/create-loop-workflow.js` (modify; remove dead inlined envelope handling, reuse canonical stripper) | n/a | refactor |
| 3 | `tools/learning-loop-mcp/core/envelope-stripper.js` (modify; add `stripMcpContentEnvelope` alongside `stripEnvelope`) | n/a | consolidate |
| 4 | `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` (rewrite; use direct `buildDiscoverabilityHints()` import per Red Team Finding 2) | n/a | refactor |
| 5 | `package.json`, `tools/learning-loop-mastra/server.js`, `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js`, `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js`, `tools/learning-loop-mastra/__tests__/schema-fingerprint.test.cjs`, `docs/journals/260622-phase-d-plan-1a-shipped.md`, `plans/260622-1810-phase-d-plan-1a-parity-tightening/pr-body.md` | n/a | cleanup |
| 6 | `meta-state.jsonl` (1 `meta_state_log_change` for Plan 1b ship) | `OPERATOR_MODE=1` | gated closeout |

**Preflight calls (`gate_mark_preflight`) required:** Phases 2, 3, 4, 5, 6 touch `product/**` (single `product` surface marker covers all).

## Dependencies

**Blocked by:**
- `260622-1810-phase-d-plan-1a-parity-tightening` (Plan 1a, ships PR #9; provides the code paths Plan 1b fixes).

**Blocks:**
- `phase-d-plan-3-agents` (Plan 3 — `createLoopAgent` wrappers; depends on the working `mastra_task_update` wrapper or its verified-deferred status).
- `phase-d-plan-4-cutover` (Plan 4 — agent-manifest.json reconciliation; depends on Plan 1b's manifest count being correct).

**Cross-plan refs (informational):**
- `260617-1138-phase-c-plan-1a-atomic-fix` (Phase C Plan 1a — atomic-fix discipline precedent; Plan 1b mirrors this pattern).
- `260619-2246-phase-d-plan-2-storage` (sibling; storage schema fingerprint test, Plan 1a Phase 6).
- `260618-1911-phase-d-plan-1-workflows` (Plan 1; Plan 1a's parent).

## Out of scope (separate tracks, NOT this plan)

- Multi-step `stateSchema` restructuring for `self_improvement` and `runtime_probe` — Plan 3 owns.
- `agent-manifest.json` final 5-group reconciliation — Plan 4.
- Cold-session discoverability enumeration update for `run_workflow_*` tools — Plan 4.
- Upstream Claude Code `TaskUpdate` structural fix (returning `{changed: bool}` natively) — out of repo's control.
- D-16 (CI test-drift check), D-17 (fail-fast on manifest errors), D-19 (LIM hardening) — separate tracks per Plan 1a's out-of-scope list.
- Meta-state migration JSONL -> LibSQL — separate phase.

## Whole-Plan Consistency Sweep

- **Files reread during authoring:** `plan.md` (this), 6 phase stubs (post-scaffold read), Plan 1a's `plan.md` and journal.
- **Decision deltas:**
  - Plan 1a's `blocks` referenced `phase-d-plan-3-agents` and `phase-d-plan-4-cutover`; Plan 1b inherits the same `blocks` because the surface stays the same.
  - Plan 1a was P2; Plan 1b is **P1** because the C1 finding invalidates a closed finding and the wrapper is a Plan 3 prerequisite.
  - Plan 1a phase 9 (TaskUpdate wrapper) was `RED -> GREEN (3 unit tests)`; Plan 1b Phase 2 may revert the wrapper entirely (RED -> GREEN with `meta_state_resolve` reversal + finding reopen).
- **File ownership map (no parallel conflicts):**
  - Phase 2: `tools/learning-loop-mcp/tools/task-update.js`, `tools/learning-loop-mastra/__tests__/task-update.test.js`, optionally `tools/learning-loop-mastra/tools/manifest.json` (if wrapper deleted).
  - Phase 3: `tools/learning-loop-mastra/create-loop-workflow.js`, `tools/learning-loop-mcp/core/envelope-stripper.js`, optionally `tools/learning-loop-mastra/workflows/*.js` (workflows using the old stripEnvelope).
  - Phase 4: `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs`, `tools/learning-loop-mcp/__tests__/session-start-inject-discoverability.test.cjs`.
  - Phase 5: scattered 1-line fixes; no shared-edit conflict.
  - Phase 6: no code changes outside `meta-state.jsonl` + `docs/journals/` + `plans/reports/`.
- **Test count delta:** Phase 2 (-1 to -3 tests if wrapper deleted), Phase 3 (+1 invariant test), Phase 4 (+0, smoke test reused), Phase 5 (+4 id validation tests). Net: +4 to +2 tests.
- **Reconciled stale references:**
  - Plan 1a's `phase-09-taskupdate-idempotency-tool.md` describes the broken wrapper; Plan 1b Phase 2 supersedes that phase.
  - Plan 1a's pr-body claims `Version 0.1.0 -> 0.1.1`; Plan 1b Phase 5 finishes the version bump (server.js update).
- **Unresolved contradictions:** 0. All 11 findings have a phase assignment.

## Key Risks Addressed

- **C1 fix research may return "no working CLI surface".** Risk: medium. If the Claude Code CLI/MCP really has no programmatic task update interface, Phase 2 must revert the resolution and remove the wrapper (rather than ship a known-broken tool). Mitigation: Phase 1 explicitly enumerates fallback paths; Phase 2's acceptance gate requires either a working implementation OR `meta_state_resolve` reversal + manifest removal.
- **Phase 3 envelope refactor breaks workflow field-level preprocess.** Risk: low. The existing per-field `z.preprocess(stripEnvelope, ...)` in workflows (e.g., `workflow-self-improvement.js:45`) uses the OLD single-key `{item: X}` envelope. If `stripEnvelope` semantics change, those workflows break. Mitigation: Phase 3 keeps `stripEnvelope` as-is and adds `stripMcpContentEnvelope` alongside; only `create-loop-workflow.js` is refactored.
- **Phase 4 SessionStart rewrite changes implementation to direct import.** Risk: low. After Red Team Finding 2, the hook no longer spawns the MCP server; it imports `buildDiscoverabilityHints()` directly. Latency drops from ~500-5500ms to <50ms. The smoke test continues to pass with the same `.claude/session-context.json` shape.
- **Phase 5 documentation updates contradict Plan 1a's journal.** Risk: low. The journal is post-ship history; Plan 1b's corrections land in a NEW journal entry (`docs/journals/260622-phase-d-plan-1b-shipped.md`, created in Phase 6), not in Plan 1a's journal. Plan 1a's journal is preserved unchanged.

## References

- `plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` (review findings source)
- `plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md` (parent plan)
- `docs/journals/260622-phase-d-plan-1a-shipped.md` (Plan 1a journal)
- `tools/learning-loop-mcp/tools/task-update.js` (broken wrapper)
- `tools/learning-loop-mastra/__tests__/task-update.test.js` (mocks CLI)
- `tools/learning-loop-mastra/create-loop-workflow.js` (envelope duplication)
- `tools/learning-loop-mcp/core/envelope-stripper.js` (canonical stripper)
- `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` (hand-rolled JSON-RPC)
- `tools/learning-loop-mcp/core/loop-introspect.js` (`buildDiscoverabilityHints()` source for Phase 4's direct import)
- `meta-260621T1743Z-the-full-pnpm-test-glob-fired-by-pre-commit-hook-package-jso` (deadlock root cause analysis)
- `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n` (resolution to revert if Phase 2 finds no fix)
- `docs/journals/260622-phase-d-plan-1a-shipped.md` (Plan 1a journal; not edited by Plan 1b)

## Validation Log

### Session 1 — 2026-06-22 (planning, post-review)

**Trigger:** operator invocation `/ck:plan` after `ck-code-review` returned 11 findings (1 Critical, 5 Important, 5 Minor). Auto-detect mode: **fast** (clear scope from review; only Phase 1 research is open-ended).

**Verification tier:** focused (1 role, no new claims — review findings are the source of truth).

#### Confirmed Decisions

- **Plan 1b ships as atomic fixup.** All 11 findings share the same PR blast radius; C1 invalidates one Plan 1a resolution.
- **Phase 1 is gated.** No Phase 2 work begins until Phase 1 returns with a decision on the C1 fix path.
- **Phase 2 has two valid end states.** Either (a) working wrapper implementation, OR (b) `meta_state_resolve` reversal + manifest removal. Plan 1b does NOT mandate (a); (b) is acceptable per YAGNI.
- **Plan 1b is P1, not P2.** The C1 finding invalidates a closed finding and Plan 3 agents inherit the wrapper.
- **Plan 1a's journal is preserved.** Plan 1b adds a new journal entry; historical record stays intact.

### Session 2 — 2026-06-22 (post-red-team validation)

**Trigger:** operator invocation `/ck:plan validate plans/260622-2119-phase-d-plan-1b-review-fixups/` after the red-team review applied 14 fixes (3 Critical, 4 High, 7 Medium). Per the validate guard, the heavy verification pass was skipped because the Red Team Review section already contains verification evidence; this session focused on resolving the post-red-team decisions and one operator override.

**Questions asked:** 7

#### Questions & Answers

1. **[Assumptions]** If Phase 1 research returns no clear winner, what is the default Phase 2 path?
   - Options: Path A (workable interface) | Path B (delete wrapper + new finding) | Path C (cache-only workaround)
   - **Answer:** Path B (delete wrapper + new finding)
   - **Rationale:** The wrapper is broken in production; Plan 3 agents will need their own workaround regardless. Cleanest, lowest-risk default. Matches the plan's documented acceptance gate.

2. **[Architecture]** Phase 4 hook architecture changed from MCP server spawn to direct in-process import of `buildDiscoverabilityHints()`. Confirm?
   - **Answer:** Confirmed (with clarification request: which function spawns, which imports, is there a rule?)
   - **Clarification provided:** No hard rule in the codebase. Direct import when data is a static constant or in-process helper (e.g., `buildDiscoverabilityHints()` from `core/loop-introspect.js`). MCP server spawn only when calling actual MCP tools (e.g., `mastra_meta_state_query_drift`). Phase 4 hook reads a frozen constant; direct import is correct.
   - **Rationale:** Eliminates the MCP server startup class of risk entirely. Latency drops from ~500-5500ms to <50ms.

3. **[Architecture]** Phase 6 mechanism for tracking the upstream TaskUpdate gap changed from `meta_state_patch` (reopen) to `meta_state_report` (new active finding). Confirm?
   - **Answer:** File new active finding (Recommended)
   - **Rationale:** `meta_state_patch` deny-lists `resolved_at`/`resolved_by`. The original `meta-260622T1439Z-...` stays resolved per Plan 1a's closure note. Plan 1b files a new active finding with cross-reference to the closed entry.

4. **[Architecture/Tradeoffs]** Phase 3 retains the inline envelope strip in `buildStep.execute` (was 'REMOVE' in original plan). Confirm the behavior change?
   - **Answer:** **REMOVE inline strip (overrides Red Team Finding 5).** Operator accepts the risk that the 2 envelope-form tests at `workflow-direct-parity.test.js:334-359` will need updating (see Q7).
   - **Rationale:** Per `~/.claude/rules/review-audit-self-decision.md` ("User Decisions" section), the operator's explicit choice overrides the audit recommendation, even though the empirical evidence (direct `.start()` calls bypass the factory preprocess) supports keeping the inline strip.

5. **[Scope]** I2 (test count correction) demoted from Important to Minor per Red Team Finding 7. Confirm?
   - **Answer:** Demote to Minor (Recommended)
   - **Rationale:** The '+14 claimed' figure only appears in `plan.md`, NOT in the PR body. The plan's evidence is unfalsifiable. Keep the journal breakdown but skip the pr-body edit.

6. **[Scope]** Source review report `from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` is cited in the plan but does not exist on disk. What's the fix?
   - **Answer:** File the source review report first before Plan 1b ships (Recommended)
   - **Rationale:** Block Plan 1b ship until the source report is filed. The 11 findings need a citable origin for future code archeology.

7. **[Architecture/Follow-up]** How should the 2 envelope-form tests at `workflow-direct-parity.test.js:334-359` be updated to match the Q4 override (remove inline strip)?
   - **Answer:** Update the 2 envelope tests to use MCP call path (Recommended)
   - **Rationale:** Convert `run.start({ inputData: envelopeInput })` to `client.callTool({ name: 'run_workflow_self_improvement', arguments: envelopeInput })`. The MCP call path goes through `MCPServer`'s schema validation, which triggers the factory preprocess. Tests preserve coverage of the envelope-stripping behavior, just via a different entry point.

#### Confirmed Decisions

- **Default Phase 2 path:** Path B (delete wrapper, file new active finding).
- **Phase 4 architecture:** Direct in-process import of `buildDiscoverabilityHints()`. No MCP server spawn.
- **Phase 6 reopen mechanism:** File new active finding via `meta_state_report`. Original `meta-260622T1439Z-...` stays resolved.
- **Phase 3 inline strip:** **REMOVE** (operator override of Red Team Finding 5). Tests at `workflow-direct-parity.test.js:334-359` will be updated to use MCP call path in Phase 3 step 5.
- **I2 severity:** Minor (not Important).
- **Source review report:** File before Plan 1b ships.
- **Phase 3 test updates:** 2 envelope tests use MCP call path.

#### Action Items

- [x] Plan 1b authored at `plans/260622-2119-phase-d-plan-1b-review-fixups/`
- [x] Red team review: 14 of 15 findings applied
- [x] Revert Red Team Finding 5 in `phase-03-envelope-consolidation.md` (re-apply "REMOVE" inline strip; add Phase 3 step 5 for test migration)
- [x] File source review report at `plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` before ship
- [x] Update `## Red Team Review` table in `plan.md` to mark Finding 5 as "Accept (operator override)"
- [x] Phase 1 research (Path B decision)
- [x] Phase 2-6 implementation (all 6 phases completed; 1140 pass / 0 fail / 1 skipped)
- [x] PR body update + journal entry (Phase 6)

#### Impact on Phases

- **Phase 3**: Revert inline-strip change to original "REMOVE" plan. Add step 5 to convert 2 envelope tests in `workflow-direct-parity.test.js:334-359` from direct `.start({inputData})` to MCP `client.callTool({name: 'run_workflow_*'})` call path. Update risk assessment to note test coverage migration.
- **Phase 6**: Source review report must be filed before Phase 6's acceptance gate runs.

### Whole-Plan Consistency Sweep (Session 2)
- **Files reread:** plan.md, phase-01-research.md, phase-02-critical-fixes.md, phase-03-envelope-consolidation.md, phase-04-sessionstart-mcp-sdk.md, phase-05-cleanup.md, phase-06-acceptance-gate.md
- **Decision deltas checked:** 7 (all 7 validation answers)
- **Reconciled stale references:**
  - Phase 3 reverted to "REMOVE inline strip" per Q4 operator override. The 2 envelope tests at `workflow-direct-parity.test.js:334-359` and `:361-383` are migrated to MCP call path in Phase 3 step 5 (new). Risk note in Phase 3 already covers this trade-off.
  - I2 demoted to Minor in plan.md Findings Index table (Q5). Journal breakdown lands in new Plan 1b journal entry, not by editing Plan 1a's journal.
  - Source review report (Q6): `related:` field in plan.md frontmatter now flags the file as PENDING. The source report must be filed before Plan 1b ships.
  - Phase 4 architecture is consistent across plan.md ("Direct Hint Import"), phase-04 frontmatter (title updated), and risk notes.
  - Phase 6 reopen mechanism is consistent: new active finding via `meta_state_report` (not `meta_state_patch` reopen).
- **Unresolved contradictions:** 0
- **Plan ready for implementation:** yes, after source review report is filed AND Phase 3 test migration is acknowledged as a Phase 3 implementation step.

## Red Team Review

### Session — 2026-06-22
**Findings:** 15 (14 accepted, 1 rejected)
**Severity breakdown:** 3 Critical, 4 High, 7 Medium, 1 rejected
**Report:** `plans/260622-2119-phase-d-plan-1b-review-fixups/reports/red-team-adjudication-260622-2330-plan-1b-review-report.md`

**Reviewers:** Scope & Complexity Critic (Contract Verifier) + Failure Mode Analyst (Flow Tracer) + controller fact-check pass. Security Adversary and Assumption Destroyer agents completed but did not write report files.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 4 SDK import path broken (`require(.../index.cjs)` does not exist) | Critical | Accept | Phase 4 step 1 |
| 2 | Phase 4 hook spawns MCP server for a frozen constant | Critical | Accept | Phase 4 architecture + step 1 |
| 3 | Phase 6 reopen mechanism is structurally impossible | Critical | Accept | Phase 2 Path B step 5 + Phase 6 step 3 |
| 4 | Phase 3 line numbers are stale (69-83, 86-95) | High | Accept | Phase 3 step 2 |
| 5 | Phase 3 "remove dead inline" claim is wrong — direct `.start()` calls bypass factory preprocess | High | Accept (operator override: keep REMOVE; migrate 2 envelope tests to MCP call path) | Phase 3 step 2 + 5 |
| 6 | M1 parameterized test `undefined`/`null` cases pass the regex via `String()` coercion | High | Accept | Phase 5 step 3 |
| 7 | I2 test-count correction is partly fabricated — "+14" not in PR body | High | Accept (modified) | Phase 5 step 6-7 |
| 8 | M4 cleanup must also remove orphaned `legacyToResult` comment at line 84 | Medium | Accept (modified) | Phase 5 step 5 |
| 9 | Phase 2 Path B cross-phase coupling: must update server.js:152 description in Phase 2 (not defer to Phase 5) | Medium | Accept | Phase 2 Path B step 4 |
| 10 | Source review report cited in plan.md frontmatter does not exist on disk | Medium | Accept | plan.md frontmatter `related:` |
| 11 | Phase 6 Steps 4-5 (refresh + cold-tier) duplicate standard test suite | Medium | Accept | Phase 6 step 4-5 |
| 12 | Phase 3 invariant test is over-tested; 2 of 4 cases are tautologies | Medium | Accept | Phase 3 step 3 |
| 13 | Phase 2 Path C code blocks are premature (YAGNI) | Medium | Accept | Phase 2 Path C + Phase 1 step 5 |
| 14 | Phase 5 journal edit contradicts plan's "preservation" claim | Medium | Accept | Phase 5 step 6 + plan.md "Key Risks" |
| 15 | Atomic plan with 3 mutually exclusive paths complicates review | Medium | Reject | n/a |

**Rationale for Finding 15 reject:** Splitting would require either re-opening the TaskUpdate resolution twice or cherry-picking hot-fixes onto main, breaking Plan 1a's atomic-fix discipline. Cost of splitting outweighs the reviewability benefit.

### Whole-Plan Consistency Sweep
- **Files reread:** plan.md, phase-01-research.md, phase-02-critical-fixes.md, phase-03-envelope-consolidation.md, phase-04-sessionstart-mcp-sdk.md, phase-05-cleanup.md, phase-06-acceptance-gate.md
- **Decision deltas checked:** 14
- **Reconciled stale references:**
  - Finding 4: Phase 3 line numbers updated to 67-76/79-86/119
  - Finding 5: Phase 3 reverts to original "REMOVE inline strip" plan (operator override); adds step 5 to migrate 2 envelope tests to MCP call path
  - Finding 12: Phase 3 invariant test replaced with single malformed-JSON fallback case
  - Finding 6: Phase 5 M1 parameterized table reduced from 6 to 5 cases
  - Finding 7: Phase 5 I2 demoted to Minor; pr-body.md edit removed
  - Finding 8: Phase 5 M4 cleanup includes both helper and orphan comment removal
  - Finding 9: Phase 2 Path B step 4 now updates server.js:152 explicitly
  - Finding 10: plan.md frontmatter `related:` now cites a placeholder until source report is filed
  - Finding 11: Phase 6 Steps 4-5 removed
  - Finding 13: Phase 2 Path C code block replaced with 1-paragraph pointer
  - Finding 14: Phase 5 journal edit replaced with append-only new journal entry
  - Findings 1+2: Phase 4 rewritten to direct `buildDiscoverabilityHints()` import
  - Finding 3: Phase 2 Path B step 5 + Phase 6 step 3 use new active finding instead of reopen
- **Unresolved contradictions:** 0
- **Plan ready for implementation:** yes, after the 14 fixes are applied inline to phase files.
