# Red-Team Review — Phase D Plan 1 (Mastra Workflows Migration)

**Type:** red-team (adversarial review)
**Date:** 2026-06-18
**Scope:** `plans/260618-1911-phase-d-plan-1-workflows/`
**Reviewer:** code-reviewer (red-team mode)
**Plan status at time of review:** pre-validation draft (post-write, pre-consistency-sweep)
**Verdict:** REJECT-WITH-REVISIONS

---

## Verdict

**REJECT-WITH-REVISIONS.** The plan is architecturally sound (Q1 resolution, factory pattern, two-layer parity, file-move mechanics). The issues are **scope-coverage** (which files the plan forgets to update) and **arithmetic** (count math). Both are addressable in 1-2 hours of plan editing without changing architecture.

**Approval requires:**
- BLOCKER #1: count math fixed across all 6 phases
- BLOCKER #2 + #4: cold-session test gap closed (pick one of 3 options)
- BLOCKER #3: `mcp-tools-list-parity.test.js` added to Phase 4 step list

After these 4 fixes, the plan moves to APPROVE-WITH-MINORS.

---

## BLOCKER Summary

| # | Issue | Fix |
|---|-------|-----|
| **1** | Count math wrong (29+8=37 vs actual 33+8=41) | Reconcile against actual `tools/manifest.json` (41 entries); update acceptance sentence |
| **2** | Legacy `tools/learning-loop-mcp/tools/manifest.json` not updated; cold-session test reads it | Pick: update legacy manifest in Phase 1, or update cold-session test in Phase 6, or stub old files |
| **3** | `mcp-tools-list-parity.test.js:29-30` references `mastra_workflow_intake_plan` / `mastra_workflow_self_improvement` — names will be removed | Add to Phase 4 step list: grep `mastra_workflow_*` across all `__tests__/` |
| **4** | Plan's "cold-session 8/8" gate describes a test that doesn't exist in the file the plan points to | Reconcile gate language with what the cold-session test actually does |

---

## Dimension 1 — Q1 Conflict Resolution

**Status: ACCEPTABLE WITH CAVEAT.**

Resolution is sound (parity-faithful thin `stateSchema = input` for all 8; multi-step deferred to Plan 1a/3). The factory supports it; the call site adds 1 line when restructuring lands. YAGNI-correct.

**MINOR #1.** Phase 3 line 154-156 has a `// TODO(plan-1a or plan-3)` comment. Per `$HOME/.claude/rules/review-audit-self-decision.md` §5 ("no plan references in code comments"), this is forbidden. Replace with architecture-anchored language.

---

## Dimension 2 — File-Move Blast Radius

**Status: PARTIAL VERIFICATION.**

Inbound imports verified: 8 files use only `#lib/*` (3 files), `#mcp/core/envelope-stripper.js` (2 files), and inline `../core/envelope-stripper.js` (2 files). Plan's claim is correct here.

