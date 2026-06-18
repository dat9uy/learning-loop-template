---
phase: 1
title: "File-move precondition"
status: pending
priority: P1
effort: "30min"
dependencies: []
---

# Phase 1: File-move precondition

## Overview

Move 8 `workflow-*.js` files from `tools/learning-loop-mcp/tools/` → `tools/learning-loop-mastra/workflows/` (new dir). Update internal import paths. Temporarily disable workflow loading in `tools/learning-loop-mastra/server.js` to keep mastra parity GREEN during the move — full re-enablement happens in Phase 4. Mechanical precondition; no new behavior, no test failures.

## Why a separate phase

The brainstorm at `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` §"Critical Phase D Planning Finding" flagged that workflow implementations **still live in `tools/learning-loop-mcp/tools/`** even though `tools/learning-loop-mastra/server.js` imports them via `#mcp/*`. The Mastra peer server's `tools/manifest.json` references them as if they are Mastra tools (8 `mastra_workflow_*` entries), but the implementations are not co-located with the other Mastra artifacts.

Phase C Plan 3 (cut-over) closed C6+C7 without moving the files because the migration only swapped the runtime (McpServer → MCPServer). Plan 1 must move them because `createWorkflow` wrappers need to live next to the existing `createTool` wrappers in the mastra package.

## Requirements

- **Functional:** all 8 files relocated to `tools/learning-loop-mastra/workflows/`; internal `import` paths updated; `tools/learning-loop-mastra/server.js` no longer imports the 8 workflow files at runtime (via skip list); all 10 test namespaces still pass against the mastra server post-move.
- **Non-functional:** no behavior change. Files move as-is. No `createWorkflow` wrappers added yet (Phase 3).

## Architecture

```
Before:
tools/learning-loop-mcp/tools/
  ├── workflow-intake-orient-tool.js        ← moves
  ├── workflow-intake-plan-tool.js          ← moves
  ├── workflow-classify-prompt-tool.js      ← moves
  ├── workflow-prepare-runtime-request-tool.js ← moves
  ├── workflow-self-improvement-tool.js     ← moves
  ├── workflow-intentional-skip-tool.js     ← moves
  ├── workflow-report-phase-status-tool.js  ← moves
  └── workflow-runtime-probe-tool.js        ← moves

After (Phase 1):
tools/learning-loop-mastra/workflows/      ← new dir
  ├── workflow-intake-orient.js             ← moved (renamed: drop -tool)
  ├── workflow-intake-plan.js               ← moved
  ├── workflow-classify-prompt.js           ← moved
  ├── workflow-prepare-runtime-request.js   ← moved
  ├── workflow-self-improvement.js          ← moved
  ├── workflow-intentional-skip.js          ← moved
  ├── workflow-report-phase-status.js       ← moved
  └── workflow-runtime-probe.js             ← moved
```

**File rename:** legacy files end in `-tool.js` (e.g., `workflow-intake-orient-tool.js`); new files drop the `-tool` suffix. Standard loop naming for non-tool modules. Phase 3's `createWorkflow` wrappers live in the same files; exported name pattern shifts from `workflowXxxTool` (legacy) to `workflowXxx` (Mastra).

**Server.js status during Phase 1:** the `MANIFEST` JSON includes the 8 `workflow_*` entries. Phase 1 does NOT modify `tools/manifest.json` (Phase 4 work) — but it does temporarily skip the 8 entries via a `SKIP_FILES` set. Legacy files stay in `tools/learning-loop-mcp/tools/` until Phase 3 deletes them after the new wrappers are in place.

## Related Code Files

- **Move (8 files):**
  - `tools/learning-loop-mcp/tools/workflow-intake-orient-tool.js` → `tools/learning-loop-mastra/workflows/workflow-intake-orient.js`
  - `tools/learning-loop-mcp/tools/workflow-intake-plan-tool.js` → `tools/learning-loop-mastra/workflows/workflow-intake-plan.js`
  - `tools/learning-loop-mcp/tools/workflow-classify-prompt-tool.js` → `tools/learning-loop-mastra/workflows/workflow-classify-prompt.js`
  - `tools/learning-loop-mcp/tools/workflow-prepare-runtime-request-tool.js` → `tools/learning-loop-mastra/workflows/workflow-prepare-runtime-request.js`
  - `tools/learning-loop-mcp/tools/workflow-self-improvement-tool.js` → `tools/learning-loop-mastra/workflows/workflow-self-improvement.js`
  - `tools/learning-loop-mcp/tools/workflow-intentional-skip-tool.js` → `tools/learning-loop-mastra/workflows/workflow-intentional-skip.js`
  - `tools/learning-loop-mcp/tools/workflow-report-phase-status-tool.js` → `tools/learning-loop-mastra/workflows/workflow-report-phase-status.js`
  - `tools/learning-loop-mcp/tools/workflow-runtime-probe-tool.js` → `tools/learning-loop-mastra/workflows/workflow-runtime-probe.js`
