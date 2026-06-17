---
phase: 1
title: "phase-1-cold-session-test-isolation"
status: pending
effort: "30min"
---

# Phase 1: Cold-Session Test Isolation (CR-3)

## Overview

Fix the pre-existing flake in `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` at the hook-mirror test (line 341) by making the test self-contained. Currently the test relies on test ordering — hooks registered at module scope may have been torn down by a prior test. The fix registers hooks inside `before()` so the test owns its lifecycle.

## Context Links

- `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md` (CR-3 origin)
- `plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md` Q2 (operator decision: pick one approach)
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:341` (target line; hook-mirror test)

## Requirements

- **Functional:** `cold-session-discoverability.test.cjs` runs GREEN when executed in isolation (e.g., `node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`) and as part of the full `pnpm test` suite.
- **Non-functional:** No new dependencies; minimal LOC change (5-15 LOC).

## Architecture

Move hook registration from module-scope `import` time to `before()` (or `beforeEach()`) callback so the test owns its hook lifecycle. This is the standard pattern for self-contained Node test files.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:341` (the hook-mirror test block; surrounding `describe` may need import restructuring)

## Implementation Steps

1. **Read** `cold-session-discoverability.test.cjs:1-50` to identify how hooks are currently registered (likely at module scope via `register()` import).
2. **Identify** the hook-mirror test block at line 341 and the hooks it depends on.
3. **Refactor** to register the hooks inside `before()` so the test owns its setup/teardown.
4. **Verify** isolation: `node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` runs GREEN in a fresh process.
5. **Verify** integration: `pnpm test` runs GREEN with all 10 namespaces; no regressions.

## Success Criteria

- [ ] `node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` runs GREEN in isolation.
- [ ] `pnpm test` runs GREEN with all 10 namespaces; no new skips; no new failures.
- [ ] The hook-mirror test at line 341 is self-contained: hooks registered in `before()`, torn down in `after()`.
- [ ] No new dependencies added.

## Risk Assessment

- **Risk:** Refactoring hook registration changes the timing of side effects. **Mitigation:** The current test passes when run as part of `pnpm test` (verified 1069 pass / 0 fail / 1 skip in Plan 1a closeout). The refactor only affects the isolated-run path.
- **Risk:** Other tests in the same file depend on the global hook state. **Mitigation:** Read the full file before refactoring; if any test depends on shared hook state, scope the `before()` to a sub-`describe` block.

## TDD Note

This phase is GREEN-only (no RED-first test) because the pre-existing test is already GREEN in the full suite. The "test" for this fix is the isolated-run path: `node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` must pass. If the current test fails in isolation, write a RED test that asserts "this test runs GREEN in isolation" — but this is a process-level assertion, not a code-level test, and may not be necessary if the fix is verified manually.

## Next Steps

- Phase 2 (mutex scope per-connection) builds on the test infra stability established here.
