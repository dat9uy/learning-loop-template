---
phase: 2
title: "Critical Fixes"
status: completed
priority: P1
dependencies: ["phase-01-research"]
---

# Phase 2: Critical Fixes

## Overview

Apply the C1 fix path chosen in Phase 1. Either implement a working `mastra_task_update` wrapper, revert the broken resolution and remove the wrapper, or ship the cache-only workaround. Subsumes M2 (relative cache path) and M5 (undocumented CLI flags).

**Depends on Phase 1.** Do not start until Phase 1 records a decision.

## Requirements

- Functional: `mastra_task_update` (if kept) must work in production, OR be removed from the manifest entirely.
- Non-functional: test must verify production behavior, not just mock the binary.
- M2: `task-status-cache.json` must use a project-relative path anchored to `__dirname`, not `process.cwd()`.
- M5: subsumed by C1; if wrapper is deleted, M5 is N/A.

## Architecture

The wrapper is registered via `tools/learning-loop-mastra/tools/manifest.json:33`:

```json
{ "file": "tools/task-update.js", "export": "taskUpdate" }
```

`tools/learning-loop-mastra/server.js:25-39` loads manifest entries via `import(\`#mcp/${file}\`)`, so changing the file path in the manifest is enough to disable the tool.

The wrapper signature:

```js
taskUpdate.execute({ taskId, status, reason }) -> { changed, previous, current, runAt, error? }
```

## Related Code Files

- Modify: `tools/learning-loop-mcp/tools/task-update.js`
- Modify: `tools/learning-loop-mastra/__tests__/task-update.test.js`
- Modify (Path B): `tools/learning-loop-mastra/tools/manifest.json` (delete line 33)
- Modify (Path A or C): no manifest change
- Read: `meta-state.jsonl` for `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n`
- Update: `docs/journals/260622-phase-d-plan-1b-shipped.md` (post-ship, not in this phase)

## Implementation Steps

### If Path A (working interface found)

1. Rewrite `execute()` in `task-update.js` to call the documented interface from Phase 1.
2. Use `__dirname`-anchored path for `CACHE_PATH`:

   ```js
   import { fileURLToPath } from "node:url";
   import { dirname, join } from "node:path";
   const __dirname = dirname(fileURLToPath(import.meta.url));
   const CACHE_PATH = join(__dirname, "..", "..", "..", ".claude", "task-status-cache.json");
   ```

3. Rewrite `task-update.test.js` to verify production behavior:
   - Test 1: real CLI invocation against the working interface; assert `changed: true` after first call, `changed: false` after second.
   - Test 2: missing taskId returns `{changed: false, error: "taskId required"}`.
   - Test 3: native failure returns `{changed: false, error: ...}`.
   - Keep the fake-binary path-override pattern for the failure-mode test (intentional failure).

### If Path B (no working interface, revert)

1. Delete `tools/learning-loop-mcp/tools/task-update.js` (the file itself, not just the entry).
2. Delete `tools/learning-loop-mastra/__tests__/task-update.test.js`.
3. Remove the manifest entry from `tools/learning-loop-mastra/tools/manifest.json` line 33.
4. Update `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:160`:
   - Change `mastra.length` assertion from `32` to `31`.
   - Change `tools.length` assertion from `42` to `41`.
5. Update `tools/learning-loop-mastra/server.js:151-152` description from `"41 tools + 10 workflows"` to `"31 tools + 10 workflows"` (cross-phase coupling: Path B must update the description here, not defer to Phase 5 I5).
6. File a NEW active meta-state finding documenting the upstream TaskUpdate gap. `meta_state_patch` cannot un-resolve the existing `meta-260622T1439Z-...` entry because `resolved_at`/`resolved_by` are immutable. Use `meta_state_report` to create a new active finding:
   - `id`: `meta-260622T????Z-claude-code-task-update-interface-still-missing`
   - `description`: "Plan 1b Phase 2 Path B reverted Plan 1a's wrapper: no working programmatic Claude Code task-update interface found. Tracking upstream fix separately from the original `meta-260622T1439Z-...` entry (which stays resolved per closure note)."
   - `affected_system`: `meta`
   - `category`: `loop-anti-pattern`
   - `evidence_code_ref`: `tools/learning-loop-mcp/tools/task-update.js` (deleted)
7. Log a `meta_state_log_change` for the wrapper removal.

### If Path C (cache-only workaround)

> **YAGNI:** Path C is documented as a pointer only. If Phase 1 returns Path C, see `phase-01-research.md` §"Decision" for rationale, then apply the same `__dirname` cache path fix used in Path A. The cache-only implementation pattern: skip `execFile("claude", ...)`, read/write the cache directly, return `{ changed, previous, current, runAt }` based on cache diff. Add a doc comment warning that the underlying TaskUpdate is not invoked. Update the new active finding (filed in Path B step 6) with the workaround rationale.

## Success Criteria

- [x] Phase 2.1 — Path from Phase 1 implemented (A, B, or C)
- [x] Phase 2.2 — `task-update.test.js` verifies production behavior (not just mocks)
- [x] Phase 2.3 — If Path B: wrapper file + test + manifest entry all removed; workflow-parity test count updated from 32 to 31; finding reopened
- [x] Phase 2.4 — If Path A or C: cache path uses `__dirname` anchor (M2 fixed)
- [x] Phase 2.5 — `pnpm test` passes after the change

## Risk Assessment

- **Path A interface is unstable.** Risk: medium. If the interface is undocumented or beta, it may change in future Claude Code releases. Mitigation: pin the interface signature in a doc comment; add a test that catches interface drift.
- **Path B breaks Plan 3 dependencies.** Risk: medium. Plan 3 agents expected a `mastra_task_update` reasoning primitive. Mitigation: document the deferral in the finding resolution; Plan 3 can implement its own workaround if needed.
- **Path C lies to the agent.** Risk: medium. The wrapper reports `{changed: true}` even though the underlying TaskUpdate never fires. Agents may trust this and move on, leaving tasks in stale states. Mitigation: doc comment + finding resolution note explicitly state the limitation; Phase 5 documentation warns about this.
- **M2 fix breaks existing cache state.** Risk: low. The relative-path cache may already exist at `./.claude/task-status-cache.json` in some environments. Migration: copy the old cache file to the new `__dirname`-anchored location; if it doesn't exist, no-op.
