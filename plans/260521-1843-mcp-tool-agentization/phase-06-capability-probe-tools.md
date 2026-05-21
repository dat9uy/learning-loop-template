---
phase: 6
title: "Capability + Probe Tools"
status: completed
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 6: Capability + Probe Tools

## Overview

Expose `generate-capabilities` and `list-probes` as MCP tools: `generate_capability_records` and `list_runtime_probes`.

## Requirements

- Functional: Generate capability records from surface adapters; list runtime probe files
- Non-functional: Generation is idempotent in dry-run mode; probe listing is read-only

## Architecture

```
tools/constraint-gate/tools/
  generate-capabilities-tool.js
tools/generate-capabilities/
  generate-capabilities.js     # already exports generateCapabilities
```

## Related Code Files

- **Create:** `tools/constraint-gate/tools/generate-capabilities-tool.js`, `tools/constraint-gate/tools/list-probes-tool.js`
- **Modify:** `tools/constraint-gate/server.js`
- **Delete:** none

## Implementation Steps

### 6.1 Create generate-capabilities-tool.js

`generate-capabilities.js` already exports `generateCapabilities`. Direct wrapper:

```javascript
import { z } from "zod";
import { generateCapabilities } from "../../../generate-capabilities/generate-capabilities.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

export const generateCapabilitiesTool = {
  name: "generate_capability_records",
  description: "Generate capability records from product surface adapters. Use dry_run=true first to check for drift, then dry_run=false to write.",
  schema: {
    dry_run: z.boolean().optional().describe("Preview drift without writing (default: false)"),
    stacks: z.array(z.object({
      name: z.string(),
      surfaces: z.array(z.string()),
    })).optional().describe("Override default stacks (default: api+web)"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    let result;
    try {
      result = await generateCapabilities({
        root,
        dryRun: args.dry_run,
        stacks: args.stacks,
      });
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: true,
            message: error.message,
          }),
        }],
        isError: true,
      };
    }

    const response = {
      drift: result.drift,
      generated: result.diffs
        ?.filter((d) => d.expected !== null)
        .map((d) => ({ id: d.file, stack: d.expected?.stack, surface: d.expected?.surface })) || [],
      diffs: result.diffs,
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "generate_capability_records",
      dry_run: args.dry_run,
      drift: result.drift,
      diff_count: result.diffs?.length || 0,
    });

    return { content: [{ type: "text", text: JSON.stringify(response) }] };
  },
};
```

### 6.2 Create list-probes-tool.js

`list-probes.js` already exports `listProbes`. Direct wrapper:

```javascript
import { z } from "zod";
import { listProbes } from "../../../list-probes/list-probes.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

export const listProbesTool = {
  name: "list_runtime_probes",
  description: "List runtime probe files for a given stack. Read-only discovery.",
  schema: {
    stack: z.string().describe("Stack name (e.g., 'api', 'web')"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const probes = listProbes(root, { stack: args.stack });

    const result = {
      count: probes.length,
      probes: probes.map((p) => ({ path: p.path, stack: p.stack, domain: p.domain })),
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "list_runtime_probes",
      stack: args.stack,
      count: probes.length,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

### 6.3 Register in server.js

Add imports and register both tools.

### 6.4 TDD: Write tests first

**Test for generate-capabilities-tool.js:**
- Create `tools/constraint-gate/tools/generate-capabilities-tool.test.js`
- Test: dry_run=true, no drift → `{ drift: false, diffs: [] }`
- Test: dry_run=true, with drift → `{ drift: true, diffs: [...] }`
- Test: custom stacks → uses provided stacks
- Test: gate log entry written

**Test for list-probes-tool.js:**
- Create `tools/constraint-gate/tools/list-probes-tool.test.js`
- Test: valid stack → probes returned
- Test: invalid/empty stack → `{ count: 0, probes: [] }`
- Test: gate log entry written

## Success Criteria

- [x] `generate_capability_records` callable via MCP
- [x] `list_runtime_probes` callable via MCP
- [x] Dry-run mode detects drift without writing
- [x] CLI `pnpm generate:capabilities` still works
- [x] CLI `pnpm list:probes` still works
- [x] Tests pass

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| generateCapabilities throws on missing adapter | Catch and return as structured error |
| listProbes called with non-existent stack | Returns empty array (existing behavior) |
| records/capabilities write blocked | Phase 1 added to allow list |

## Rollback Strategy

1. Remove imports and `registerTool` calls from `server.js`
2. Delete `tools/constraint-gate/tools/generate-capabilities-tool.js` and `list-probes-tool.js`

## Security Considerations

- `generate_capability_records` writes to `records/capabilities/**` — gated by observation
- `list_runtime_probes` is read-only

## Next Steps

After Phase 6 completes: Phase 7 (list_verified_claims + integration).