- **Modify:** `tools/learning-loop-mastra/server.js` — add `WORKFLOW_FILES` skip set with `// TODO(phase-d-plan-1-phase-4)` marker.
- **Modify:** `tools/learning-loop-mcp/tools/manifest.json` — **remove 8 in-scope workflow entries** (resolves red team BLOCKER #2). The legacy manifest is read by the cold-session discoverability test (`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:67-103`); leaving the 8 entries pointing at non-existent files would break that test.
- **No modify:** `tools/learning-loop-mastra/tools/manifest.json` (Phase 4 work).
- **No delete:** legacy `tools/learning-loop-mcp/tools/workflow-*-tool.js` files (Phase 3 deletes them; the `git mv` in step 3 already moved them away, so the legacy paths become dangling — the manifest update in this phase is what unblocks the cold-session test).

## Implementation Steps

1. **Audit import paths in 8 source files** per `plans/reports/researcher-A-260618-1911-workflow-inventory-report.md`:
   - `workflow-intake-plan-tool.js`: imports `../core/envelope-stripper.js`
   - `workflow-self-improvement-tool.js`: imports `../core/envelope-stripper.js`
   - `workflow-intake-orient-tool.js`: imports `#mcp/core/file-readers.js` and `#lib/resolve-root.js`
   - Other 5: no internal cross-imports.

2. **Create `tools/learning-loop-mastra/workflows/` directory.**

3. **Move 8 files** with the rename `-tool.js` → `.js` via `git mv` (preserves history):
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   mkdir -p tools/learning-loop-mastra/workflows
   git mv tools/learning-loop-mcp/tools/workflow-intake-orient-tool.js tools/learning-loop-mastra/workflows/workflow-intake-orient.js
   # ... (8 total)
   ```

4. **Update import paths in moved files.** New files are at `tools/learning-loop-mastra/workflows/`, so relative paths `../core/envelope-stripper.js` become absolute `#mcp/core/envelope-stripper.js`:
   - In `workflow-intake-plan.js`: replace `../core/envelope-stripper.js` → `#mcp/core/envelope-stripper.js`
   - In `workflow-self-improvement.js`: same
   - `workflow-intake-orient.js` already uses `#mcp/*` and `#lib/*` aliases (project-root-relative, work from new location unchanged).

5. **Modify `tools/learning-loop-mastra/server.js`** to disable the 8 workflow entries at runtime. Add a `WORKFLOW_FILES` skip set after the manifest read (line 11), with `// TODO(phase-d-plan-1-phase-4): re-enable as createWorkflow` marker. Add `if (WORKFLOW_FILES.has(file)) continue;` at the top of the `for` loop body.

5a. **Modify `tools/learning-loop-mcp/tools/manifest.json`** to remove the 8 in-scope workflow entries. The cold-session test at `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:76-99` loops over this manifest and `require()`s each file; entries that point to the moved files would fail. Remove:
   - `tools/workflow-intake-orient-tool.js`
   - `tools/workflow-intake-plan-tool.js`
   - `tools/workflow-classify-prompt-tool.js`
   - `tools/workflow-prepare-runtime-request-tool.js`
   - `tools/workflow-self-improvement-tool.js`
   - `tools/workflow-intentional-skip-tool.js`
   - `tools/workflow-report-phase-status-tool.js`
   - `tools/workflow-runtime-probe-tool.js`
   Keep `tools/workflow-generate-prompt-tool.js` (stay-as-createTool, in scope for Plan 4's decision but not moved in Plan 1). Post-removal: 31 entries in legacy manifest.

6. **Run full test suite:**
   ```bash
   pnpm test
   ```
   All 10 namespaces must pass. Expected: 39 tools registered (8 workflow tools temporarily disabled; effective count unchanged from pre-Phase-1 because the 8 workflow tools were never ported to mastra in Phase C).

7. **Verify cold-session test passes after legacy manifest update.** Run `node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` and confirm test 1 ("MCP tools register from manifest") passes. The test loops over the 31 remaining entries and `require()`s each. If a test failure surfaces a missing export, the corresponding manifest entry wasn't actually removed — re-check step 5a.

## Success Criteria

- [ ] `tools/learning-loop-mastra/workflows/` directory exists with 8 files (renamed `-tool.js` → `.js`)
- [ ] All 8 files have updated import paths (use `#mcp/*` for cross-package imports)
- [ ] `tools/learning-loop-mastra/server.js` skips the 8 workflow entries at runtime with `// TODO(phase-d-plan-1-phase-4)` marker
- [ ] `tools/learning-loop-mcp/tools/manifest.json` has 31 entries (8 in-scope workflows removed)
- [ ] All 10 test namespaces pass (`pnpm test`)
- [ ] Cold-session discoverability test passes against the 31-entry legacy manifest
- [ ] No test or hook imports the old `tools/learning-loop-mcp/tools/workflow-*-tool.js` paths (or any such imports are fixed in this phase)

## Risk Assessment

- **Risk:** legacy `workflow-*-tool.js` files still referenced by some test or hook. **Mitigation:** Phase 1's `pnpm test` verification surfaces any such reference. Case-by-case fix.
- **Risk:** file rename `-tool.js` → `.js` breaks an external import. **Mitigation:** `#mcp/*` alias is the canonical path; relative imports are internal. Surfaces in `pnpm test`.
- **Risk:** moving files changes git blame history. **Mitigation:** `git mv` preserves history. Commit message documents the move.

## Security Considerations

None. Mechanical file move with no behavior change. No privilege boundaries crossed, no I/O paths change at runtime, no new attack surface.

## Next Steps

Phase 2 (`create-loop-workflow.js` factory) builds on the moved files by importing them as `workflowXxx` (without `Tool` suffix). Phase 3 writes the 8 `createWorkflow` wrappers and `workflows-manifest.json`. Phase 4 un-skips the 8 entries in `server.js` and removes them from `tools/manifest.json`. Phase 5 writes the parity harness.