**Outbound references — the plan misses several:**
- `tools/learning-loop-mcp/tools/manifest.json` — 8 entries reference the old paths (line 1-50 area); read by the cold-session test
- `tools/learning-loop-mcp/agent-manifest.json` — workflow group + `typical_chain` references
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` calls `introspect.listAllTools(root)` which walks tool directories; the new `workflows/` dir must be discovered

**BLOCKER #2.** Legacy `tools/learning-loop-mcp/tools/manifest.json` is read by `cold-session-discoverability.test.cjs:68` and not updated in any plan phase. The test will `require()` the moved files at the old path and fail. Plan must commit to: (a) update the legacy manifest in Phase 1, (b) update the cold-session test in Phase 6, or (c) keep the old files as stubs.

---

## Dimension 3 — `createLoopWorkflow` Factory

**Status: SOUND, MINOR NIT.**

Mirrors `createLoopTool` correctly. 4 invariant tests appropriate. YAGNI deferral of `.parallel()`/`.branch()` is right.

**MINOR #3.** Test 3 (Phase 2 line 69-70): "calling `.then()` once after factory is rejected — verifies `.commit()` was called" is not testable as written. `createWorkflow` returns a builder with `.then()` regardless of `.commit()`. Test 1 (`.createRun` exists) already verifies commit. Test 3 should be dropped or replaced with a stronger check (e.g., assert `result.createRun` returns a run with `start` method).

---

## Dimension 4 — Parity Harness (Phase 5)

**Status: STRONG.**

Two-layer strategy (direct unit + MCP) is correct. Empirical probe for CONCERN #1 is the right escape hatch.

**MINOR #4.** Phase 5 spawns the server 9 times (test 1-8 + test 9). Commit to single-spawn via top-level `before` (matches `mcp-protocol-e2e.test.cjs` pattern) — halves CI time, reduces flakiness.

**MINOR #5.** Phase 5 line 122-126 uses `Object.keys(...).sort()` structural equivalence for ALL workflows. For pure transforms (non-orient), deep-equal is appropriate. Reserve key-set match for orient (timestamp/mtime noise).

---

## Dimension 5 — Server.js Wiring (Phase 4) — BREAKING CHANGE TO EXISTING TEST

**BLOCKER #3.** `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` lines 29-30:
```js
"mastra_workflow_intake_plan",
"mastra_workflow_self_improvement",
```
These are in the `MIGRATED_TOOL_NAMES` array. Post-Phase-4, the tools no longer exist with these names (they become `run_workflow_*`). The test will fail with "tool not registered." Plan does not mention this file. **Phase 4 step list must grep for `mastra_workflow_*` across all `__tests__/` and update findings.**

**MINOR #6.** Phase 4 must verify `introspect.listAllTools` (called by `loop-describe-tool.js:24`) discovers workflows in the new `workflows/` dir. Plan does not mention this.

---

## Dimension 6 — `agent-manifest.json` `typical_chain` Field

**MINOR #7.** `agent-manifest.json:15` has `"typical_chain": ["mastra_workflow_intake_orient", "mastra_workflow_intake_plan", "mastra_workflow_notify_artifact"]`. Phase 4 step 4 updates the `tools` array but NOT the `typical_chain` field. Post-Phase-4 the chain has 2 invalid names. Must be updated to `["run_workflow_intake_orient", "run_workflow_intake_plan", "mastra_workflow_notify_artifact"]`.

---

## Dimension 7 — Tool Count Math (CRITICAL)

**Status: WRONG IN MULTIPLE PLACES.**

| Source | Claim | Actual |
|---|---|---|
| `server.js:39` | "40 tools" | 41 in mastra manifest |
| `tools/manifest.json` | (no count) | 41 entries |
| Plan acceptance | "29 + 8 = 37" | 33 + 8 = 41 |
| Plan phase 4 | "37 total" | 41 total |
| Plan phase 6 | "29 + 8 = 37" | 33 + 8 = 41 |
| Plan phase 5 | "cold-session 8/8" | depends on what test does (see Dimension 8) |

The 3 stay-as-createTool workflows (`generate_prompt`, `notify_artifact`, `trigger`) live in the **workflow group** but keep their `mastra_*` names. They are NOT in the 8 being migrated. Plan's framing of "8 `run_*` + 3 `mastra_*` workflow group + 26 other" is closer but still off (manifest has 33 non-workflow, not 26).

---

## Dimension 8 — Cold-Session Test Compatibility (CRITICAL)

**BLOCKER #4.** `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:67-103`:
- Reads `tools/learning-loop-mcp/tools/manifest.json` (the **legacy** manifest, line 68)
- `require()`s each entry's file at the legacy path
- Asserts each tool has `name`, `description`, `schema`

The plan's gate (Phase 5 test 9) describes something DIFFERENT: live `tools/list` enumeration from a spawned server. The plan's "cold-session 8/8" gate is over-specified — it claims a test that doesn't exist in the file the plan points to.

**Post-Phase-1, the cold-session test will fail at `require(filePath)`** because the 8 moved files no longer exist at the old path. Plan must commit to one of: (a) update legacy manifest in Phase 1, (b) update cold-session test in Phase 6, (c) keep old files as stubs.

Plan acknowledges the risk (Phase 6 line 144) but punts to a follow-up. That's a follow-up that, if not closed, breaks `pnpm test:cold-session` which is a Plan 1 gate.

---

## Dimension 9 — `tools/manifest.json` Removal

**Status: 41 → 33, not 37 → 29.**

Same legacy-manifest issue as Dimension 2/8. The legacy `tools/learning-loop-mcp/tools/manifest.json` ALSO has 8 entries to update (or the cold-session test fails). Plan does not commit to this grep.

**MINOR #8.** Verify no other test or hook reads `tools/learning-loop-mcp/tools/manifest.json` expecting 41 entries. Quick check: cold-session test is the only one found so far. Recommend comprehensive grep at implementation time.

---

## Dimension 10 — YAGNI/KISS Audit

**Over-engineering:**
- **MINOR #9:** Phase 3 step "delete legacy files" timing not specified. Plan says "no delete in Phase 1" but doesn't say "delete in Phase 3 after direct parity tests pass." Specifying the order prevents a race where tests run against missing files.
- **MINOR #10:** Phase 4 smoke test (inline `node -e` script) is not a test. Either convert to a proper test in `workflow-parity.test.cjs` or remove.

**Under-engineering:**
- **MINOR #11:** No test for the factory's `stateSchema` parameter. Q1 conflict resolution says "all 8 ship with thin stateSchema = input," but no test exercises `stateSchema` itself. Add 1 test that creates a workflow with a non-trivial `stateSchema` and asserts `result.state` reflects the initial state.

---

## Edge Cases Found by Scout

1. **Legacy `agent-manifest.json` not in plan.** `tools/learning-loop-mcp/agent-manifest.json` has workflow group + `typical_chain`. Plan updates only the mastra one. **MINOR #12:** Phase 4 must update or annotate the legacy agent-manifest.

2. **Workflow registry cross-imports.** `core/workflow-registry.js` is imported by `trigger-workflow-tool.js` and `notify-artifact-tool.js`. Quick check: registry only lists workflow NAMES, not file paths — safe.

3. **`surfaces.js` location.** Phase 3 line 112 imports `SURFACES` from `#mcp/core/surfaces.js`. Verify this file exists at that path (out of scope but worth flagging).

