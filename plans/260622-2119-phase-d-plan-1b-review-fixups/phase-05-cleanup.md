---
phase: 5
title: "Cleanup"
status: completed
priority: P1
dependencies: []
---

# Phase 5: Cleanup

## Overview

Address the remaining 5 items: I2 (test count doc drift), I4 (server.js version mismatch), I5 (server.js tool count description), M1 (narrow id validation tests), M3 (asymmetric schema test), M4 (dead `legacyToResult` helper). All are small, isolated fixes that don't require research or refactor.

## Requirements

- Functional: server.js version matches package.json; server.js description matches actual tool count; `createLoopWorkflow` id validation has broader test coverage.
- Non-functional: dead code removed; doc drift acknowledged in journal; schema test intent documented.

## Architecture

Each item is a self-contained edit. No architectural changes.

## Related Code Files

- Modify: `tools/learning-loop-mastra/server.js` (lines 150 + 152)
- Modify: `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js` (add 5 parameterized id tests per Red Team Finding 6; drops `undefined`/`null` cases)
- Modify: `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (remove `legacyToResult` helper at lines 27-32)
- Modify: `tools/learning-loop-mastra/__tests__/schema-fingerprint.test.cjs` (add comment about asymmetric assertion)
- Modify: `docs/journals/260622-phase-d-plan-1a-shipped.md` (correct test count under "Acceptance gate")
- Modify: `plans/260622-1810-phase-d-plan-1a-parity-tightening/pr-body.md` (correct test count in §"Test evidence")

## Implementation Steps

### I4 — server.js version

1. Edit `tools/learning-loop-mastra/server.js:150`:

   ```diff
   - version: "0.1.0",
   + version: "0.1.1",
   ```

### I5 — server.js tool count description

2. Edit `tools/learning-loop-mastra/server.js:151-152`:

   ```diff
   - description:
   -   "Mastra-based canonical MCP server for the learning loop (Phase D Plans 1+2). 41 tools + 10 workflows across 5 groups. Single server post-cut-over.",
   + description:
   +   "Mastra-based canonical MCP server for the learning loop (Phase D Plans 1+2). 32 tools + 10 workflows across 5 groups. Single server post-cut-over.",
   ```

   Note: if Phase 2 takes Path B (delete `mastra_task_update`), update to `31 tools + 10 workflows` and update `workflow-parity.test.cjs` count assertions. The conditional is:

   | Phase 2 outcome | Description count | workflow-parity count |
   |-----------------|-------------------|----------------------|
   | Path A (wrapper kept) | 32 | 32 |
   | Path B (wrapper deleted) | 31 | 31 |
   | Path C (cache-only) | 32 | 32 |

### M1 — id validation broader tests

3. Edit `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js`: replace the single uppercase test (lines 119-131) with a parameterized table. Drop the `undefined` and `null` cases — `RegExp.test()` coerces both via `String()`, and `String(undefined) = "undefined"` matches the regex (starts with lowercase "u"), so these cases would not test the regex. The truthiness guard at `create-loop-workflow.js:103` rejects them via a different mechanism; if that path needs coverage, add a separate test later.

   ```js
   const invalidIds = [
     ["uppercase", "Intake-Orient"],
     ["starts-with-digit", "1abc"],
     ["hyphen", "my-workflow"],
     ["special-char", "my workflow"],
     ["empty", ""],
   ];

   for (const [label, id] of invalidIds) {
     test(`createLoopWorkflow rejects invalid id (${label})`, async () => {
       const { createLoopWorkflow } = await import("../create-loop-workflow.js");
       assert.throws(
         () =>
           createLoopWorkflow({
             id,
             description: "Test",
             inputSchema: {},
             steps: [],
           }),
         /must match \/\^\[a-z\]\[a-z0-9_\]\*\$/,
       );
     });
   }
   ```

### M3 — asymmetric schema test comment

4. Edit `tools/learning-loop-mastra/__tests__/schema-fingerprint.test.cjs`: add a comment at the top of the test function (after line 53):

   ```js
   // Asymmetric assertion: we check all expected tables exist with correct
   // column counts, but do NOT assert that there are no extra tables.
   // Intentional: allow future @mastra/libsql bumps to add new tables without
   // breaking this test. Symmetric assertion would force a deliberate
   // operator review on every addition; the current design only reviews on
   // removal or column-count drift.
   ```

### M4 — dead `legacyToResult` helper

5. Edit `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js`: remove the unused helper at lines 24-32 AND the orphan comment at line 84 that references it. The helper has zero call sites; the comment is a dangling reference. Both must go together.

   ```diff
   - // Helper: compare workflow result to legacy handler result.
   - // The workflow result is the inner JSON (envelope stripped by adapter).
   - // The legacy handler returns { content: [{ type: "text", text: JSON.stringify(result) }] }.
   - function legacyToResult(legacyOutput) {
   -   if (legacyOutput && typeof legacyOutput === "object" && Array.isArray(legacyOutput.content)) {
   -     return JSON.parse(legacyOutput.content[0].text);
   -   }
   -   return legacyOutput;
   - }
   -
   ```
   ```diff
   - // Deep-equal structural parity using legacyToResult. Locks the field set
   - // against future regressions; shape-only assertions above would miss a
   - // field drop. Add per-workflow coverage in Plan 1a.
   ```

### I2 — test count doc correction (Minor severity per Red Team Finding 7)

> **I2 is a Minor (not Important) issue and the +21 figure may be incorrect.** Plan 1a's PR body never claimed "+14 tests" — the figure only appears in `plan.md:140`. The PR body's "Test evidence" section (lines 46-63) shows totals only. The actual +21 delta is a hypothesis based on the plan's own math, not on PR body claims. Demoted from Important to Minor per Red Team Finding 7.

6. Do NOT edit `plans/260622-1810-phase-d-plan-1a-parity-tightening/pr-body.md`. The PR body's totals (1139 pass / 0 fail / 1 skipped) are accurate; no claim needs correction.

7. The Plan 1a journal is preserved unchanged (append-only policy per Red Team Finding 14). The corrected test count breakdown lands in Plan 1b's NEW journal entry (`docs/journals/260622-phase-d-plan-1b-shipped.md`, created in Phase 6), not by editing Plan 1a's journal. The new journal entry's "Acceptance gate" section will include the +21 breakdown as a self-correction note:

   ```markdown
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
   
   This is recorded here in the Plan 1b journal (not in Plan 1a's journal, which is append-only per Finding 14). The PR body is unchanged because it never made the +14 claim.
   ```

## Success Criteria

- [x] Phase 5.1 — `server.js:150` reads `"version": "0.1.1"`
- [x] Phase 5.2 — `server.js:152` description count matches actual (32 or 31 depending on Phase 2)
- [x] Phase 5.3 — `create-loop-workflow.test.js` has 5 parameterized id-validation tests (no `undefined`/`null`)
- [x] Phase 5.4 — `schema-fingerprint.test.cjs` documents asymmetric assertion intent
- [x] Phase 5.5 — `legacyToResult` helper + orphan comment at line 84 both removed from `workflow-direct-parity.test.js`
- [x] Phase 5.6 — Plan 1b journal entry includes test count breakdown (Plan 1a's journal preserved)
- [x] Phase 5.7 — `pnpm test` passes after all changes

## Risk Assessment

- **Version mismatch in MCP client cache.** Risk: low. Some MCP clients cache server version metadata; bumping may invalidate caches. Mitigation: minor version bump is widely considered non-breaking.
- **Description change breaks existing doc scraping.** Risk: low. The description string isn't externally indexed. Mitigation: doc grep before merge to ensure no doc references "41 tools" as a load-bearing claim.
- **Parameterized tests expose a latent validation bug.** Risk: low. If the regex has an edge case the existing tests didn't cover (e.g., ID `null`), the new tests catch it. Intentional.
- **Removing `legacyToResult` breaks grep for "legacyToResult".** Risk: low. The helper was local to the test file; no other module imports it. Mitigation: `grep -r legacyToResult tools/` confirms zero external references. The orphan comment at line 84 is also removed in the same diff (per Red Team Finding 8).
- **Test count breakdown lands in Plan 1b's journal only.** Risk: low. Plan 1a's journal is append-only (per Finding 14); the corrected breakdown lives in Plan 1b's new journal entry, not by editing the original. The PR body is unchanged because it never made the +14 claim.
