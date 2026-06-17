---
phase: 02
title: Coerce Layer Deletion
status: planned
priority: high
effort: 30min
dependencies: [phase-01-schema-migration]
predecessor: phase-01-schema-migration
---

# Phase 02 — Coerce Layer Deletion

## Overview

Delete the imperative coerce walkers from the mastra factory and the legacy lifted helper. After Phase 1, every tool's inputSchema uses Zod-native coercion (`z.coerce.*` + `z.preprocess(envelope-stripper, ...)`), so the imperative layer is dead code. Delete it.

**Priority:** high. Required before Phase 3 (test migration); without it, the `coerceParams` export + `installWireFormatCoercion` remain importable, masking incomplete Phase 1 work.

## Key Insights

1. **`createLoopTool` collapses to a 1-line re-export.** Once `wrapSchema` is deleted, the factory adds zero value beyond `createTool`. The seam exists for `server.js:21` re-export; that survives.
2. **`coerceParams` export (lines 139-142) has ZERO production callers.** Verified by Researcher 2 §6: 22 test calls across 3 files, 0 production calls. Safe to delete.
3. **`core/wire-format-coercion.js` (183 lines) is dead after Phase 1 + Phase 3.** All 4 mcp-side test callers are renamed/migrated in Phase 3. Safe to delete.
4. **`parity-harness.js` (191 lines) is dead post-Plan 3.** All 3 exports (`schemaJsonParity`, `toolsListParity`, `toolsCallParity`) require legacy + mastra inputs; legacy is deleted. Zero callers. Decision: delete (YAGNI).

## Requirements

### Functional

- `coerceScalar`, `unwrapItem`, `extractShape`, `coerceShape`, `wrapSchema` deleted from `tools/learning-loop-mastra/create-loop-tool.js`.
- `coerceParams` export deleted from same file.
- `createLoopTool` becomes 1-line `createTool` re-export.
- `tools/learning-loop-mcp/core/wire-format-coercion.js` deleted (entire 183-line file).
- `tools/learning-loop-mastra/__tests__/parity-harness.js` deleted (191 lines; dead code).
- `tools/learning-loop-mastra/__tests__/parity-harness.test.js` deleted (self-test of deleted harness).
- `appendGateLog` import in `create-loop-tool.js` removed (was used by coerce walkers for logging; not needed after deletion).

### Non-Functional

- `pnpm test` passes all 10 test namespaces after deletion.
- No new files added; net -375 lines (mastra factory shrinks by ~108 lines; legacy helper 183 lines deleted; parity-harness + test 191 lines deleted).
- `tools/learning-loop-mastra/create-loop-tool.js` shrinks to ~10 lines (import + 1-line factory).

## Architecture

### Before (108-line factory)

```javascript
// tools/learning-loop-mastra/create-loop-tool.js (current, 146 lines)
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const MAX_RECURSION_DEPTH = 2;
const MAX_UNWRAP_ITERATIONS = 3;
const MAX_TYPE_NAME_UNWRAP = 5;

function getTypeName(fieldSchema) { /* 2 lines */ }
function unwrapTypeName(fieldSchema) { /* 25 lines */ }
function coerceScalar(value, typeName) { /* 22 lines */ }
function unwrapItem(value, typeName) { /* 17 lines */ }
function extractShape(schema) { /* 14 lines */ }
function coerceShape(shape, args, depth = 0) { /* 28 lines */ }
function wrapSchema(inputSchema) { /* 9 lines */ }
export function coerceParams(args, schema) { /* 3 lines */ }

export function createLoopTool({ id, description, inputSchema, execute }) {
  return createTool({ id, description, inputSchema: wrapSchema(inputSchema), execute });
}
```

### After (10-line factory)

```javascript
// tools/learning-loop-mastra/create-loop-tool.js (post-Phase 2)
import { createTool } from "@mastra/core/tools";

/**
 * Factory seam for the loop's tools. Pre-Phase 2 this wrapped inputSchema with
 * imperative coerce walkers; post-Phase 2 the schema is the source of truth
 * (z.coerce.* + z.preprocess envelope strippers handle wire-format quirks
 * declaratively). Factory collapses to a 1-line re-export of @mastra/core/tools.
 */
export function createLoopTool({ id, description, inputSchema, execute }) {
  return createTool({ id, description, inputSchema, execute });
}
```

## Related Code Files

### Delete (3 files)

- `tools/learning-loop-mcp/core/wire-format-coercion.js` (183 lines)
- `tools/learning-loop-mastra/__tests__/parity-harness.js` (191 lines)
- `tools/learning-loop-mastra/__tests__/parity-harness.test.js` (3.6KB; self-test of deleted harness)

