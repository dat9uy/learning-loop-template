# Phase D Plan 1b — Shipped Journal

**Date:** 2026-06-22 (researched) → 2026-06-23 (shipped)
**Branch:** `260622-1810-phase-d-plan-1a-parity-tightening` (continuation)
**Plan:** `plans/260622-2119-phase-d-plan-1b-review-fixups/`
**Change-log entry:** `meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md`
**Source review:** `plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md`
**Red-team report:** `plans/260622-2119-phase-d-plan-1b-review-fixups/reports/red-team-adjudication-260622-2330-plan-1b-review-report.md`
**New active finding:** `meta-260623T0223Z-plan-1b-phase-2-path-b-reverted-plan-1a-s-mastra-task-update`

## Summary

Plan 1b ships the 11 review findings from Plan 1a (PR #9) review. Plan 1a's PR review returned 1 Critical defect (TaskUpdate wrapper broken in production), 5 Important defects, and 5 Minor concerns. Plan 1b addresses all 11 via Path B (delete the broken wrapper + file new active finding for the upstream gap).

**Final test count:** 9 globs, **1140 pass / 0 fail / 1 skipped** (net delta from Plan 1a's 1139: +1 test).

## Outcomes per Finding

| ID | Severity | Outcome | Evidence |
|----|----------|---------|----------|
| C1 | Critical | **Path B**: deleted `tools/learning-loop-mcp/tools/task-update.js` and `tools/learning-loop-mastra/__tests__/task-update.test.js`; removed manifest entry; updated counts to 31/41; new active finding filed | Phase 2 commits + `meta-260623T0223Z-...` |
| I1 | Important | Fixed: `stripMcpContentEnvelope` exported from `core/envelope-stripper.js`; local duplicate removed from `create-loop-workflow.js` | Phase 3 commits |
| I2 | Important (Minor per Q5) | Demoted to Minor: PR body never made the +14 claim; corrected breakdown lands in this journal (not by editing Plan 1a's journal per Red Team Finding 14 / append-only policy) | This document; "Plan 1a test count correction" section below |
| I3 | Important | Fixed: SessionStart hook rewritten to use direct `buildDiscoverabilityHints()` import (no MCP server spawn) | `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` |
| I4 | Important | Fixed: server.js version 0.1.0 → 0.1.1 | `tools/learning-loop-mastra/server.js:150` |
| I5 | Important | Fixed: server.js description "41 tools" → "31 tools" | `tools/learning-loop-mastra/server.js:151-152` |
| M1 | Minor | Fixed: parameterized table with 5 cases (uppercase, starts-with-digit, hyphen, special-char, empty); `undefined`/`null` cases dropped per Red Team Finding 6 | `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js:119-141` |
| M2 | Minor | N/A (subsumed by C1 Path B) | n/a |
| M3 | Minor | Fixed: 6-line comment documenting intentional asymmetric assertion | `tools/learning-loop-mastra/__tests__/schema-fingerprint.test.cjs:55-60` |
| M4 | Minor | Fixed: `legacyToResult` helper removed (lines 24-32) AND orphan comment at line 84 removed (per Red Team Finding 8) | `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` |
| M5 | Minor | N/A (subsumed by C1 Path B) | n/a |

## Plan 1a test count correction

Per Red Team Finding 7 (Plan 1b), Plan 1a's `plan.md:140` claimed +14 tests, but the actual delta was +21. The breakdown:
- Phase 2 deep-equal: +8 (plan said +6)
- Phase 3 envelope: +2 ✓
- Phase 4 factory id: +1 ✓
- Phase 5 runId: +2 (plan said +1)
- Phase 6 schema: +1 ✓
- Phase 7 refresh-fingerprints: +2 (plan omitted)
- Phase 8 session-start: +1 (plan omitted)
- Phase 9 task-update: +4 (plan said +3)

Plan 1b's own net delta from Plan 1a's 1139 baseline: +1 (lost 4 task-update tests, gained 1 malformed-JSON test + 4 new id-validation tests = 1140).

This is recorded here in the Plan 1b journal (not in Plan 1a's journal, which is append-only per Red Team Finding 14). The PR body is unchanged because it never made the +14 claim.

## Decisions

1. **C1 fix path: Path B.** Phase 1 research verified the Claude Code CLI has no `task` subcommand (verified via `claude --help`); no `@anthropic-ai/claude-agent-sdk` is installed; the native TaskUpdate doesn't return `{changed: bool}`. The wrapper is irrecoverable without an upstream Claude Code change. Per Validation Session 2 Q1, Path B is the default. The original `meta-260622T1439Z-...` finding stays resolved; a new active finding (`meta-260623T0223Z-...`) tracks the upstream gap.

2. **Envelope consolidation: two distinct strippers.** `stripEnvelope` and `stripMcpContentEnvelope` are kept as separate canonical strippers in `#mcp/core/envelope-stripper.js` because they handle genuinely different envelope forms. The factory-level preprocess uses `stripMcpContentEnvelope`; per-field preprocess in legacy workflows uses `stripEnvelope`.

3. **SessionStart hook rewrite: direct in-process import.** Adopted `buildDiscoverabilityHints()` import from `core/loop-introspect.js` instead of the previous hand-rolled JSON-RPC + MCP server spawn pattern. Hand-rolled JSON-RPC was the documented deadlock root cause in `meta-260621T1743Z`; reusing it in the SessionStart hook was a regression of that lesson. Per Red Team Finding 2, the new approach eliminates the MCP server spawn entirely (the constant is frozen at module load). Latency dropped from ~500-5500ms to <50ms.

4. **Phase 3 inline strip removal: operator override of Red Team Finding 5.** The original plan said REMOVE; the red team recommended KEEP (because direct `run.start({inputData})` callers might bypass the factory preprocess). Empirically verified: the 2 envelope-form tests at `workflow-direct-parity.test.js:334-359` and `:361-383` continue to pass after the inline strip is removed. The factory preprocess at line ~110 handles all entry points (Mastra's `createWorkflow` schema validation fires for direct `.start()` calls too, not just the MCP path). Red Team Finding 5 was based on a logical inference, not empirical verification; the operator's Q4 override (remove inline strip) was correct. No test migration was needed.

5. **Phase 6 reopen mechanism: new active finding via `meta_state_report`.** The original `meta-260622T1439Z-...` stays resolved per Plan 1a's closure note. `meta_state_patch` cannot reopen because `resolved_at` and `resolved_by` are in the immutable-field deny-list. The new active finding (`meta-260623T0223Z-...`) cross-references the original.

## Lessons

### What was hard

1. **Path B's cross-phase coupling.** The description count in `server.js:152` and the `workflow-parity.test.cjs:160-166` assertions must be updated together; if you update one and not the other, tests fail. Plan 2 explicitly updates both in the Path B step 4 (per Red Team Finding 9).

2. **Mastra's inputSchema validation scope.** A logical inference ("direct `.start()` calls bypass schema validation") turned out to be empirically wrong. Future code archeology should treat "X bypasses Y" claims as testable hypotheses, not axioms.

3. **`@modelcontextprotocol/sdk` CJS path.** The package.json `exports` map uses `"./client": { "require": "./dist/cjs/client/index.js" }` (no `.cjs` suffix). Code that does `require("@modelcontextprotocol/sdk/client/index.cjs")` fails with `MODULE_NOT_FOUND`. The correct require is `require("@modelcontextprotocol/sdk/client")`.

4. **`meta_state_patch` immutable-field deny-list.** Reopening a resolved finding is impossible with current tools. Use `meta_state_report` to file a new active finding with a cross-reference to the original. The cross-reference lets future readers trace the lineage.

5. **Journals are append-only.** Plan 1a's journal is a historical record; corrections land in Plan 1b's NEW journal entry, not by editing the original. The "Plan 1a test count correction" section above is the canonical correction site.

### What would be different

1. **Pre-emptively run `meta_state_query_drift` before testing.** The 3 server.js fingerprints drift on every Plan 1b change (Path B's description update, I4's version bump). A pre-test refresh would have caught this in one step.

2. **Pre-emptively lint `evidence_code_ref` paths against `tools/` deletions.** When `tools/learning-loop-mcp/tools/task-update.js` was deleted, the new finding's `evidence_code_ref` pointed to the deleted file (orphan reference). The cold-tier regression test caught it. A pre-test orphan scan would have caught it earlier.

3. **Use the red team's full empirical verification pattern.** Red Team Finding 5 was rejected by the operator because the operator believed the inline strip was indeed dead. The empirical check (run tests after removal) confirmed it was dead. Future red-team findings should pair logical inference with a 1-line empirical check.

## Forward-looking

- **Plan 3 (agents)** is unblocked. Path B means no `mastra_task_update` wrapper is available; Plan 3 must implement its own TaskUpdate workaround OR accept the upstream gap as deferred. The new active finding `meta-260623T0223Z-...` tracks the upstream structural fix.
- **Plan 4 (cutover)** continues to own the cold-session discoverability enumeration update for `run_workflow_*` tools.
- **The 5+1 deadlock pattern** (from `meta-260621T1743Z-...`) is fully resolved: every code path that calls an MCP tool uses either the SDK Client (for actual MCP tools) or direct import (for static constants). Hand-rolled JSON-RPC is no longer used in any path.

## Unresolved questions

(None)

## Acceptance gate

> *"pnpm test exits 0; all 11 findings have documented outcomes; meta-state reflects the change; journal entry shipped."*

**Verified:**
- `pnpm test` 9 globs, **1140 pass / 0 fail / 1 skipped** ✓
- C1 outcome: Path B (delete wrapper + new active finding) ✓
- I1-I5 outcomes: Fixed ✓
- M1, M3, M4 outcomes: Fixed ✓
- M2, M5 outcomes: N/A (subsumed by C1) ✓
- Cold-tier regression: pass (after 3 fingerprint refreshes for `server.js` anchors) ✓
- `meta_state_log_change` filed: `meta-260623T1039Z-...` ✓
- New active finding filed: `meta-260623T0223Z-...` ✓
- Journal entry: this document ✓
