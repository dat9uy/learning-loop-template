---
phase: 0
title: "safeImport + Dynamic Manifest Pre-Spike"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 0: safeImport + Dynamic Manifest Pre-Spike

## Overview

Fix the critical server startup SPOF before any workflow tools are implemented. Currently, `server.js` uses static ES module imports for all tools. A syntax error, missing dependency, or export mismatch in any single tool file crashes the entire MCP server on startup, losing all 12+ safety-critical tools simultaneously.

This phase implements a `safeImport` wrapper and optional dynamic manifest so that one broken tool is skipped while the rest continue to function.

## Key Insights

- The existing `tool-registry.js` already wraps handlers in error boundaries (catches runtime exceptions)
- The gap is at the **import level** — a parse error or missing export crashes Node before `registerTool()` runs
- Dynamic `import()` with try/catch can isolate per-tool failures
- A manifest file (e.g., `tools/manifest.json`) eliminates shared-file contention on `server.js`

## Requirements

- Functional:
  - `server.js` starts successfully even if one or more tool files have syntax errors or missing exports
  - Broken tools are logged to `gate-log.jsonl` with the error, but other tools register normally
  - Optional: dynamic manifest so adding a tool only requires creating a file, never editing `server.js`
- Non-functional:
  - Existing 12 tools continue to work unchanged
  - No new dependencies

## Related Code Files

- Modify: `tools/constraint-gate/server.js`
- Modify: `tools/constraint-gate/tool-registry.js`
- Create: `tools/constraint-gate/tools/manifest.json` (optional)
- Read for context:
  - `tools/constraint-gate/server.js`
  - `tools/constraint-gate/tool-registry.js`

## Implementation Steps

1. **Verify current behavior**
   - Introduce a deliberate syntax error in a test tool file
   - Run `node tools/constraint-gate/server.js` — confirm it crashes
   - Revert the error

2. **Implement `safeImport` in `tool-registry.js`**
   ```javascript
   export async function safeImport(path) {
     try {
       return await import(path);
     } catch (err) {
       appendGateLog({ action: "safeImport_failed", path, error: err.message });
       return null;
     }
   }
   ```

3. **Refactor `server.js` to use dynamic imports**
   - Replace static `import { x } from './tools/x.js'` with dynamic `safeImport`
   - Iterate over a tool list, import each dynamically, register if successful
   - Log summary: "Registered N of M tools"

4. **Optional: Create `tools/manifest.json`**
   ```json
   [
     { "name": "check_gate", "file": "./tools/gate-tool.js" },
     { "name": "validate_records", "file": "./tools/validate-records-tool.js" },
     ...
   ]
   ```
   - `server.js` reads manifest and imports each file dynamically
   - Adding a new tool = add one line to manifest + create file

5. **Test**
   - Re-introduce syntax error in a test tool file
   - Run server — confirm it starts, logs the failure, registers remaining tools
   - Revert the error
   - Run full test suite: `pnpm test`

## Todo List

- [ ] Introduce test syntax error and confirm current crash behavior
- [ ] Implement `safeImport` in `tool-registry.js`
- [ ] Refactor `server.js` to dynamic imports
- [ ] Test with broken tool — verify graceful degradation
- [ ] Run `pnpm test` — no regressions
- [ ] Optional: create `tools/manifest.json`
- [ ] Write rich description for `safeImport` behavior in registry

## Success Criteria

- [ ] Server starts successfully with a broken tool file present
- [ ] Broken tool is logged to `gate-log.jsonl`
- [ ] All healthy tools are registered and callable
- [ ] `pnpm test` passes with no regressions

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Dynamic import changes server startup timing | Low | `import()` is async; server already uses async patterns for transport |
| Manifest file becomes stale | Low | Manifest is only needed if created; static list in server.js also works with safeImport |

## Security Considerations

- `safeImport` only wraps existing imports; does not change tool behavior
- Broken tools are skipped, not executed with partial state

## Next Steps

After Phase 0 completes, proceed to Phase 1 (P1 workflow tools). Phase 0 is a blocking prerequisite.
