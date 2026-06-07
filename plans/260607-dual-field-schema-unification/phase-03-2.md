---
phase: 3
title: "2 — Schema flatten (top-level canonical)"
status: pending
priority: P1
effort: "1h"
dependencies: ["1"]
---

# Phase 2: Schema flatten (top-level canonical)

## Overview

Remove the nested `evidence` block from `metaStateChangeEntrySchema`. Add `evidence_code_ref`, `evidence_journal`, `evidence_test` as top-level optional fields on all 4 schemas. **RED→GREEN:** Phase 1's T-3 turns green; T-1 still fails (entries not migrated yet — that's Phase 4).

## Requirements

- **Functional:**
  - `metaStateChangeEntrySchema`: remove `evidence: z.object({ code_ref, journal })` block; add `evidence_code_ref`, `evidence_journal`, `evidence_test` as top-level optional (mirroring `metaStateFindingEntrySchema`).
  - `metaStateFindingEntrySchema`: add `evidence_journal: z.string().optional()` and `evidence_test: z.string().optional()` as top-level optional (already has `evidence_code_ref`).
  - `metaStateRuleEntrySchema`: add `evidence_journal`, `evidence_test` as top-level optional (already has `evidence_code_ref`).
  - `metaStateLoopDesignSchema`: no change (loop-designs don't have evidence).
  - `metaStateEntrySchema` (the union): no shape change (it's a `z.union` of the 4 branches).
  - `summarize()` in `core/loop-introspect.js`: verify the 24+ field whitelist reads top-level only (no change expected; the existing whitelist already prefers top-level).
- **Non-functional:** backward compatibility is NOT preserved at the schema level (clean break, per the brainstorm decision). The 30 existing entries with nested form are migrated in Phase 4.

## Architecture

The 4 branch schemas converge on the same field set: `evidence_code_ref`, `evidence_journal`, `evidence_test` (all optional, all top-level). No nested `evidence` block anywhere. The Zod union accepts any of the 4 shapes; cross-shape consistency is now structural (not enforced, but uniform).

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/meta-state.js` (4 schema definitions)
- **Verify no change:** `tools/learning-loop-mcp/core/loop-introspect.js#summarize` (the field whitelist)
- **Modify:** `tools/learning-loop-mcp/__tests__/meta-state-schema.test.js` (new tests)
- **Verify no change:** `tools/learning-loop-mcp/__tests__/meta-state-rule-schema.test.js`, `meta-state-loop-design-schema.test.js`

## Implementation Steps

1. **Modify `metaStateChangeEntrySchema`.** Remove the `evidence: z.object({...}).optional()` block. Add 3 top-level optional fields: `evidence_code_ref`, `evidence_journal`, `evidence_test`. Update the schema's docstring to mention top-level.
2. **Verify `metaStateFindingEntrySchema`.** Confirm `evidence_journal`, `evidence_code_ref`, `evidence_test` already exist as top-level optional fields. (No change needed — already correct.)
3. **Modify `metaStateRuleEntrySchema`.** Add 2 new top-level optional fields: `evidence_journal`, `evidence_test`. (Already has `evidence_code_ref`.)
4. **Add `evidence_code_ref` to `summarize()` in `loop-introspect.js`.** The current `summarize()` whitelist does NOT include `evidence_code_ref` at all. Add it (and `evidence_journal`, `evidence_test`) to the whitelist so compact mode exposes evidence references. Add a regression test in `meta-state-list-compact.test.js` that asserts the field is present after the change.
5. **Update `meta-state-schema.test.js`.** Add 3 new tests:
   - "change-log schema accepts top-level `evidence_code_ref`"
   - "change-log schema rejects nested `evidence.code_ref` (after clean break)"
   - "3 of 3 applicable union branches expose `evidence_code_ref` top-level (loop-design exempt)"
6. **Run Phase 1's coverage test.** T-1 still fails (30 entries unchanged). T-3 turns GREEN. Confirm no regressions in `meta-state-rule-schema.test.js` and `meta-state-loop-design-schema.test.js`.

## Success Criteria

- [ ] 3 schema definitions updated (change-log, rule; finding already correct); all expose `evidence_code_ref` as top-level optional
- [ ] `summarize()` in `loop-introspect.js` includes `evidence_code_ref`, `evidence_journal`, `evidence_test`
- [ ] T-3 from Phase 1 turns GREEN
- [ ] T-1 from Phase 1 still RED (entries not migrated yet)
- [ ] `pnpm test tools/learning-loop-mcp/__tests__/meta-state-schema.test.js` passes
- [ ] `pnpm test tools/learning-loop-mcp/__tests__/meta-state-rule-schema.test.js` passes (regression guard)
- [ ] `pnpm test tools/learning-loop-mcp/__tests__/meta-state-loop-design-schema.test.js` passes (regression guard)
- [ ] `pnpm test tools/learning-loop-mcp/__tests__/meta-state-evidence-coverage.test.js` shows T-3 GREEN
- [ ] `pnpm test tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js` passes (updated to assert `evidence_code_ref` is present)

## Risk Assessment

- **Risk:** `summarize()` omits `evidence_code_ref` entirely, so compact mode never exposes it. **Mitigation:** add `evidence_code_ref`, `evidence_journal`, `evidence_test` to the `summarize()` whitelist in this phase. Add a regression test in `meta-state-list-compact.test.js`.
- **Risk:** The change-log entries still carry the old shape and now FAIL `metaStateChangeEntrySchema.safeParse`. **Mitigation:** acceptable — `writeEntry` and `updateEntry` are still unvalidated in Phase 3 (validation is Phase 5). Phase 4 (migration) must complete before Phase 5.
- **Risk:** A test fixture in some other test file uses nested form. **Mitigation:** `grep -r "evidence?.code_ref\|evidence.code_ref" tools/learning-loop-mcp/__tests__/` to find all fixtures. Update them in this phase (small diffs).
