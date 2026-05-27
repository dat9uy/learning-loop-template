---
phase: 4
title: "Delete Procedural Runner"
status: pending
priority: P2
effort: "1h"
dependencies: [2, 3]
---

# Phase 4: Delete Procedural Runner

## Overview

Delete `tools/learning-loop-mcp/workflow-runner.js` and `.claude/coordination/workflows.json`. These are the procedural core that spawned child processes. Their functionality is now replaced by the registry + refactored MCP tools.

## Requirements

- **Functional:** Remove files; verify no imports remain; keep CLI scripts (`extract-index-cli.js`, etc.) for CI.
- **Non-functional:** Clean git history; no orphaned references.

## Related Code Files

- **Delete:** `tools/learning-loop-mcp/workflow-runner.js`
- **Delete:** `.claude/coordination/workflows.json`
- **Verify no imports:** Grep for `workflow-runner` across `tools/learning-loop-mcp/`
- **Keep:** `tools/extract-index-cli.js`, `tools/validate-records-cli.js`, `tools/generate-capabilities-cli.js` (standalone CI scripts)

## Implementation Steps

1. **Verify zero imports:**
   ```bash
   rg "workflow-runner" tools/learning-loop-mcp/ --type js
   ```
   Should return nothing after Phases 2 and 3.

2. **Delete `workflow-runner.js`:**
   ```bash
   git rm tools/learning-loop-mcp/workflow-runner.js
   ```

3. **Delete `workflows.json`:**
   ```bash
   git rm .claude/coordination/workflows.json
   ```

4. **Update workflow-log path (optional):**
   - `.claude/coordination/workflow-log.jsonl` can stay for audit trail.
   - Update log format documentation if needed (now logs recommendations, not PIDs).

5. **Verify tests still pass:**
   ```bash
   pnpm test
   ```
   No test should reference `workflow-runner.js`.

## Tests

No new tests needed — this phase is deletion. Verification via:
- `pnpm test` passes.
- `rg "workflow-runner" tools/` returns empty.
- `rg "workflows.json" .` returns only references in docs/history.

## Success Criteria

- [ ] `workflow-runner.js` deleted.
- [ ] `workflows.json` deleted.
- [ ] `pnpm test` passes.
- [ ] No remaining imports of deleted files.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hidden import in unvisited file | Low | `rg` search across entire repo before deletion. |
| External script references runner | Low | Runner was internal-only; no external consumers known. |
