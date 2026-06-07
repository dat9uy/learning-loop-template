---
phase: 6
title: "5 — Update 4 writers to top-level only"
status: completed
priority: P1
effort: "30m"
dependencies: ["4"]
---

# Phase 5: Update 4 writers to top-level only

## Overview

Remove dual-write from `metaStateReportTool`. Remove nested `evidence` block from `metaStateLogChangeTool`. Verify `metaStateProposeDesignTool` and `metaStatePromoteRuleTool` are unchanged (they already use top-level). **GREEN:** 2 new tests pass; tool description strings updated.

## Requirements

- **Functional:**
  - `metaStateReportTool.handler`: remove the `evidence: { ... }` block from the entry construction. Top-level `evidence_code_ref`, `evidence_test`, `evidence_journal` remain (already top-level).
  - `metaStateLogChangeTool.handler`: change `evidence: { code_ref, journal }` to top-level `evidence_code_ref`, `evidence_journal`.
  - `metaStateProposeDesignTool`: verify (no code change). Loop-designs do not carry evidence fields.
  - `metaStatePromoteRuleTool`: verify (no code change). The tool does not write evidence fields on the rule entry.
  - Update the tool description strings for `meta_state_report` and `meta_state_log_change` to explicitly mention "top-level" fields.
- **Non-functional:** the 5 consumers (`query-drift`, `derive-status`, `check-grounding`, `refresh-fingerprint`, `backfill-mechanism-check`) all read top-level only after this phase. Their legacy fallback `entry.evidence_code_ref ?? entry.evidence?.code_ref` is removed in a follow-up commit (after the consult-gate rule Phase 7 is verified).

## Architecture

Pure writer change. No schema changes (already done in Phase 3). The 4 writer tools converge on a single convention: all evidence is top-level.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/tools/meta-state-report-tool.js` (remove nested `evidence` block, update description)
- **Modify:** `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` (top-level only, update description)
- **Verify no change:** `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js`
- **Verify no change:** `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js`
- **Modify:** `tools/learning-loop-mcp/__tests__/meta-state-report-tool-extension.test.js` (1 new test)
- **Modify:** `tools/learning-loop-mcp/__tests__/meta-state-log-change.test.js` (1 new test)

## Implementation Steps

1. **Modify `metaStateReportTool.handler`.** Remove the `evidence: { ...(evidence_code_ref && { code_ref: evidence_code_ref }), ...(evidence_journal && { journal: evidence_journal }), ...(evidence_test && { test: evidence_test }) }` block. The top-level `evidence_code_ref`, `evidence_test`, `evidence_journal` are already conditionally added. The tool description string already mentions `evidence_code_ref` (no change needed).
2. **Modify `metaStateLogChangeTool.handler`.** Change:
   ```js
   evidence: {
     ...(evidence_code_ref && { code_ref: evidence_code_ref }),
     ...(evidence_journal && { journal: evidence_journal }),
   },
   ```
   to:
   ```js
   ...(evidence_code_ref && { evidence_code_ref }),
   ...(evidence_journal && { evidence_journal }),
   ```
   Update the tool description string.
3. **Verify `metaStateProposeDesignTool`.** Read the file. Confirm it does NOT have any `evidence.code_ref` or `evidence.code_ref` references. (Expected: yes, no change needed — loop-designs do not carry evidence fields.)
4. **Verify `metaStatePromoteRuleTool`.** Read the file. Confirm it does NOT write any evidence fields on the rule entry. (Expected: yes, no change needed — the tool does not use evidence fields.)
5. **Add 1 new test in `meta-state-report-tool-extension.test.js`:**
   - "report tool writes no nested `evidence` block (only top-level fields)". Construct a valid entry via the tool handler. Assert the resulting entry has `evidence_code_ref` set and NO `evidence.code_ref` (and NO `evidence` block at all).
6. **Add 1 new test in `meta-state-log-change.test.js`:**
   - "log-change tool writes top-level `evidence_code_ref`, not nested `evidence.code_ref`". Same shape as the report test, but for the log-change tool.
7. **Run the test suite.** `pnpm test`. All 2 new tests pass; no regressions in the 2 unchanged writers; no regressions in the 4 kind schemas.

## Success Criteria

- [ ] `metaStateReportTool` writes only top-level fields
- [ ] `metaStateLogChangeTool` writes only top-level fields
- [ ] `metaStateProposeDesignTool` verified unchanged (loop-designs do not carry evidence)
- [ ] `metaStatePromoteRuleTool` verified unchanged (rule tool does not write evidence fields)
- [ ] 2 new tests pass (1 in report, 1 in log-change)
- [ ] `pnpm test` passes (0 failures expected)

## Risk Assessment

- **Risk:** A consumer somewhere still reads the nested form. **Mitigation:** `grep -r "evidence?.code_ref\|evidence.code_ref" tools/learning-loop-mcp/ --include="*.js"`. The 4 known consumers (`query-drift`, `derive-status`, `check-grounding`, `refresh-fingerprint`, `backfill-mechanism-check`) still have the legacy fallback; they continue to work (the legacy form is just empty after this phase). A follow-up commit removes the legacy fallback.
- **Risk:** A test fixture in some other test file uses the tool handlers to build entries and asserts nested form. **Mitigation:** grep for nested-form assertions. Update them in this phase (small diffs).
- **Risk:** The tool description strings reference the old shape and confuse new agents. **Mitigation:** the description strings already mention `evidence_code_ref` (no change needed).
