# Batch cleanup after planning-order sequence

**Date**: 2026-06-16 01:30
**Severity**: Low
**Component**: tools/learning-loop-mcp/{core,hooks,tools}, plans/reports, meta-state.jsonl
**Status**: Resolved

## What Happened

Shipped the CLEANUP batch that closes the planning-order sequence (Step 1 + Step 2 + Step 4). 15 cosmetic/hygiene items, 0 behavior regressions. Full test suite: 988/989 pass, 1 skipped (baseline 986/987; +2 tests from strengthened assertions).

## Technical Details

- **core/surfaces.js**: file-level JSDoc (1.2); `readModifyWriteOnAllSurfaces` WARNING block on cross-surface atomicity (4.3); `sanitizeErrorMessage` helper strips user-derived paths from 4 `console.error` call sites (F-5).
- **core/runtime-agnostic-checklist.js**: CHECKLIST descriptions name canonical helpers (4.1); `stripCommentsAndStrings` preprocessor eliminates false positives on comments/template literals before regex testing (4.5); shim-mirror check uses SHA-256 hash comparison (4.2).
- **core/recurrence-tracker.js**: `generateFindingId` uses `crypto.randomBytes(4).toString("hex")` instead of `Math.random()` (2.3).
- **core/inbound-state.js**: removed 2 stale `// fallow-ignore-next-line complexity` comments (1.1).
- **hooks/recurrence-check-on-start.js**: explicit "Intentionally ignored" comment on `readFileSync(0, "utf8")` (2.4).
- **tools/gate-check-recurrence-tool.js**: handler builds options conditionally, no explicit `undefined` keys (2.5).
- **Tests**: `surfaces.test.js` uses `chmodSync(0o000)` for Unix-only permission-denied coverage (1.5); `gate-logic-glob-whitelist.test.js` asserts `GLOB_SCOPE_WHITELIST` derives from `SURFACES.map` (1.4); `runtime-agnostic.test.js` adds mismatched-shim hash test + `stripCommentsAndStrings` contract test.
- **Docs**: Step 1 plan `phase-01-surfaces-helper.md` gained a `## Resolution Log`; Step 2 plan removed aspirational `skipped_via_override` field; Step 4 plan + phase files replaced stale line-number citations with symbol references.
- **Meta-state**: 1 change-log entry (`meta-260616T0132Z-...`) + 2 loop-design entries (`loop-design-ast-based-runtime-agnostic-check`, `loop-design-recurrence-tracker-mcp-mediation`).

## What We Tried

- Phase 6 preprocessor design tension: stripping quoted strings would break the hard-coded-path regex (it matches string contents). Kept quoted strings, stripped only comments and template literals; documented the trade-off in JSDoc.
- Phase 5 test strengthening: the original 1.4 plan used `vi.doMock`, but the project uses Node's built-in test runner. Replaced with a static source assertion that `GLOB_SCOPE_WHITELIST` is parameterized on `SURFACES`.

## Lessons Learned

1. **Cosmetic backlog grows fast; batch it after the sequence ships.** 15 items scattered across 4 plans would have churned plan-of-record PRs. One cleanup plan keeps the diff reviewable.
2. **Regex-based audits need false-positive elimination, not bypass elimination.** The 9 known syntax bypasses are accepted limitation of a lowest-common-denominator check. The AST-based follow-up is filed as a loop-design, not folded into a cleanup batch.
3. **PII-safe logging applies to failure paths too.** F-5 only affected `console.error`; success path was already safe. Failure-path leaks are easy to miss in code review.

## Next Steps

- Planning-order sequence is fully closed. No further cleanup items remain in the report.
- Two loop-design entries track deferred work: AST-based runtime-agnostic check (closes 9 bypasses) and recurrence-tracker MCP-mediation (replace direct `appendFileSync` with `meta_state_report`).
