---
phase: 2
title: "Green (implementation)"
status: pending
priority: P1
effort: "0.75h"
dependencies: [1]
---

# Phase 2: Green (implementation)

## Overview

Move coercion from the handler layer to the SDK validation boundary so wire-corrupted top-level arrays and booleans are repaired before Zod validation runs. The change is split between two files: `tool-registry.js` attaches the raw shape to the registered tool, and `server.js` patches `McpServer.validateToolInput` to run `coerceParamsToSchema` using that raw shape.

## Requirements

- Functional: `meta_state_propose_design` and `meta_state_report` must accept their wire-corrupted inputs over stdio.
- Functional: `tools/list` must continue to advertise the real tool schemas.
- Functional: handler-level coercion remains as a defensive fallback.
- Non-functional: minimal code change; no new dependencies.

## Architecture

```
JSON-RPC request
    │
    ▼
McpServer.validateToolInput (patched)
    │
    ├── coerceParamsToSchema(args, tool._coerceSchema)
    │       unwraps {item: [...]} → [...]
    │       coerces "true"/"false" → boolean
    │
    ▼
original validateToolInput → Zod parse against real schema
    │
    ▼
wrappedHandler → coerceParamsToSchema (no-op now)
    │
    ▼
config.handler receives flat, typed args
```

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/tool-registry.js`
- **Modify:** `tools/learning-loop-mcp/server.js`
- **Read:** `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js` (validateToolInput, ~lines 166-181)

## Implementation Steps

1. In `tool-registry.js`:
   - Export a new function `installWireFormatCoercion(server, root)`.
   - Inside it, save `const original = server.validateToolInput.bind(server)`.
   - Replace `server.validateToolInput` with an async wrapper that:
     - Checks `tool?._coerceSchema` and that `args` is a non-null object.
     - Calls `coerceParamsToSchema(args, tool._coerceSchema, root)`.
     - Calls `original(tool, coercedArgs, toolName)`.
   - Wrap the coercion in a try/catch that falls back to original args on any unexpected error and logs `wire_format_coercion_failed` via `appendGateLog`.
   - Add a guard after wrapping: assert `typeof server.validateToolInput === 'function'` and `server.validateToolInput !== original`. If the guard fails, throw an error so the server fails to start rather than silently running without coercion.
2. In `tool-registry.js#registerTool`:
   - Capture the return value of `server.tool(...)`: `const registeredTool = server.tool(...)`.
   - Set `registeredTool._coerceSchema = config.schema` so the patch can find the raw shape.
3. In `server.js`:
   - Import `installWireFormatCoercion` from `./tool-registry.js`.
   - After `const server = new McpServer(...)`, call `installWireFormatCoercion(server, root)`.
4. Keep `wrappedHandler` unchanged; the second `coerceParamsToSchema` call is a defensive no-op.
5. Run `pnpm test` and confirm:
   - The 4 new stdio tests from Phase 1 now pass.
   - `wire-format-coercion-fix.test.js` and `wire-format-patch-recursion.test.js` still pass.
   - No regressions elsewhere.

## Success Criteria

- [ ] `tools/learning-loop-mcp/tool-registry.js` exports `installWireFormatCoercion` and attaches `_coerceSchema`.
- [ ] `tools/learning-loop-mcp/server.js` calls `installWireFormatCoercion` after server creation.
- [ ] `meta_state_propose_design` via stdio with `{item: [...]}` arrays succeeds.
- [ ] `meta_state_report` via stdio with `"true"`/`"false"` mechanism_check succeeds.
- [ ] `tools/list` still advertises array-typed `proposed_design_for` and `addresses`.
- [ ] Unit test confirms `installWireFormatCoercion` actually replaces `server.validateToolInput`.
- [ ] `pnpm test` green.

## Risk Assessment

- **SDK internals fragile:** patching an instance method is less fragile than prototype patching, but still couples to SDK shape. **Mitigation:** guard with `typeof server.validateToolInput === 'function'`; fall back to handler-level coercion if missing.
- **Coercion exception kills the call:** unexpected malformed input could throw inside coercion. **Mitigation:** try/catch in the wrapper falls back to original args so the original Zod error is surfaced.
- **Schema registration order:** `installWireFormatCoercion` runs before tools are registered, but `_coerceSchema` is attached per tool during registration. **Mitigation:** the patch reads `_coerceSchema` at call time, so order does not matter.
