---
phase: 9
title: "TaskUpdate Idempotency Tool"
status: pending
effort: "~30min"
---

# Phase 9: TaskUpdate Idempotency Tool

## Overview

Add `mastra_task_update` MCP tool that wraps Claude Code's native `TaskUpdate` and returns `{changed: bool, previous: <status> | null, current: <status>}`. The wrapper reads the meta-state registry (via `meta_state_list` with a filter) to detect previous status, calls native TaskUpdate via subprocess, and reports whether a real change occurred. Resolves `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n` (status: reported) — agent can self-detect a no-op and stop the 190-call degenerate loop.

## Context Links

- `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n` (reported; Phase 9 provides local wrapper)
- `plans/reports/debug-260620-1713-caa56a15-stuck-taskupdate-loop-report.md` (190-call no-op loop analysis; session `caa56a15-2db7-4a83-9ec3-8ab26a8de2ff`)
- `tools/learning-loop-mastra/tools/manifest.json` (existing manifest; add `mastra_task_update` entry)
- `tools/learning-loop-mastra/create-loop-tool.js` (factory pattern to mirror)
- `tools/learning-loop-mcp/core/meta-state-tools.js#meta_state_list` (registry query — used to read previous status)

## Requirements

- **Functional:**
  - Create `tools/learning-loop-mastra/tools/task-update.js` that exports `createLoopTool({ id: "task_update", description: "...", inputSchema, ... })` returning a tool that:
    1. Accepts `{ taskId: string, status: "pending" | "in_progress" | "completed", reason?: string }`.
    2. Calls native Claude Code `TaskUpdate` via subprocess (`claude task update --id <taskId> --status <status>`).
    3. Reads previous status from registry via `mastra_meta_state_list({ ref_field: "consolidated_into" })` filtered by `taskId` (or maintains a local `.claude/task-status-cache.json` keyed by taskId).
    4. Returns `{ changed: bool, previous: string | null, current: string, runAt: ISO-timestamp }`.
  - Register `mastra_task_update` in `tools/manifest.json` (1 line addition).
  - Add 3 unit tests in `task-update.test.js`:
    - Test 1: real change (pending → completed) returns `{changed: true, previous: "pending", current: "completed"}`.
    - Test 2: no-op (completed → completed) returns `{changed: false, previous: "completed", current: "completed"}`.
    - Test 3: missing taskId returns `{changed: false, error: "taskId required"}` (fail-closed).
- **Non-functional:**
  - Test count delta: +3.
  - Tool latency: <100ms per call (registry query + subprocess).
  - **Forward-compatible**: when upstream Claude Code ships `{changed: bool}` natively, Phase 9's wrapper becomes a thin passthrough (1 line removal). No caller changes required.

## Architecture

Wrapper tool that calls native `TaskUpdate` via subprocess + reads registry for previous status. Mirrors `create-loop-tool.js` factory pattern.

| Step | Action |
|---|---|
| RED | Add 3 unit tests. Run; expect 3 failures (no wrapper tool exists). |
| GREEN | Implement `task-update.js` (subprocess call + registry query + return shape). Run; expect 3 tests pass. |
| VERIFY | Run full `pnpm test`; expect 1099 pass (1096 baseline + 3 new). |

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/tools/manifest.json` (add `mastra_task_update` entry)
- **Create:** `tools/learning-loop-mastra/tools/task-update.js` (wrapper tool)
- **Create:** `tools/learning-loop-mastra/__tests__/task-update.test.js` (3 unit tests)
- **Delete:** none

## Implementation Steps

1. Read `tools/learning-loop-mastra/create-loop-tool.js` (factory pattern).
2. Read `tools/learning-loop-mastra/tools/manifest.json` (existing entries; pattern to mirror).
3. Create `task-update.js`:
   ```js
   import { z } from "zod";
   import { execFile } from "node:child_process";
   import { promisify } from "node:util";
   import { createLoopTool } from "../create-loop-tool.js";
   import fs from "node:fs";
   import path from "node:path";

   const execFileAsync = promisify(execFile);

   const CACHE_PATH = path.resolve(".claude/task-status-cache.json");

   function readCache() {
     try { return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")); } catch { return {}; }
   }

   function writeCache(cache) {
     fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
   }

   export const taskUpdate = createLoopTool({
     id: "task_update",
     description: "Wraps native TaskUpdate; returns {changed: bool} so agents can detect no-ops and stop degenerate loops.",
     inputSchema: z.object({
       taskId: z.string(),
       status: z.enum(["pending", "in_progress", "completed"]),
       reason: z.string().optional(),
     }),
     execute: async ({ taskId, status, reason }) => {
       if (!taskId) return { changed: false, error: "taskId required" };
       const cache = readCache();
       const previous = cache[taskId] || null;
       try {
         await execFileAsync("claude", ["task", "update", "--id", taskId, "--status", status]);
       } catch (err) {
         return { changed: false, error: `native TaskUpdate failed: ${err.message}`, previous, current: previous };
       }
       const changed = previous !== status;
       cache[taskId] = status;
       writeCache(cache);
       return { changed, previous, current: status, runAt: new Date().toISOString() };
     },
   });
   ```
4. Add to `tools/manifest.json`:
   ```json
   { "id": "task_update", "description": "...", "module": "./tools/task-update.js" }
   ```
5. Create `task-update.test.js` with 3 unit tests.
6. Run; expect 3 tests pass.
7. Run full `pnpm test`; expect 1099 pass.

## Success Criteria

- [ ] `tools/learning-loop-mastra/tools/task-update.js` exists.
- [ ] `tools/manifest.json` registers `mastra_task_update`.
- [ ] 3 unit tests in `task-update.test.js` cover real-change, no-op, and missing-taskId paths.
- [ ] `pnpm test` exits 0 with 1099 pass / 0 fail / 1 skipped.

## Risk Assessment

- **Native `TaskUpdate` subprocess failures.** Risk: low. The wrapper catches and reports `error` in the response. Mitigation: Phase 9 step 3 returns `{changed: false, error, previous, current: previous}` on failure (fail-closed).
- **Cache drift between wrapper and native tool.** Risk: medium. If the operator calls native `TaskUpdate` directly (not via wrapper), the wrapper's cache is stale. Mitigation: cache is best-effort; if cache says `previous: "pending"` but native already changed to `"completed"`, wrapper returns `changed: false` (false negative on the no-op detection). This is acceptable — the worst case is the wrapper reports "not changed" when actually changed, which is the SAFE direction (agent doesn't loop on a stale cache).

## Security Considerations

- **Subprocess call to native Claude Code.** Risk: low. `claude` binary is the canonical Claude Code CLI; no untrusted input flows through (only structured args from the tool's input schema). Mitigation: `execFile` (not `exec`) — no shell interpretation.

## Next Steps

Phase 10: Acceptance Gate and Closeout (final `pnpm test` + 3 `meta_state_resolve` calls + journal entry + PR body).