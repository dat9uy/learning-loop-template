---
phase: 2
title: "Tool Registry + Server Refactor"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Tool Registry + Server Refactor

## Overview

Prevent server size explosion by modularizing the MCP server into a thin registry that imports tool configs from individual files. Refactor the existing 5 tools to use the registry pattern.

## Requirements

- Functional: Each tool (existing + new) lives in its own file; server.js is a thin importer
- Non-functional: Server.js under 150 lines; no behavioral change to existing tools

## Architecture

```
tools/constraint-gate/
  server.js                    # ~80 lines: imports, server setup, registerTool calls
  tool-registry.js             # ~25 lines: registerTool helper
  gate-logging.js              # ~40 lines: appendGateLog, rotateGateLog (extracted from server.js)
  tools/
    gate-tool.js               # check_gate (extracted from server.js)
    record-observation-tool.js # record_observation (extracted from server.js)
    update-observation-tool.js # update_observation (extracted from server.js)
    notify-artifact-tool.js    # notify_artifact_change (extracted from server.js)
    trigger-workflow-tool.js   # trigger_workflow (extracted from server.js)
```

## Related Code Files

- **Create:** `tools/constraint-gate/tool-registry.js`, `tools/constraint-gate/gate-logging.js`, `tools/constraint-gate/tools/*.js` (5 files)
- **Modify:** `tools/constraint-gate/server.js` (rewrite to thin registry)
- **Delete:** none

## Implementation Steps

### 2.1 Extract gate logging from server.js

Move `appendGateLog`, `rotateGateLog`, `MAX_LOG_SIZE`, `MAX_LOG_BACKUPS` to `gate-logging.js`:

```javascript
// tools/constraint-gate/gate-logging.js
import { appendFileSync, mkdirSync, statSync, renameSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const MAX_LOG_SIZE = 10 * 1024 * 1024;
const MAX_LOG_BACKUPS = 5;

export function rotateGateLog(logDir) { /* ... */ }
export function appendGateLog(root, entry) { /* ... */ }
```

### 2.2 Create resolve-root.js shared helper

Extract `resolveRoot` from server.js to a shared module with path traversal validation:

```javascript
// tools/constraint-gate/resolve-root.js
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export function resolveRoot(override) {
  const root = override || process.env.GATE_ROOT || DEFAULT_ROOT;
  // Path traversal guard: resolved path must not escape project
  const resolved = resolve(root);
  const defaultResolved = resolve(DEFAULT_ROOT);
  if (!resolved.startsWith(defaultResolved)) {
    throw new Error(`Invalid root: ${root} resolves outside project`);
  }
  return resolved;
}
```

### 2.3 Create tool-registry.js

```javascript
// tools/constraint-gate/tool-registry.js
const registeredNames = new Set();

export function registerTool(server, config) {
  if (registeredNames.has(config.name)) {
    throw new Error(`Tool name collision: ${config.name} already registered`);
  }
  registeredNames.add(config.name);

  // Error boundary: wrap handler to catch exceptions and return structured errors
  const wrappedHandler = async (args) => {
    try {
      return await config.handler(args);
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: true,
            tool: config.name,
            message: error.message,
          }),
        }],
        isError: true,
      };
    }
  };

  server.tool(config.name, config.description, config.schema, wrappedHandler);
}
```

### 2.4 Extract existing tools to individual files

Each tool file exports a config object. Import `resolveRoot` from `../resolve-root.js` and `appendGateLog` from `../gate-logging.js`:

```javascript
// tools/constraint-gate/tools/gate-tool.js
import { z } from "zod";
import { /* gate logic imports */ } from "../gate-logic.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

export const gateTool = {
  name: "check_gate",
  description: "Check if a command is allowed by constraint gate...",
  schema: {
    command: z.string().optional().describe("..."),
    file_path: z.string().optional().describe("..."),
    context: z.string().optional().describe("..."),
  },
  handler: async ({ command, file_path }) => {
    const root = resolveRoot();
    // existing handler body
  },
};
```

Repeat for `record_observation`, `update_observation`, `notify_artifact_change`, `trigger_workflow`.

Each tool file exports a config object:

