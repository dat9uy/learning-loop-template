# Red-Team Plan Review — Phase C Plan 1 (Atomic Mastra Adoption)

**Type:** red-team plan review (5 personas — correctness, security, performance, UX, maintainability)
**Date:** 2026-06-16
**Reviewer:** code-reviewer (hostile)
**Plan dir:** `/home/datguy/codingProjects/learning-loop-template/plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/`
**Verdict:** DO NOT SHIP AS-IS — 1 critical, 5 high, 8 medium, 4 low. Critical is a canonical-state contradiction.

---

## Findings Table

| # | Sev | Title | Phase | Recommendation |
|---|-----|-------|-------|----------------|
| F1 | **CRITICAL** | C2 tool-count contract violation: master tracker says ~36, plan ships 29 | 2/4 | Reconcile before tracker flip — update tracker to 29 OR add 4 missing tools to agent-manifest.json |
| F2 | HIGH | Factory `coerceScalar` returns `undefined` on no-op; legacy `coerceValue` returns original value | 1 | Faithful port: return `value` not `undefined` on no-op |
| F3 | HIGH | Phase 1 ships 6 stdio tests known-RED (plan claims 11 — math is wrong) | 1/2 | Don't revert server.js in Phase 1 Step 5; keep 2-tool stub so all 6 stdio pass at Phase 1 commit |
| F4 | HIGH | `mastra_*` tools bypass the runtime gate layer (per plan's own admission) | 2/3 | Either keep mastra server out of `.mcp.json` until Plan 3, or add gate-check wrapper to `createLoopTool.execute` |
| F5 | HIGH | "Three-way alignment" is actually two-way + decorative `id` | 2 | Fix prose; `id` is decorative, object key wins |
| F6 | HIGH | Stacked PR is 5 commits + ~800 lines; bisect risk | 4 | Open Phase 0+1 as PR-A (draft), merge, then Phase 2+3 as PR-B |
| F7 | MEDIUM | Parity contract is shape-only (key comparison) | 2 | Extend to per-field `_def.typeName` equality |
| F8 | MEDIUM | Schema re-export couples mastra to legacy internals | 1/2 | Add "Plan 3 cut-over note" to `schemas.js` header |
| F9 | MEDIUM | Cold-session test enumerates legacy manifest, not mastra | 2 | Plan 2 adds parallel cold-session test |
| F10 | MEDIUM | 4 ported test files have no SoT mechanism | 1 | Add CI diff check (allow only import-swap line) |
| F11 | MEDIUM | `assert.deepEqual` undefined for Zod schemas | 2 | Plan 2 uses `z.toJSONSchema()` for comparison |
| F12 | MEDIUM | `mastra_runtime_state_record` accepts preflight-less writes | 2 | Add gate-check wrapper for write-side tools (F4 fix) |
| F13 | MEDIUM | `MAX_TYPE_NAME_UNWRAP = 5` constant naming is new in factory | 1 | Cosmetic; matches legacy inline `for` bound |
| F14 | LOW | `pnpm install` may be blocked by bash gate | 0 | Plan acknowledges; fallback documented |
| F15 | LOW | 5-commit stacked PR review feasibility | 4 | Plan acknowledges; recommend commit-by-commit checklist |
| F16 | LOW | `bin` field is decorative | 0 | No action |
| F17 | LOW | C5 probe evidence verified in meta-state.jsonl:164 | 0 | POSITIVE — `meta-260616T0201Z-...` exists with 1/6 verdict |
| F18 | LOW | 5+6+5+4=20 test count verified by `grep -c "^test("` | 1 | POSITIVE — all 4 files match |

---

## F1 (CRITICAL) — Tool Count Contradiction

**Issue:** `plans/reports/productization-260612-1530-master-tracker.md:183` says "registering the **~36** meta-state deterministic tools." Plan's research §5 says "**29 deterministic tools in C2 scope (not 36)**" with 90% confidence. Plan's `tools/learning-loop-mastra/tools/manifest.json` (Phase 2 Step 1) has 29 entries.

**Verified math:**
- `tools/learning-loop-mcp/tools/manifest.json` has 40 entries (verified `grep -c '"file":'` = 40)
- 11 are workflow_* (verified `grep "workflow"` = 11 matches, including `workflowNotifyArtifactTool` and `workflowTriggerTool` whose filenames don't start with `workflow-`)
- 40 - 11 = 29 ✓

**Agent-manifest.json says 16 meta_state tools** (lines 36-51) — but plan claims 20. The 4 missing are in `tools/manifest.json` but NOT in `agent-manifest.json`:
- `meta_state_propose_design` (manifest line 33)
- `meta_state_relationships` (manifest line 34)
- `meta_state_re_verify` (manifest line 39)
- `meta_state_supersede` (manifest line 40)

**Why critical:** Plan 1 Phase 4 acceptance gate flips C2 to `[x]` in master tracker. If closeout flips C2 with 29 tools registered, the tracker description ("~36 tools") is now lying. Plan 2 author reads "C2 complete with 36 tools" and finds 29.

**Fix:** Update tracker line 183 from "~36" to "29 (post-Phase-A: 5 gate + 20 meta_state + 3 introspection + 1 runtime_agnostic, per `tools/learning-loop-mastra/tools/manifest.json`)" before closeout.

**Note:** the 4 missing-from-agent-manifest tools (`propose_design`, `relationships`, `re_verify`, `supersede`) are still part of the C2 register list (they're in `tools/manifest.json`). This is a separate inconsistency between `agent-manifest.json` and `tools/manifest.json` — out of scope for Plan 1.

---

## F2 (HIGH) — Factory Semantic Drift

Plan research §3.1 line 81-82:
```js
const next = coerceScalar(value, typeName);
if (next !== undefined && next !== value) { out[key] = next; changed = true; }
```

Legacy `coerceValue` (`/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/tool-registry.js:24-46`) returns the **original value** on no-op (e.g., empty string for ZodNumber returns `""`, not `undefined`). The legacy guard at lines 102-106:
```js
const next = coerceValue(value, typeName);
if (next !== undefined) {
  coerced[key] = next;
  didCoerce = didCoerce || next !== value;
}
```

Functionally equivalent (output is same), but the `undefined` return is plan's invention, not legacy's. Plan 2's byte-identical parity harness may surface this.

**Fix:** Make `coerceScalar` return the original value on no-op. Update research §3.1 pseudocode to match legacy.

---

## F3 (HIGH) — Phase 1 Ships 6 Stdio Tests RED (Plan Says 11 — Math Wrong)

Phase 1 Step 5 (`/home/datguy/codingProjects/learning-loop-template/plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/phase-02-phase-1-c5-factory-4-ported-wire-format-tests.md:200-207`) reverts server.js to stub. Success criteria say "9 unit + 5 schema-level tests pass; **11 stdio tests are RED until Phase 2**."

**Actual count:** Test 2 (`wire-format-top-level-coercion.test.js`) has 5 stdio tests (lines 125, 150, 175, 200, 245). Test 4 (`wire-format-patch-recursion.test.js`) has 1 stdio test (line 126). **Total: 6 stdio, not 11.** Plan's math is wrong.

**Risk:** The leaf-recursion stdio test (`wire-format-patch-recursion.test.js:126`) is the contract that locks `MAX_RECURSION_DEPTH = 2` for nested object recursion. Deferring to Phase 2 means the factory's recursion is unproven at the only commit checkpoint. If Phase 2's data-driven register loop has a bug, the leaf-recursion test fires — but by then the entire register loop is also being debugged, conflating failures.

**Fix:** Keep the 2-tool server.js stub (don't revert) so all 6 stdio tests pass at Phase 1's commit. Phase 2 expands the loop.

---

## F4 (HIGH) — Mastra Server Bypasses Runtime Gate

Phase 3 risk table line 182: "Documented as known operational gap. The mastra server is for parity testing only in Plan 1." Phase 3 ships mastra peer entry in `.mcp.json`. Once shipped, agent can call `mastra_meta_state_log_change`, `mastra_gate_check`, `mastra_runtime_state_record` — bypassing the bash gate's runtime-state authorization (which enforces `constraint-pnpm-install-tooling` per `meta-260614T1842Z`).

**Threat model:** Agent calls `mastra_runtime_state_record` with preflight-bypass payload. Legacy gate layer never fires. State change writes to `runtime-state.jsonl` without authorization.

**Why HIGH not CRITICAL:** Legacy server is primary; agent SHOULD call legacy `gate_check`. But mastra server is reachable in same MCP session — agent sees both tool lists in `tools/list` and may pick mastra version.

**Fix:** Either (a) keep mastra server out of `.mcp.json` until Plan 3 (manual `node tools/learning-loop-mastra/server.js` for the 6 stdio tests in Phase 2), or (b) add gate-check wrapper to `createLoopTool.execute` for write-side tools.

**Recommendation:** Surface to operator for decision at plan approval. Both options have trade-offs.

---

## F5 (HIGH) — "Three-Way Alignment" is Two-Way

Plan and research §2 repeatedly claim "three-way alignment (`id` === object key === legacy `name` field)." But research itself notes "object key wins, not id" — `id` is decorative. The factory's `id` is the legacy name; the object key in the `tools` map is the prefixed name; the legacy's `.name` is the un-prefixed name. The `id` is set to the prefixed name to match the object key — so `id` is effectively the same as the object key. **Two-way, not three.**

**Risk:** Future maintainer reading "three-way alignment" looks for a third constraint that doesn't exist.

**Fix:** Update prose. Use "two-way alignment" or "object-key alignment."

---

## F6 (HIGH) — Stacked PR Monolithic

Phase 4 ships 1 PR with 5 commits (~800 lines, 7-10 new files + 3 modified). Commit 3 (Phase 2 register loop) touches `server.js` and adds 29 dynamic tests. If commit 2's factory has a bug, commit 3's 29 tests all fail, and reviewer can't bisect.

**Fix:** Open Phase 0+1 as PR-A (draft), merge, then Phase 2+3 as PR-B. PR-B re-bases on main.

---

## F7-F13 (Medium) Summary

- **F7** Parity test is shape-only (key comparison) — extend to per-field `_def.typeName` (file: phase-03 line 139-150)
- **F8** Schema re-export direction (mastra → legacy) — add "Plan 3 cut-over note" to schemas.js header (file: phase-02 line 124-130)
- **F9** Cold-session test ignores mastra manifest — Plan 2 adds parallel test (file: `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:68`)
- **F10** Test file duplication has no SoT — add CI diff check or accept with journal entry
- **F11** `assert.deepEqual` undefined for Zod schemas — Plan 2 uses `z.toJSONSchema()` for comparison
- **F12** `mastra_runtime_state_record` accepts preflight-less writes — covered by F4 fix (file: phase-03 line 216)
- **F13** `MAX_TYPE_NAME_UNWRAP = 5` is new naming — cosmetic (file: research §3.1 line 64)

---

## F14-F18 (Low) Summary

- **F14** `pnpm install` may be blocked — plan acknowledges; fallback documented
- **F15** PR review feasibility — plan acknowledges as medium risk
- **F16** `bin` field decorative — no action
- **F17** POSITIVE — C5 probe evidence verified at `meta-state.jsonl:164` (entry `meta-260616T0201Z-plans-reports-productization-260612-1530-master-tracker-md` with 1/6 verdict, evidence_code_ref: `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema`)
- **F18** POSITIVE — Test counts verified: 5+6+5+4=20 (grep on all 4 files)

---

## Per-Persona Summary

**Correctness:** Block on F1. F2, F3, F7, F11 fixable in PR or Plan 2.

**Security:** Block on F4. F12 covered by F4 fix.

**Performance:** No blocking issues. Factory's `z.preprocess` matches legacy per-call cost.

**UX:** F5 is misleading prose; F6 is process risk. F8, F9, F10 are maintainability/UX hybrids.

**Maintainability:** F10 (test duplication drift) — add CI diff check or accept with journal entry.

---

## Positive Observations (Verified)

1. **20 test count is accurate** (F18) — `grep -c "^test("` on all 4 files matches
2. **C5 probe evidence exists** (F17) — `meta-state.jsonl:164` confirms 1/6 verdict with runtime evidence
3. **9-namespace anchor is consistent** across master tracker, brainstorm, and plan
4. **`MAX_RECURSION_DEPTH = 2` matches legacy** at `tool-registry.js:4`
5. **3 internal helpers correctly identified** as port targets in research §1.1, §3.1
6. **11 workflow tools to drop correctly identified** in plan phase-03 Step 1 line 168
7. **Agent-manifest matches its description** (5+11+16+3+1=36); the "20 meta_state" count in the plan is the file→export manifest, not the agent-manifest group count

---

## Recommended Actions (prioritized)

1. **[BLOCKER]** Reconcile F1: update master tracker line 183 to reflect 29 tools (or add 4 missing to `agent-manifest.json`)
2. **[BLOCKER]** Decide on F4: ship the peer entry with documented gap, or keep mastra out of `.mcp.json` until Plan 3
3. **[HIGH]** Don't revert server.js in Phase 1 Step 5 (F3); keep 2-tool stub so all 6 stdio pass at Phase 1 commit
4. **[HIGH]** Make `coerceScalar` return original value on no-op (F2); update research pseudocode
5. **[HIGH]** Open Phase 0+1 as PR-A draft, merge, then Phase 2+3 as PR-B (F6)
6. **[MEDIUM]** Extend parity test to per-field `_def.typeName` (F7); add CI diff check (F10); add Plan 3 cut-over note to schemas.js (F8)
7. **[LOW]** F11, F12, F13, F14, F15, F16: defer to Plan 2 / journal

---

## Unresolved Questions for Operator

1. **F1 — what is the canonical tool count?** Master tracker says ~36; plan says 29 (verifiable from `tools/manifest.json`). Decision needed: which is source of truth for Plan 1's closeout?
2. **F4 — does the mastra server belong in `.mcp.json` in Plan 1?** Plan says yes (Phase 3); plan also acknowledges gate-bypass. Decision needed: ship + document, or defer to Plan 3?
3. **F3 — should Phase 1's stdio tests pass at Phase 1's commit?** Plan says no (6 RED until Phase 2). Decision needed: revert server.js (current plan) or keep 2-tool stub (proposed fix)?
4. **F11 — should Plan 1's parity test catch full-schema drift, or only key drift?** Plan says only key drift. Decision needed: extend (proposed fix F7) or keep as shape-only?

---

**Status:** DONE_WITH_CONCERNS
**Summary:** Plan 1 is structurally sound (correct test count, factory spec, peer config) but has 1 critical canonical-state contradiction (F1: 29 vs ~36) and 1 high-severity security gap (F4: mastra server bypasses runtime gate). Block on F1 + F4; address F2, F3, F6 in this PR.
**Concerns/Blockers:** F1 blocks Phase 4 tracker flip. F4 blocks Phase 3 `.mcp.json` edit unless operator accepts gate-bypass gap.
