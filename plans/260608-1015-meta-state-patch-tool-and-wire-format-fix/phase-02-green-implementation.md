---
phase: 2
title: "Green (implementation)"
status: pending
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Green (implementation)

## Overview

Implement just enough code to make all 10 tests from Phase 1 pass. Minimal implementation: 1 new MCP tool (`meta_state_patch`) + 1 generic helper (`coerceParamsToSchema` in `tool-registry.js`) + 1 manifest registration. No new core logic in `core/meta-state.js` — `updateEntry` is reused as-is.

## Requirements

### Functional
- `meta_state_patch` MCP tool handles all 6 test cases from Phase 1 (happy path, CAS mismatch, not found, change-log immutable, branch mismatch, full lifecycle).
- `coerceParamsToSchema` helper handles all 4 wire-format test cases (array, boolean, number, no-op).
- `coerceParamsToSchema` is wired into `tool-registry.js#registerTool#wrappedHandler` so all 3 affected tools (propose_design, report, patch) benefit.
- `meta_state_patch` is registered in both `tools/manifest.json` and `agent-manifest.json`.

### Non-functional
- All 840+ existing tests still pass.
- The 10 new tests from Phase 1 now pass.
- No new dependencies.
- Code style matches existing tools (import order, error handling, audit log format).

## Architecture

Two-piece implementation, independent and testable:

```
1. coerceParamsToSchema (pure function in tool-registry.js)
   - Input: (args, schema)
   - Output: coerced args (or original args if no coercion needed)
   - Logic: walks schema.shape, detects ZodArray/ZodBoolean/ZodNumber, re-hydrates

2. meta_state_patch (new MCP tool)
   - Input: { id, entry_kind, patch, _expected_version? }
   - Output: { patched: true/false, ... }
   - Logic: validates inputs, calls updateEntry, audits, returns

3. registerTool change
   - Accepts root parameter
   - Calls coerceParamsToSchema in wrappedHandler before config.handler

4. server.js change
   - Passes root to registerTool
```

## Related Code Files

- **Create:**
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (~80 lines)
- **Modify:**
  - `tools/learning-loop-mcp/tool-registry.js` (add `coerceParamsToSchema` helper + `root` parameter; wire helper into `wrappedHandler`; ~60 lines added)
  - `tools/learning-loop-mcp/server.js` (pass `root` to `registerTool`; ~3 lines changed)
  - `tools/learning-loop-mcp/tools/manifest.json` (1 new entry)
  - `tools/learning-loop-mcp/agent-manifest.json` (1 new entry in `meta_state` group)

## Implementation Steps

### Step 2.1: Implement `coerceParamsToSchema` in `tool-registry.js` (20m)

Add the helper function (already designed in the brainstorm report):

```js
function coerceParamsToSchema(args, schema) {
  if (!schema || !args || typeof args !== "object") return args;
  const shape = schema.shape;
  if (!shape) return args;
  const coerced = { ...args };
  for (const [key, value] of Object.entries(args)) {
    const fieldSchema = shape[key];
    if (!fieldSchema) continue;
    const typeName = fieldSchema._def?.typeName;
    const innerTypeName = typeName === "ZodOptional" || typeName === "ZodNullable"
      ? fieldSchema._def.innerType._def.typeName
      : typeName;
    if (innerTypeName === "ZodArray" && typeof value === "string") {
      try { coerced[key] = JSON.parse(value); } catch { /* leave as-is */ }
    } else if (innerTypeName === "ZodBoolean" && typeof value === "string") {
      if (value === "true") coerced[key] = true;
      else if (value === "false") coerced[key] = false;
    } else if (innerTypeName === "ZodNumber" && typeof value === "string") {
      const n = Number(value);
      if (!isNaN(n)) coerced[key] = n;
    }
  }
  return coerced;
}

// Export for test access
export { coerceParamsToSchema };
```

### Step 2.2: Update `registerTool` to accept `root` and call `coerceParamsToSchema` (10m)

