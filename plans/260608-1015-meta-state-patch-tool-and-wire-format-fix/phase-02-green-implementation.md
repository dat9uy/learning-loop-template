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

Implement just enough code to make all 12 tests from Phase 1 pass. Minimal implementation: 1 new MCP tool (`meta_state_patch`) + 1 generic helper (`coerceParamsToSchema` in `tool-registry.js`) + 1 manifest registration. No new core logic in `core/meta-state.js` — `updateEntry` is reused as-is.

## Requirements

### Functional
- `meta_state_patch` MCP tool handles all 7 test cases from Phase 1 (happy path, CAS mismatch, not found, change-log immutable, branch mismatch, full lifecycle, validation_failed).
- `coerceParamsToSchema` helper handles all 5 wire-format test cases (array, boolean, number-with-empty-rejection, no-op identity, real-schema regression).
- `coerceParamsToSchema` is wired into `tool-registry.js#registerTool#wrappedHandler` so all 3 affected tools (propose_design, report, patch) benefit.
- `meta_state_patch` is registered in both `tools/manifest.json` and `agent-manifest.json`.

### Non-functional
- All 487+ existing tests still pass.
- The 12 new tests from Phase 1 now pass.
- No new dependencies.
- Code style matches existing tools (import order, error handling, audit log format).

## Architecture

Two-piece implementation, independent and testable:

```
1. coerceParamsToSchema (pure function in tool-registry.js)
   - Input: (args, schema, root?, depth=0)
   - Output: coerced args (returns original `args` reference when no coercion happened — F1 fix)
   - Logic: walks schema.shape, unwraps ZodOptional/ZodNullable/ZodDefault/ZodEffects/ZodTransform/ZodLazy
     (F15 fix), detects ZodArray/ZodBoolean/ZodNumber, re-hydrates from JSON string.
     Recursively walks into nested ZodObject passthrough fields up to depth 2 (F8 fix).
     Falls back to `fieldSchema.constructor.name` if `_def` is missing (F7 fix).
     Logs `coercion_introspection_failed` for silent no-op visibility (F7 fix).
     Number coercion uses regex `^-?\d+(\.\d+)?$` + `parseFloat` to reject empty strings (F6 fix).

2. meta_state_patch (new MCP tool)
   - Input: { id, entry_kind, patch, _expected_version? }
   - Output: { patched: true/false, reason?, version?, entry? }
   - Logic:
     - F2: enum extended to ["finding", "rule", "loop-design", "change-log"] so the
       change-log immutability branch is reachable.
     - F4: deny-list of identity/audit-trail fields (`id`, `version`, `created_at`,
       `created_by`, `code_fingerprint`, `promoted_to_rule`, `consolidated_into`,
       `acked_at`, `resolved_at`, `resolved_by`, `resolution`, `entry_kind`) — patch
       rejected if any of these are in the patch.
     - F9: throws on unknown `updateEntry` return value (fail-safe, not silent success).
     - F10: auto-captures `_expected_version` from pre-read if not provided.

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

### Step 2.1: Implement `coerceParamsToSchema` in `tool-registry.js` (30m)

Add the helper function. **Red-team F1, F6, F7, F8, F15 fixes baked in:**

```js
/**
 * Re-hydrate top-level array/boolean/number params coerced by MCP SDK wire framing.
 * - F1: returns the original `args` reference (identity) when no coercion happened,
 *   so Test 4's `assert.equal(result, args)` passes.
 * - F6: rejects empty string for number fields (`Number("") === 0` is silent corruption;
 *   uses `parseFloat` + regex to validate).
 * - F7: falls back to `fieldSchema.constructor.name` when `_def.typeName` is missing,
 *   and logs `coercion_introspection_failed` so silent no-op is visible.
 * - F8: recursively walks into `z.object({}).passthrough()` patch fields (depth-limited)
 *   so the wire-format fix applies to the patch tool's own `patch` parameter.
 * - F15: unwraps `ZodDefault` (and `ZodEffects`, `ZodTransform`) so fields declared as
 *   `z.array(z.string()).default([])` get coerced.
 */
const MAX_RECURSION_DEPTH = 2;