### Modify (1 file)

- `tools/learning-loop-mastra/create-loop-tool.js` — delete lines 4-142 (helpers + export), keep lines 1-3 + line 144-146 (factory + docstring update). Net: 146 → ~10 lines.

### Verify post-deletion

- `grep -rn "coerceScalar\|unwrapItem\|coerceShape\|wrapSchema\|coerceParams\|coerceValue\|unwrapItemWrap\|coerceParamsToSchema\|installWireFormatCoercion" tools/` returns no production callers.
- `grep -rn "from.*wire-format-coercion" tools/` returns no callers.
- `grep -rn "from.*parity-harness" tools/` returns no callers (after Phase 3 rewrite of `parity-zod-to-json-schema.test.js`).

## Implementation Steps

1. Delete `tools/learning-loop-mcp/core/wire-format-coercion.js` (whole file).
2. Delete `tools/learning-loop-mastra/__tests__/parity-harness.js` (whole file).
3. Delete `tools/learning-loop-mastra/__tests__/parity-harness.test.js` (whole file; self-test of deleted harness).
4. Edit `tools/learning-loop-mastra/create-loop-tool.js`:
   - Delete `import { z } from "zod";` (line 2).
   - Delete `const MAX_RECURSION_DEPTH = 2; const MAX_UNWRAP_ITERATIONS = 3; const MAX_TYPE_NAME_UNWRAP = 5;` (lines 4-6).
   - Delete `getTypeName`, `unwrapTypeName`, `coerceScalar`, `unwrapItem`, `extractShape`, `coerceShape`, `wrapSchema` function definitions (lines 8-137).
   - Delete `coerceParams` export (lines 139-142).
   - Update `createLoopTool` docstring (lines 143-146).
   - Final state: ~10-line file with single `createLoopTool` re-export.
5. Run `grep -rn "coerceScalar\|coerceShape\|wrapSchema\|coerceParams\|installWireFormatCoercion\|unwrapItemWrap\|coerceParamsToSchema" tools/` — must return 0 results.
5a. **Dead-code grep (red-team finding 5):** Run `grep -rn "schemaJsonParity\|toolsListParity\|toolsCallParity\|from.*parity-harness\|readFile.*parity-harness" tools/ .claude/` — must return 0 results. Embed (empty) result in PR description as evidence the parity-harness has no callers.
6. Run `pnpm test` — all 10 test namespaces pass (Phase 3 may temporarily fail; fix in Phase 3).

## Success Criteria

- `tools/learning-loop-mastra/create-loop-tool.js` is ~10 lines.
- `tools/learning-loop-mcp/core/wire-format-coercion.js` does not exist.
- `tools/learning-loop-mastra/__tests__/parity-harness.js` does not exist.
- `tools/learning-loop-mastra/__tests__/parity-harness.test.js` does not exist.
- `grep` for coerce-layer symbols returns 0 production callers.
- Net file delta: -375 lines (146-10 + 183 + 191 + 60 = 570 deleted; net -375 after 10-line factory addition).

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Hidden production caller of `coerceParams` | Low | Researcher 2 verified 0 production callers; only tests use it |
| `parity-harness.js` is needed for Phase E | Low | YAGNI; Phase E can re-author in its own scope; documented in operator-guide |
| Server.js:21 re-export of `createLoopTool` breaks | Low | Signature unchanged; only internal logic removed |
| Mastra server can't start without `wrapSchema` | None | Schema-side `z.preprocess` provides equivalent functionality |

## Operator Decisions Needed

### Decision 4 — `parity-harness.js` deletion vs Phase E scaffolding

**Option A (RECOMMENDED):** Delete `parity-harness.js` (191 lines) + `parity-harness.test.js` (~3.6KB).
- Rationale: YAGNI. Dead post-Plan 3; no callers; Phase E will author its own harness when HTTP parity needs arise.
- Net: -194 lines; simpler test surface.

**Option B:** Keep both files as Phase E scaffolding.
- Rationale: If Phase E ships HTTP transport parity, the harness exports `schemaJsonParity`/`toolsListParity`/`toolsCallParity` for comparing HTTP output to stdio output.
- Cost: 194 lines of unused code for an uncertain future.

**Plan recommendation:** Option A (delete). YAGNI principle. Phase E will be a separate, planned effort with its own tools.

## Next Steps

- Phase 3 (test migration + acceptance) deletes the 4 mastra-side wire-format tests + renames `parity-zod-to-json-schema.test.js` → `coerce-correctness.test.js` per Plan 3 Group 11 C-8.
- SP2 grounding on `create-loop-tool.js` post-Phase 2 (fingerprint the 10-line factory).