```js
export function registerTool(server, config, root) {
  if (registeredNames.has(config.name)) {
    throw new Error(`Tool name collision: ${config.name} already registered`);
  }
  registeredNames.add(config.name);

  const wrappedHandler = async (args) => {
    try {
      // Wire-format coercion: re-hydrate coerced top-level array/boolean/number
      const coerced = coerceParamsToSchema(args, config.schema);
      if (coerced !== args) {
        const coercedFields = Object.keys(coerced).filter(
          (k) => JSON.stringify(coerced[k]) !== JSON.stringify(args[k])
        );
        if (coercedFields.length > 0 && root) {
          appendGateLog(root, {
            action: "wire_format_coerced",
            tool: config.name,
            fields: coercedFields,
          });
        }
      }
      return await config.handler(coerced);
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

### Step 2.3: Update `server.js` to pass `root` (2m)

Find the `registerTool(server, imported[mod.export])` call and add `root`:

```js
registerTool(server, imported[mod.export], root);
```

### Step 2.4: Implement `meta_state_patch` tool (20m)

Create `tools/learning-loop-mcp/tools/meta-state-patch-tool.js`:

```js
import { z } from "zod";
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStatePatchTool = {
  name: "meta_state_patch",
  description: "Patch an existing meta-state entry. Unifies update_finding / update_design / update_change_log / backfill_fingerprint into one tool. CAS via _expected_version. Idempotency by CAS (existing pattern in updateEntry). Wire-format safe: nest complex-typed fields inside the `patch` object to avoid top-level array/boolean coercion by the MCP wire layer. Closes the CRUD gap and the parent escape-hatch abuse.",
  schema: {
    id: z.string().describe("Exact entry id to patch"),
    entry_kind: z.enum(["finding", "rule", "loop-design"])
      .describe("Entry kind branch — used to validate patch shape; change-log is immutable"),
    patch: z.object({}).passthrough()
      .describe("Partial fields to update. Nest arrays/booleans in this object. Use core/meta-state.js#metaStateEntryPatchSchema's passthrough semantics: any subset of union fields is valid."),
    _expected_version: z.number().optional()
      .describe("Optional CAS: patch succeeds only if current entry.version === _expected_version. On mismatch, returns { patched: false, reason: 'version_mismatch', current_version }."),
  },
  handler: async ({ id, entry_kind, patch, _expected_version }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      const result = { patched: false, reason: "not_found", id };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_patch",
        ...result,
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (entry.entry_kind !== entry_kind) {
      const result = {
        patched: false,
        reason: "branch_mismatch",
        id,
        expected: entry_kind,
        actual: entry.entry_kind,
      };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_patch",
        ...result,
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (entry.entry_kind === "change-log") {
      const result = { patched: false, reason: "change_log_immutable", id };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_patch",
        ...result,
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // Add _expected_version to patch for updateEntry's CAS
    const patchWithCAS = _expected_version !== undefined
      ? { ...patch, _expected_version }
      : patch;

    const updateResult = await updateEntry(root, id, patchWithCAS);

    if (updateResult === "version_mismatch") {
      const current = entries.find((e) => e.id === id);
      const result = {
        patched: false,
        reason: "version_mismatch",
        id,
        current_version: current?.version ?? 0,
      };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_patch",
        ...result,
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (updateResult === "validation_failed") {
      const result = {
        patched: false,
        reason: "validation_failed",
        id,
      };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_patch",
        ...result,
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // Re-read to get the updated entry + new version
    const updatedEntries = readRegistry(root);
    const updated = updatedEntries.find((e) => e.id === id);

    const result = {
      patched: true,
      id,
      entry_kind: updated.entry_kind,
      version: updated.version,
      entry: updated,
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_patch",
      id,
      entry_kind: updated.entry_kind,
      fields_patched: Object.keys(patch),
      version: updated.version,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

### Step 2.5: Register in `tools/manifest.json` (1m)

Add the new entry alphabetically (between `metaStateLogChangeTool` and `metaStatePromoteRuleTool`):

```json
{ "file": "./tools/meta-state-patch-tool.js", "export": "metaStatePatchTool" },
```

### Step 2.6: Register in `agent-manifest.json` (1m)

Add `meta_state_patch` to the `meta_state` group in `tools/learning-loop-mcp/agent-manifest.json`:

```json
"meta_state": {
  "description": "Meta-state registry for loop self-awareness findings",
  "tools": [
    "meta_state_report",
    "meta_state_list",
    "meta_state_ack",
    "meta_state_resolve",
    "meta_state_promote_rule",
    "meta_state_sweep",
    "meta_state_log_change",
    "meta_state_derive_status",
    "meta_state_check_grounding",
    "meta_state_refresh_fingerprint",
    "meta_state_query_drift",
    "meta_state_propose_design",
    "meta_state_patch"
  ],
  "ordering": "any"
}
```

### Step 2.7: Run the 10 new tests, confirm all pass (5m)

```bash
node --test 'tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js' 'tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js'
```

Expected: 10/10 pass.

### Step 2.8: Run the full test suite, confirm no regressions (5m)

```bash
pnpm test
```

Expected: 850+/850+ pass (840+ existing + 10 new).

If any existing test fails, the wire-format fix may be too aggressive (coercing a field that an existing tool genuinely wants as a string). Diagnose by reading the failing test, identify the field, and either:
- (a) Add an exclusion to `coerceParamsToSchema` for that field
- (b) Update the tool's schema to declare the correct type (which is what the helper uses to decide whether to coerce)

## Success Criteria

- [ ] `coerceParamsToSchema` is exported from `tool-registry.js` and handles all 4 wire-format test cases
- [ ] `registerTool` accepts `root` parameter and calls `coerceParamsToSchema` in `wrappedHandler`
- [ ] `server.js` passes `root` to `registerTool`
- [ ] `meta_state_patch` tool is implemented and handles all 6 patch test cases
- [ ] `meta_state_patch` is registered in both `tools/manifest.json` and `agent-manifest.json`
- [ ] 10/10 new tests pass
- [ ] 840+ existing tests still pass
- [ ] `meta_state_propose_design` and `meta_state_report` can now accept top-level array/boolean params (verified by the new wire-format tests + a regression test on the existing tools — if not already covered, add a quick assertion in `wire-format-coercion-fix.test.js`)

## Risk Assessment

### Risk: Zod 4.x changed `_def` structure

The helper uses `fieldSchema._def.typeName`. Zod 4.x has changed some internals. **Mitigation:** the import path is `zod: ^4.4.3` per package.json. If `_def.typeName` is renamed in 4.4.3, the helper fails open (returns `args` unchanged) and the wire-format fix is a no-op (the bug remains, but no new harm). Log a `coercion_introspection_failed` event so it's visible.

### Risk: `coerceParamsToSchema` is too eager

If a tool declares `addresses: z.string()` (intentionally a string), but the value happens to arrive as a JSON-encoded string, the helper should NOT coerce it. The helper checks `innerTypeName === "ZodArray"` before coercing — string fields are not coerced. Verified by Test 4 (no-op for correct types).

### Risk: The audit log line `wire_format_coerced` may flood the log

If a tool is called frequently with coerced values, the log could grow. **Mitigation:** the log line is per-call, not per-field. If this becomes a problem, add a rate-limiter or sample (out of scope for this plan).

## Rollback Plan

If Phase 2 cannot be made green within the ~1h estimate, the rollback is:
1. Revert the changes to `tool-registry.js` and `server.js` (keep the helper, but don't wire it into `wrappedHandler`)
2. Delete `meta_state_patch` and the manifest entries
3. The 10 new tests will fail (expected), but the live system is unchanged
4. Defer the plan and re-scope

This is safe because the changes are additive: a new tool + a new helper. The existing 12 meta-state tools and all other tools are unchanged.
