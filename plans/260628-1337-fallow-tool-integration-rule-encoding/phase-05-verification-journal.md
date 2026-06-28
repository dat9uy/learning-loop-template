---
phase: 5
title: "Verification + journal"
status: pending
priority: P2
dependencies: [4]
---

# Phase 5: Verification + journal

## Overview

Write the regression test for the new rule, run the full test suite, run `loop_describe({tier: warm})` and confirm zero warnings, then write the ship journal entry.

## Requirements

- Functional: new test `gate-logic-consult-checklist-tool-integration.test.js` passes (3 tests inside); full `pnpm test` suite delta = +3 tests (1308 → 1311); `loop_describe({tier: warm})` returns `warnings: []`; journal entry written.
- Non-functional: journal follows the house style at `plans/reports/journal-260627-phase-e-dead-code-sweep-shipped.md` (short, lessons, no fluff).

## Architecture

```
tools/learning-loop-mastra/__tests__/legacy-mcp/
  gate-logic-consult-checklist-tool-integration.test.js  (NEW)
    3 tests:
      (a) rule loads through metaStateRuleEntrySchema AND is no-op for applyPromotedRules
      (b) PROCESS_HINTS has a row referencing rule-tool-integration-same-commit-dep as a literal substring
      (c) hook mirror LOCAL_PROCESS_HINTS has the same row (parity guard)

(NO strictEqual count assertion on PROCESS_HINTS — that couples the test to every future edit. R-MED-3)
```

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js`
- Create: `plans/reports/journal-260628-fallow-tool-integration-rule.md`

## Implementation Steps

1. **Read `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist.test.js`** to mirror its structure (already read in research).
2. **Create the regression test file.** Frozen shape:
   ```js
   import assert from "node:assert";
   import { test } from "node:test";
   import { applyPromotedRules } from "../../core/gate-logic.js";
   import { metaStateRuleEntrySchema } from "../../core/meta-state.js";
   import { buildProcessHints } from "../../core/loop-introspect.js";

   const RULE_ID = "rule-tool-integration-same-commit-dep";

   await test("rule-tool-integration-same-commit-dep loads through schema and is a no-op for applyPromotedRules", () => {
     const rule = metaStateRuleEntrySchema.parse({
       entry_kind: "rule",
       id: RULE_ID,
       origin: "meta-260628T1328Z-commit-6f9402e-wired-fallow-audit-gate-new-only-into-ci-but",
       enforcement: "agent",
       pattern_type: "consult-checklist",
       pattern: JSON.stringify({
         version: 1,
         items: [
           { id: "same-commit-dependency", description: "..." },
           { id: "baseline-flag-format", description: "..." },
           { id: "baseline-storage", description: "..." },
         ],
       }),
       description: "Tool integration hygiene: same-commit dependency, baseline flag format, and baseline storage.",
       status: "active",
       promoted_at: "2026-06-28T07:00:00.000Z",
       promoted_by: "operator",
     });

     const result = applyPromotedRules(
       "pnpm exec fallow audit --gate new-only",
       null,
       [rule],
       "/tmp/consult-checklist-tool-integration-test-root",
     );

     assert.deepStrictEqual(result, { decision: "ok" });
   });

   await test("PROCESS_HINTS has a row containing the literal rule-tool-integration-same-commit-dep id (R-HIGH-7 drift guard)", () => {
     const processHints = buildProcessHints();
     // H6 ordering gate at loop-describe-tool.js:90-102 uses substring match:
     //   processHints.some((h) => h.includes(rule.id))
     // A future contributor who paraphrases the row ("the tool-integration checklist")
     // would silently break the gate. This test catches that drift.
     const mentions = processHints.some((row) => row.includes(RULE_ID));
     assert.strictEqual(mentions, true, `PROCESS_HINTS must contain literal substring ${RULE_ID}`);
   });

   await test("hook mirror LOCAL_PROCESS_HINTS contains the same rule id (cold-session parity guard)", () => {
     // cold-session-discoverability.test.cjs:366-386 enforces strictEqual, but that
     // test runs in isolation. This test asserts the literal id is present in the
     // hook mirror array, giving a faster signal if the mirror is forgotten.
     const hookSource = require("node:fs").readFileSync(".factory/hooks/loop-surface-inject.cjs", "utf8");
     assert.ok(
       hookSource.includes(RULE_ID),
       `LOCAL_PROCESS_HINTS in .factory/hooks/loop-surface-inject.cjs must contain literal substring ${RULE_ID}`,
     );
   });
   ```
   (Truncate the description strings with "..." in the actual file — use the full descriptions from `plan.md` Appendix A.)
3. **Run the targeted test:** `cd tools/learning-loop-mastra && node --test __tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js`. Expected: 3 tests pass.
4. **Run the full test suite:** `pnpm test`. Expected: all green, test count delta = **+3** (corrected from +1 per R-MED-2).
5. **Run `loop_describe({tier: warm})`** via the MCP tool. Expected: `warnings: []` (H6 ordering gate satisfied because the 4th PROCESS_HINTS row contains the literal rule id).
6. **Verify meta-state consistency:**
   - `meta_state_list({entry_kind: "finding", id: [<3-finding-ids>]})` → all 3 with `status: resolved`, `resolved_by: "operator"`, non-null `resolved_at`
   - `meta_state_list({entry_kind: "rule", id: "rule-tool-integration-same-commit-dep"})` → 1 entry with `status: active`
   - `meta_state_list({entry_kind: "change-log", id: "meta-260628T1337Z-promoted-rule-tool-integration-same-co"})` → 1 entry with `applies_to.rules` and NO `consolidates` field
7. **Write the journal entry** at `plans/reports/journal-260628-fallow-tool-integration-rule.md`. Frozen shape (mirrors `journal-260627-phase-e-dead-code-sweep-shipped.md`, with corrections from R-MED-1, R-MED-2, R-HIGH-2):
   ```markdown
   # 2026-06-28 — Fallow Tool Integration Rule Encoding

   **What shipped:** rule-tool-integration-same-commit-dep (consult-checklist, 3 items), PROCESS_HINTS row, hook mirror update, core/README.md §Tool integration checklist, 3 active findings resolved, 1 change-log entry.

   **Why it matters:** the 3 anti-pattern findings from the dead-code sweep ship journal had preventive rules captured in their descriptions but not encoded in the registry. Encoding them as a single consult-checklist rule means future tool integrations surface the checklist at PR review (PROCESS_HINTS row + mirror) and during agent task reasoning (consult-checklist).

   **Files modified:**
   - `meta-state.jsonl`: +2 entries (rule + change-log); 3 finding entries: active → resolved; source finding version bumped via meta_state_promote_rule side-effect
   - `tools/learning-loop-mastra/core/loop-introspect.js`: +1 PROCESS_HINTS row (between line 119 and `]);` line 120)
   - `.factory/hooks/loop-surface-inject.cjs`: +1 LOCAL_PROCESS_HINTS row (mirror)
   - `tools/learning-loop-mastra/core/README.md`: +"Tool integration checklist" section after line 64
   - `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js`: new file, 3 tests

   **Test delta:** 1308 → 1311 (+3 tests). All green.

   **Lessons:**
   - consult-checklist rules are a no-op for applyPromotedRules (gate-logic.js:762-767); the agent is the enforcement surface via PROCESS_HINTS rendering.
   - The canonical "encoded as rule-X" pattern is `status=resolved` + `resolution` text, NOT `status=superseded` + `consolidated_into=rule-...` (consolidated_into targets change-logs per meta-state.js:75-76).
   - The H6 ordering gate (loop-describe-tool.js:90-102) uses a substring match (`processHints.some(h => h.includes(rule.id))`); PROCESS_HINTS row text must include the literal rule id, not a paraphrase.
   - The cold-session parity test (cold-session-discoverability.test.cjs:366-386) strictEqual-enforces parity between canonical PROCESS_HINTS and hook mirror LOCAL_PROCESS_HINTS. ANY drift fails the test loudly — there is no "close enough" for hooks.
   - `meta_state_promote_rule` hard-codes the description field (line 169); custom descriptions cannot land. Plan Appendix A was updated to reflect this.
   - `meta_state_log_change` has a 60s idempotency cache (verified at meta-state-log-change-tool.js:9, 69-80); retry with identical args silently no-ops. Strategy: vary `reason` on retry.
   - `rule-no-orphaned-evidence` is a global `resolution-evidence-required` consult gate; findings with `mechanism_check: true` must have a current `code_fingerprint` before resolution. Call `meta_state_refresh_fingerprint` first.

   **Followups:**
   - Consider a CI advisory for `.github/workflows/*.yml` edits that reminds reviewers about the same-commit dependency check (would require a separate loop-design entry; out of scope here).
   - The 4 PROCESS_HINTS rows are now load-bearing for 4 different rule enforcements; consider adding an invariant test that asserts every active consult-checklist rule has a matching PROCESS_HINTS row.
   - (Per Validation Q3) `loop-design-encode-n-anti-pattern-findings-as-consult-checklist-rule` filed in Phase 4 step 9 captures the meta-pattern. Future plans encoding N findings as a single rule should consult this design.
   ```
8. **Mark Phase 5 complete** via `ck plan check`.

## Success Criteria

- [ ] New regression test file exists with 3 passing tests
- [ ] `pnpm test` passes with delta = **+3** (1308 → 1311)
- [ ] `loop_describe({tier: warm})` returns `warnings: []`
- [ ] All 3 finding entries verified `status: resolved` with `resolved_by: "operator"` and non-null `resolved_at`
- [ ] Change-log entry verified with `applies_to.rules` and NO `consolidates` field
- [ ] Journal entry written at `plans/reports/journal-260628-fallow-tool-integration-rule.md`
- [ ] Phase 5 marked complete via `ck plan check`

## Risk Assessment

- **R1 — New test fails because rule schema rejects the pattern body.** Mitigation: the body is identical to the `rule-runtime-agnostic-features` precedent shape (line 127); if it fails, the error message identifies the field.
- **R2 — `pnpm test` discovers the new test file in a way that breaks the namespaced runner.** Mitigation: the file lives under `__tests__/legacy-mcp/` which is the standard test directory; the runner config (`tools/scripts/run-pnpm-test-namespaced.mjs:31` glob `tools/learning-loop-mastra/__tests__/legacy-mcp/*.test.js`) already handles this path.
- **R3 — `loop_describe({tier: warm})` still warns.** Mitigation: Phase 2 step 7 smoke-test catches this BEFORE Phase 4 begins. If Phase 5 still sees warnings (e.g., PROCESS_HINTS row was modified between phases), debug by reading the warning text and the rule id; the drift-guard test added in step 2 catches paraphrase drift.
- **R4 — Hook mirror test (test c) fails if file is moved.** Mitigation: the test reads `.factory/hooks/loop-surface-inject.cjs` from cwd; the namespaced runner sets cwd to `tools/learning-loop-mastra/`, so the relative path `.factory/hooks/...` resolves to `/home/<user>/.../learning-loop-template/.factory/hooks/...`. If the runner's cwd changes, this path needs updating.