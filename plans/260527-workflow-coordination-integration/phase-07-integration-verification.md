---
phase: 7
title: "Integration Verification"
status: pending
priority: P1
effort: "2h"
dependencies: [1, 2, 3, 4, 5, 6]
---

# Phase 7: Integration Verification

## Overview

End-to-end verification that the new coordination model works: registry evaluates triggers, `workflow_notify_artifact` returns recommendations, `workflow_trigger` returns tool lists, pre-commit blocks bad commits, and all tests pass.

## Requirements

- **Functional:** Every original workflow (evidence, observation, capability, index) has equivalent coverage via explicit MCP tool chains.
- **Non-functional:** No regressions in existing tests; no stale references to deleted files.

## Architecture

```
Verification Flow:
  1. Create a temp evidence file in records/product/evidence/
  2. Call workflow_notify_artifact → verify returns index_extract + index_validate
  3. Call workflow_trigger("evidence-changed") → verify returns same tools
  4. Stage the evidence file, attempt commit → verify pre-commit runs validation
  5. Run full test suite → verify no failures
  6. Grep for "workflow-runner" and "workflows.json" → verify zero matches in code
```

## Related Code Files

- **All phases' outputs:** Registry, refactored tools, deleted files, pre-commit config, updated docs.
- **Run:** `pnpm test`
- **Run:** `pnpm check` (full validation pipeline)
- **Grep:** `rg "workflow-runner" tools/` and `rg "workflows.json" .`

## Implementation Steps

1. **Registry + tool integration test:**
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   node -e "
     const { evaluateTriggers } = require('./tools/learning-loop-mcp/core/workflow-registry.js');
     const r = evaluateTriggers('records/product/evidence/foo.md', 'created');
     console.log(JSON.stringify(r));
   "
   ```
   Expect: `{ matched: ["evidence-changed"], recommendations: ["index_extract", "index_validate"] }`

2. **Notify artifact tool test:**
   ```bash
   node tools/learning-loop-mcp/tools/notify-artifact-tool.test.js
   ```
   (Or via `node --test` if the test file is set up as a proper Node test.)

3. **Trigger workflow tool test:**
   ```bash
   node tools/learning-loop-mcp/tools/trigger-workflow-tool.test.js
   ```

4. **Pre-commit hook test:**
   ```bash
   # Create a deliberately invalid record
   echo "invalid: yaml: [" > /tmp/test-evidence.md
   cp /tmp/test-evidence.md records/product/evidence/test-invalid.md
   git add records/product/evidence/test-invalid.md
   git commit -m "test: should fail validation" || echo "Commit blocked as expected"
   rm records/product/evidence/test-invalid.md
   git reset HEAD records/product/evidence/test-invalid.md
   ```

5. **Full test suite:**
   ```bash
   pnpm test
   ```

6. **Stale reference check:**
   ```bash
   rg "workflow-runner" tools/ --type js || echo "Clean"
   rg "workflows.json" . --type js --type json || echo "Clean"
   ```

## Tests

No new test files in this phase — it orchestrates all previous phases' tests. Key checks:
- `pnpm test` exits 0.
- `pnpm check` exits 0.
- Pre-commit blocks commits with invalid records.
- `workflow_notify_artifact` returns correct recommendations for all 4 trigger types.
- `workflow_trigger` returns correct tool lists for all 4 workflow names.

## Success Criteria

- [ ] `pnpm test` passes (all existing + new tests).
- [ ] `pnpm check` passes.
- [ ] Pre-commit hook blocks commits with invalid records.
- [ ] `workflow_notify_artifact` returns correct recommendations for all 4 trigger types.
- [ ] `workflow_trigger` returns correct tool lists for all 4 workflow names.
- [ ] Zero references to `workflow-runner.js` in code.
- [ ] Zero references to `workflows.json` in code.
- [ ] Both skill files updated symmetrically.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Test failure in unrelated module | Medium | Run `pnpm test` after each phase, not just at the end. |
| Pre-commit hook breaks existing commit flow | Low | Test with a trivial valid change first; validate that good commits still pass. |
| Agent manifest has stale tool descriptions | Low | Explicit check in this phase's criteria. |