function unwrapTypeName(fieldSchema) {
  if (!fieldSchema) return null;
  // Walk Zod wrappers: Optional, Nullable, Default, Effects, Transform
  let cur = fieldSchema;
  for (let i = 0; i < 5 && cur; i++) {
    const typeName = cur._def?.typeName ?? cur.constructor?.name;
    if (
      typeName === "ZodOptional" || typeName === "ZodNullable" ||
      typeName === "ZodDefault" || typeName === "ZodEffects" ||
      typeName === "ZodTransform" || typeName === "ZodLazy"
    ) {
      cur = cur._def?.innerType ?? cur._def?.schema;
      continue;
    }
    return typeName;
  }
  return null;
}

function coerceValue(value, typeName) {
  if (typeName === "ZodArray" && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value;  // don't coerce non-array JSON
    } catch {
      return value;  // invalid JSON — leave as-is for Zod to reject with diagnostic
    }
  }
  if (typeName === "ZodBoolean" && typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }
  if (typeName === "ZodNumber" && typeof value === "string") {
    // F6: reject empty string; only accept canonical numeric form
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : value;
    }
    return value;  // not a valid number — leave as-is
  }
  return undefined;  // no coercion applicable
}

export function coerceParamsToSchema(args, schema, root = null, depth = 0) {
  if (!schema || !args || typeof args !== "object") return args;
  const shape = schema.shape;
  if (!shape) return args;

  // F1: track if any coercion happened so we can preserve identity
  const coerced = { ...args };
  let didCoerce = false;

  for (const [key, value] of Object.entries(args)) {
    const fieldSchema = shape[key];
    if (!fieldSchema) continue;
    const typeName = unwrapTypeName(fieldSchema);
    if (!typeName) {
      // F7: log when introspection fails so silent no-op is visible
      if (root) {
        try {
          appendGateLog(root, {
            action: "coercion_introspection_failed",
            field: key,
            reason: "typeName null after unwrap",
          });
        } catch { /* logging is best-effort */ }
      }
      continue;
    }
    const next = coerceValue(value, typeName);
    if (next !== undefined) {
      coerced[key] = next;
      didCoerce = didCoerce || next !== value;
    }

    // F8: recursively walk into nested passthrough objects (e.g., the patch tool's `patch` field)
    if (
      depth < MAX_RECURSION_DEPTH &&
      typeName === "ZodObject" &&
      value && typeof value === "object" && !Array.isArray(value)
    ) {
      const nested = coerceParamsToSchema(value, fieldSchema, root, depth + 1);
      if (nested !== value) {
        coerced[key] = nested;
        didCoerce = true;
      }
    }
  }
  return didCoerce ? coerced : args;
}
```

### Step 2.2: Update `registerTool` to accept `root` and call `coerceParamsToSchema` (10m)

> **Red-team F5 fix:** the original `coerced !== args` check fired the `wire_format_coerced` log on EVERY tool call (the `{ ...args }` spread always allocates a new object). With the F1 fix (helper returns `args` identity when no coercion), `coerced !== args` is now a reliable signal. The log line still fires for true coercions only.

```js
export function registerTool(server, config, root) {
  if (registeredNames.has(config.name)) {
    throw new Error(`Tool name collision: ${config.name} already registered`);
  }
  registeredNames.add(config.name);

  const wrappedHandler = async (args) => {
    try {
      // Wire-format coercion: re-hydrate coerced top-level array/boolean/number
      const coerced = coerceParamsToSchema(args, config.schema, root);
      if (coerced !== args && root) {
        // Identity is now a reliable signal (F5 fix); log only true coercions
        const coercedFields = Object.keys(coerced).filter(
          (k) => JSON.stringify(coerced[k]) !== JSON.stringify(args[k])
        );
        if (coercedFields.length > 0) {
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

### Step 2.4: Implement `meta_state_patch` tool (30m)

Create `tools/learning-loop-mcp/tools/meta-state-patch-tool.js`. **Red-team F2, F4, F9, F10 fixes baked in:**

> **F2 (Test 4 reachable):** enum extended to include `"change-log"` so the handler's immutability check is reachable. Schema's `.describe()` notes "handler-level immutability check."
>
> **F4 (deny-list for identity fields):** the patch schema is `z.object({}).passthrough()`, which means ANY field can be patched. Without a deny-list, an agent can overwrite `id`, `version`, `created_at`, `code_fingerprint`, `promoted_to_rule`, `consolidated_into`, `resolved_*`, `acked_at`, `status` — the audit trail. The deny-list below prevents identity-field and audit-trail mutation.
>
> **F9 (fail-safe on unknown return):** `updateEntry` returns `true | null | "version_mismatch" | "validation_failed"`. A future maintainer adding a new return value (e.g., `"rate_limited"`) would silently make the patch tool report success. `else { throw new Error(...) }` forces visible failure.
>
> **F10 (auto-capture `_expected_version`):** Optional `_expected_version` is a race footgun. The handler now auto-captures `entry.version` if not provided, so the pre-read is always inside the CAS window.

```js
import { z } from "zod";
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// F4: deny-list of fields that must NEVER be patched.
// These are identity fields, audit-trail fields, and consult-gate enforcement
// fields. Patching them is an audit-trail rewrite; reject with a clear error.
const IMMUTABLE_PATCH_FIELDS = new Set([
  "id",            // identity — must never change
  "entry_kind",    // branch — must never change (validated pre-patch, locked here)
  "version",       // CAS counter — updateEntry manages this
  "created_at",    // audit trail
  "created_by",    // audit trail
  "code_fingerprint",  // consult-gate enforcement (`rule-no-orphaned-evidence`)
  "promoted_to_rule",  // rule promotion pointer (immutable)
  "consolidated_into", // finding→change-log pointer
  "acked_at",      // audit trail
  "resolved_at",   // audit trail
  "resolved_by",   // audit trail
  "resolution",    // audit trail
]);

export const metaStatePatchTool = {
  name: "meta_state_patch",
  description: "Patch an existing meta-state entry. Unifies update_finding / update_design / update_change_log / backfill_fingerprint into one tool. CAS via _expected_version (auto-captured if omitted). Idempotency by CAS (existing pattern in updateEntry). Wire-format safe: nest complex-typed fields inside the `patch` object to avoid top-level array/boolean coercion by the MCP wire layer. Closes the CRUD gap and the parent escape-hatch abuse. Identity and audit-trail fields are deny-listed and cannot be patched.",
  schema: {
    id: z.string().describe("Exact entry id to patch"),
    entry_kind: z.enum(["finding", "rule", "loop-design", "change-log"])
      .describe("Entry kind branch — used to validate patch shape. `change-log` is handler-level immutable; the schema allows it so the immutability branch is reachable."),
    patch: z.object({}).passthrough()
      .describe("Partial fields to update. Nest arrays/booleans in this object. Use core/meta-state.js#metaStateEntryPatchSchema's passthrough semantics: any subset of union fields is valid. Identity and audit-trail fields (id, version, created_at, code_fingerprint, etc.) are denied at the handler."),
    _expected_version: z.number().optional()
      .describe("Optional CAS: patch succeeds only if current entry.version === _expected_version. If omitted, the handler auto-captures the version from the pre-read for race safety. On mismatch, returns { patched: false, reason: 'version_mismatch', current_version }."),
  },
  handler: async ({ id, entry_kind, patch, _expected_version }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      const result = { patched: false, reason: "not_found", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
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
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (entry.entry_kind === "change-log") {
      const result = { patched: false, reason: "change_log_immutable", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // F4: deny-list check — reject any patch that touches identity or audit-trail fields
    const deniedFields = Object.keys(patch).filter((k) => IMMUTABLE_PATCH_FIELDS.has(k));
    if (deniedFields.length > 0) {
      const result = {
        patched: false,
        reason: "immutable_field",
        id,
        denied_fields: deniedFields,
      };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // F10: auto-capture _expected_version from pre-read if not provided.
    // This makes the pre-read → enqueue window the only place a race can occur,
    // and updateEntry's enqueue serializes the actual write.
    const currentVersion = entry.version ?? 0;
    const effectiveExpectedVersion = _expected_version !== undefined
      ? _expected_version
      : currentVersion;
    const patchWithCAS = { ...patch, _expected_version: effectiveExpectedVersion };

    const updateResult = await updateEntry(root, id, patchWithCAS);

    if (updateResult === "version_mismatch") {
      // Re-read for the freshest current_version (the one updateEntry saw)
      const freshEntries = readRegistry(root);
      const fresh = freshEntries.find((e) => e.id === id);
      const result = {
        patched: false,
        reason: "version_mismatch",
        id,
        current_version: fresh?.version ?? 0,
      };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (updateResult === "validation_failed") {
      const result = { patched: false, reason: "validation_failed", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (updateResult !== true) {
      // F9: fail-safe on unknown return value. Future maintainer adding
      // a new return (e.g., "rate_limited") will not silently succeed.
      throw new Error(
        `meta_state_patch: unexpected updateEntry result for ${id}: ${JSON.stringify(updateResult)}`
      );
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

### Step 2.7: Run the 12 new tests, confirm all pass (5m)

```bash
node --test 'tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js' 'tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js'
```

Expected: 12/12 pass.

### Step 2.8: Run the full test suite, confirm no regressions (5m)

```bash
pnpm test
```

Expected: 499+ pass (487 existing + 12 new).

If any existing test fails, the wire-format fix may be too aggressive (coercing a field that an existing tool genuinely wants as a string). Diagnose by reading the failing test, identify the field, and either:
- (a) Add an exclusion to `coerceParamsToSchema` for that field
- (b) Update the tool's schema to declare the correct type (which is what the helper uses to decide whether to coerce)

## Success Criteria

- [ ] `coerceParamsToSchema` is exported from `tool-registry.js` and handles all 5 wire-format test cases
- [ ] `registerTool` accepts `root` parameter and calls `coerceParamsToSchema` in `wrappedHandler`
- [ ] `server.js` passes `root` to `registerTool`
- [ ] `meta_state_patch` tool is implemented and handles all 7 patch test cases (including deny-list for `id`/`version`/`code_fingerprint`/etc.)
- [ ] `meta_state_patch` is registered in both `tools/manifest.json` and `agent-manifest.json`
- [ ] 12/12 new tests pass
- [ ] 487+ existing tests still pass
- [ ] `meta_state_propose_design` and `meta_state_report` can now accept top-level array/boolean params (verified by the new wire-format tests + the real-schema regression test in `wire-format-coercion-fix.test.js`)

## Risk Assessment

### Risk: Zod 4.x changed `_def` structure

The helper uses `fieldSchema._def.typeName` and `fieldSchema._def.innerType._def.typeName`. Zod 4.x has changed some internals. **Mitigation:** the import path is `zod: ^4.4.3` per package.json. If `_def.typeName` is renamed in 4.4.3, the helper falls back to `fieldSchema.constructor.name` (F7 fix). If introspection still fails, the helper logs `coercion_introspection_failed` to `gate-log.jsonl` and continues without coercion (fail-open, no new harm).

### Risk: `coerceParamsToSchema` is too eager

If a tool declares `addresses: z.string()` (intentionally a string), but the value happens to arrive as a JSON-encoded string, the helper should NOT coerce it. The helper checks `typeName === "ZodArray"` before coercing — string fields are not coerced. Verified by Test 4 (no-op for correct types) and Test 5 (real-schema regression with `propose_design`).

### Risk: The audit log line `wire_format_coerced` may flood the log

**Original risk:** `coerced = { ...args }` always created a new object, so `coerced !== args` was always true → log fired on every call. **F5 fix:** helper now returns `args` identity when no coercion happened, so the log fires only for true coercions. This risk is now mitigated.

## Rollback Plan

If Phase 2 cannot be made green within the ~1h estimate, the rollback is:
1. Revert the changes to `tool-registry.js` and `server.js` (keep the helper, but don't wire it into `wrappedHandler`)
2. Delete `meta_state_patch` and the manifest entries
3. The 12 new tests will fail (expected), but the live system is unchanged
4. Defer the plan and re-scope

This is safe because the changes are additive: a new tool + a new helper. The existing 13 meta-state tools (12 + the new patch tool in the manifest) and all other tools are unchanged.