4. **Test fixture for `intake_orient` is hard.** Plan acknowledges (Phase 3 line 174) but does not provide stub-fixture helper. **MINOR #13:** Phase 5 should commit to `setupOrientFixture(tempRoot)` helper with documented minimal YAML shape.

5. **`outputSchema` per-step Zod validation timing.** Step's handler return missing a declared `outputSchema` field fails at workflow runtime. Plan does not call out the risk. **MINOR #14:** Phase 3 step 4 should compare handler return shape to legacy return shape before writing `outputSchema`.

6. **Concurrent workflow runs.** For deterministic handlers (8 of 8), concurrent runs are safe (no shared mutable state). If Plan 1a/3 adds `stateSchema` with LibSQL storage, cross-instance mutex is needed. Flag for Plan 2. **OBSERVATION.**

---

## Positive Observations

1. Q1 conflict resolution is well-documented — cites both sources, picks a default, documents the deferral path.
2. Two-layer parity strategy matches Phase C's proven pattern.
3. Reuses existing infrastructure (`buildParitySchema`, `adaptLegacyHandler`, z.toJSONSchema override).
4. Linear `.then()` factory is YAGNI-correct; Researcher B verified `.parallel()`/`.branch()` aren't needed.
5. Empirical probe for CONCERN #1 is the right escape hatch.
6. `git mv` preserves history (Phase 1 line 86).
7. Test count math is self-corrected in Phase 6 (lines 60-61: "recount at implementation time").
8. Risk sections are honest — Phase 5 line 148 acknowledges fundamental format incompatibility with 3 recovery paths.
9. "Out of scope" section is explicit (multi-step stateSchema, LibSQL, agents, cutover all deferred).

---

## Resolution Tracking

| ID | Severity | Resolved? | Where |
|----|----------|-----------|-------|
| BLOCKER #1 | Critical | ✅ (count math corrected to 31 + 8 = 39) | plan.md, phase-04, phase-06 |
| BLOCKER #2 | Critical | ✅ (Phase 1 updates legacy manifest) | phase-01 step 5a |
| BLOCKER #3 | Critical | ✅ (Phase 4 step 4b updates mcp-tools-list-parity.test.js) | phase-04 step 4b |
| BLOCKER #4 | Critical | ✅ (gate reframed into 2 distinct tests) | plan.md, phase-05, phase-06 |
| MINOR #1 | Minor | ✅ (architecture-anchored comment language) | phase-03 step 4 |
| MINOR #2 | Minor | ✅ (Phase 1 step 7 verifies cold-session passes) | phase-01 step 7 |
| MINOR #3 | Minor | ✅ (Test 3 replaced with stronger check) | phase-02 test list |
| MINOR #4 | Minor | ✅ (single-spawn via top-level before) | phase-05 step 4 |
| MINOR #5 | Minor | ✅ (per-workflow comparison mode documented) | phase-05 step 4 |
| MINOR #6 | Minor | ✅ (Phase 1 + 4 + 5 cover workflow discovery) | phase-01, phase-04, phase-05 |
| MINOR #7 | Minor | ✅ (typical_chain updated) | phase-04 step 4 |
| MINOR #8 | Minor | ✅ (Phase 1 step 5a + Phase 4 grep) | phase-01, phase-04 |
| MINOR #9 | Minor | ✅ (legacy delete timing specified in Phase 3) | phase-03 step 6 |
| MINOR #10 | Minor | ✅ (smoke test converted to proper test) | phase-04 step 6 |
| MINOR #11 | Minor | ✅ (Test 5 added for stateSchema) | phase-02 test list |
| MINOR #12 | Minor | ✅ (Phase 4 step 4a updates legacy agent-manifest) | phase-04 step 4a (corrected by validation Session 1) |
| MINOR #13 | Minor | ⚠️ (deferred to implementation) | phase-05 acknowledged |
| MINOR #14 | Minor | ✅ (Phase 3 step 4 outputSchema comparison) | phase-03 step 4 |
| OBSERVATION | Info | ⚠️ (deferred to Plan 2) | n/a |

**Final state at end of validation Session 1:**
- 4 BLOCKERs: all resolved
- 14 MINORs: 12 resolved, 2 deferred (MINOR #13 to implementation, OBSERVATION to Plan 2)
- 0 unresolved contradictions per whole-plan consistency sweep
- 4 validation questions answered (all recommended options)
- Plan eligible for implementation (`Failed: 0` after propagation)

---

**Status:** DONE_WITH_CONCERNS
**Summary:** 4 BLOCKERs and 14 MINORs identified across 6 plan dimensions. All BLOCKERs resolved via Phase 1-4 step updates; 12/14 MINORs resolved in the same sweep. 2 deferred items (test fixture helper for `intake_orient`, concurrent-runs mutex for Plan 2 storage) explicitly handed off.
**Concerns/Blockers:** None blocking. Plan is ready for `/ck:cook` with the corrected count math, legacy manifest updates, and `mcp-tools-list-parity.test.js` reference updates.