```javascript
// tools/constraint-gate/tools/gate-tool.js
import { z } from "zod";
import { /* gate logic imports */ } from "../gate-logic.js";
import { appendGateLog } from "../gate-logging.js";

export const gateTool = {
  name: "check_gate",
  description: "Check if a command is allowed by constraint gate...",
  schema: {
    command: z.string().optional().describe("..."),
    file_path: z.string().optional().describe("..."),
    context: z.string().optional().describe("..."),
  },
  handler: async ({ command, file_path }) => {
    // existing handler body
  },
};
```

Repeat for `record_observation`, `update_observation`, `notify_artifact_change`, `trigger_workflow`.

### 2.5 Rewrite server.js as thin registry

```javascript
// tools/constraint-gate/server.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTool } from "./tool-registry.js";
import { gateTool } from "./tools/gate-tool.js";
import { recordObservationTool } from "./tools/record-observation-tool.js";
// ... etc

const server = new McpServer({ name: "constraint-gate", version: "1.0.0" });

registerTool(server, gateTool);
registerTool(server, recordObservationTool);
// ... etc

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("constraint-gate MCP server started");
```

### 2.6 Intermediate validation: server must start after refactor

Before proceeding to Phase 3, verify:
1. `node tools/constraint-gate/server.js` starts without errors
2. `pnpm test` passes (server.test.js, gate-logic.test.js, etc.)
3. All 5 existing tools respond correctly via MCP

If the server fails to start, debug import errors before proceeding. Do NOT start Phase 3 until server starts cleanly.

### 2.7 TDD: Write tests first

**Test for tool-registry.js:**
- Create `tools/constraint-gate/tool-registry.test.js`
- Test: `registerTool` calls `server.tool()` with correct arguments
- Test: handler return format is `{ content: [{ type: "text", text: JSON.stringify(result) }] }`

**Test for gate-logging.js:**
- Create `tools/constraint-gate/gate-logging.test.js`
- Test: `appendGateLog` creates log file if missing
- Test: `rotateGateLog` rotates when size exceeds limit
- Test: rotation failure does not throw

**Test for server.js (integration):**
- Update `tools/constraint-gate/server.test.js`
- Test: all 5 existing tools are registered
- Test: server starts and responds to `ListTools` request

**Test for resolve-root.js:**
- Create `tools/constraint-gate/resolve-root.test.js`
- Test: returns default root when no override
- Test: returns override when provided
- Test: throws on path traversal (`../../../etc`)
- Test: throws on path outside project

**Test for tool-registry.js:**
- Test: `registerTool` calls `server.tool()` with correct arguments
- Test: handler return format is `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
- Test: error boundary catches handler exceptions and returns `{ isError: true, ... }`
- Test: duplicate tool name throws collision error

**Test for extracted tools:**
- Create `tools/constraint-gate/tools/gate-tool.test.js`
- Test: handler returns correct decision structure
- Test: logs are written on each call
- Test: handler exceptions caught by error boundary (not thrown)

## Rollback Strategy

1. Revert `server.js` to pre-refactor version (from git)
2. Delete extracted files: `tool-registry.js`, `gate-logging.js`, `resolve-root.js`, `tools/*.js`
3. Restore original `server.js`

## Success Criteria

- [x] `server.js` under 150 lines
- [x] `tool-registry.js` exists and works
- [x] Each existing tool lives in its own file under `tools/constraint-gate/tools/`
- [x] All existing tests pass
- [x] New tests for registry, logging, and extracted tools pass
- [x] `gate-log.jsonl` still receives entries from all tools

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Refactor breaks existing tool behavior | Extract without changing logic; tests verify parity |
| Import path errors | All imports use explicit `.js` extensions for ESM |
| Gate logging stops working | Extract as pure function, test independently |
| Server fails to start after refactor | Step 2.6: validate server starts before proceeding |
| `resolveRoot` path traversal | Validation: resolved path must start with default root |
| Tool name collision | `registerTool` throws on duplicate names |
| Handler exceptions crash server | Error boundary wraps all handlers |

## Next Steps

After Phase 2 completes: Phase 3 (validate_records) begins. Phases 3-6 each add one tool to `server.js` — they must be implemented serially to avoid merge conflicts on `server.js`.
