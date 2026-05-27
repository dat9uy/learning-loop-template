---
phase: 3
title: "Move Fixtures and Wire Negative Runner"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Move Fixtures and Wire Negative Runner

## Overview

Move `fixtures/` from repo root into `tools/learning-loop-mcp/fixtures/` and update the negative fixture runner to resolve from the new location. Update any hardcoded fixture paths in code, tests, and docs.

## Related Code Files

- Move: `fixtures/negative/` -> `tools/learning-loop-mcp/fixtures/negative/`
- Move: `fixtures/capability-source-allowlist-valid/` -> `tools/learning-loop-mcp/fixtures/capability-source-allowlist-valid/`
- Modify: `tools/learning-loop-mcp/core/negative-fixture-runner.js` (update fixture root resolution)
- Modify: `tools/learning-loop-mcp/tools/validate-records-tool.js` (pass fixture path to runner)
- Modify: `tools/learning-loop-mcp/__tests__/validation-centralization.test.js` (update fixture path)

## Implementation Steps

1. `git mv fixtures/negative tools/learning-loop-mcp/fixtures/negative`
2. `git mv fixtures/capability-source-allowlist-valid tools/learning-loop-mcp/fixtures/capability-source-allowlist-valid`
3. Update `negative-fixture-runner.js:runNegativeFixtures` fixture root:
   ```js
   // Before:
   records = loadRecords(rootPath, join(rootPath, "fixtures", "negative", fixture));
   // After:
   const fixtureRoot = join(rootPath, "tools", "learning-loop-mcp", "fixtures", "negative");
   records = loadRecords(rootPath, join(fixtureRoot, fixture));
   ```
4. Update `validate-records-tool.js` to pass `fixture_root` parameter (or compute it internally from `root`).
5. Audit repo for hardcoded `fixtures/` paths:
   ```bash
   rg "fixtures/" --type js --type md tools/learning-loop-mcp/
   ```
   Update any test files, docs, or references.
6. Run `pnpm test` — confirm fixture runner still finds all 26 cases.
7. Run `pnpm validate:records` — confirm old CLI still works (it uses the old path, which is fine — we're not deleting it yet).
8. Commit.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `rg` misses a hardcoded fixture path | Medium | Also grep `fixtures` in `.claude/`, `.factory/`, `docs/`, `plans/` |
| Fixture runner uses cwd instead of repo root | Medium | `resolveRoot` from `#lib/resolve-root.js` already handles this |

## Success Criteria

- [ ] `fixtures/` at repo root is empty (or deleted after git mv).
- [ ] `tools/learning-loop-mcp/fixtures/negative/` contains all 26 negative fixture directories.
- [ ] `tools/learning-loop-mcp/fixtures/capability-source-allowlist-valid/` exists.
- [ ] `runNegativeFixtures` resolves fixtures from new path and returns 0 errors for valid fixtures.
- [ ] Phase 1 tests still pass with updated paths.
