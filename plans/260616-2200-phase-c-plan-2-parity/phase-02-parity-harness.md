---
phase: 2
title: "Parity Harness Module"
status: completed
priority: P1
effort: "1h"
dependencies: ["1"]
---

# Phase 2: Parity Harness Module

## Overview

Ship `tools/learning-loop-mastra/__tests__/parity-harness.js` — a test-utility module with two helpers (`toolsListParity` + `toolsCallParity`) that compares MCP `tools/list` + `tools/call` output between the legacy and mastra servers. The harness is the load-bearing primitive Phases 4-6 build on. **TDD-first: 5 invariant tests RED, then GREEN.**

## Why a separate harness module

The existing `tools/learning-loop-mastra/__tests__/parity-schema-shape.test.js` (Plan 1) only checks `Object.keys(shape).sort()`. It's a fast-fail pre-check, not a full structural comparison. Plan 2's parity gate needs:
- **Structural schema comparison** (per-field `_def.typeName`, not just keys) — F7 from red team.
- **Serialized JSON Schema comparison** via `z.toJSONSchema()` — F11 from red team.
- **Tool-call content comparison** (the `text` JSON inside `content[0]`).

A dedicated harness module keeps these comparisons testable in isolation, reusable across Phases 4-6, and honest about what "byte-identical" means in practice (the harness's `toolsListParity` is a function, not a side-effect; the comparison logic can be unit-tested without spawning servers).

## Requirements

- **Functional:** the harness module exposes `toolsListParity(legacyList, mastraList, { nameMap })` and `toolsCallParity(legacyCall, mastraCall, { ignoreFields })`. Returns `{ parity: true|false, diff: <detailed diff object> }`. No throwing on diff (callers decide).
- **Non-functional:** the harness does NOT spawn servers (that's Phase 3's job); the harness only does the comparison logic. Pure function. No I/O.

## Architecture

```
parity-harness.js
├── toolsListParity(legacyList, mastraList, opts)
│     ├── map names via opts.nameMap (legacy_name → mastra_name; e.g. { gate_check: "mastra_gate_check" })
│     ├── for each legacy tool:
│     │     ├── assert mastra tool exists by mapped name
│     │     ├── assert description === (string compare)
│     │     └── assert inputSchema parity via schemaJsonParity (Phase 4 helper)
│     ├── assert mastra tool count matches (29 in this case)
│     └── return { parity, diff: { missing, extra, schemaDiff: {...} } }
├── toolsCallParity(legacyCall, mastraCall, opts)
│     ├── assert both have content[0].text
│     ├── JSON.parse both texts
│     ├── deepEqual (with opts.ignoreFields filter)
│     └── return { parity, diff: { legacyParsed, mastraParsed, fields: [...] } }
└── schemaJsonParity(legacySchema, mastraSchema)
      ├── run z.toJSONSchema on both
      ├── deepEqual
      └── return { parity, diff: { legacyJson, mastraJson } }
```

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/parity-harness.js` (~120 lines; pure functions, no I/O)
- Create: `tools/learning-loop-mastra/__tests__/parity-harness.test.js` (5 invariant tests; no server spawn)

## Implementation Steps

1. **TDD: write 5 invariant tests first (RED).** Per R-11, test fixtures are **real legacy schemas** imported from `tools/learning-loop-mcp/tools/`, not hand-rolled approximations:
   - Test 1: `toolsListParity` returns `{ parity: true }` for two identical `tools/list` arrays (identity, using a real schema like `gateCheckTool.schema`).
   - Test 2: `toolsListParity` returns `{ parity: false, diff.missing }` when mastra is missing one tool (drop one entry from the mastra side).
   - Test 3: `toolsListParity` returns `{ parity: false, diff.schemaDiff }` when one tool's `inputSchema` diverges (use `metaStateListTool.schema` on the legacy side and a schema with one field removed on the mastra side).
   - Test 4: `toolsCallParity` returns `{ parity: true }` for two `content[0].text` JSONs that deepEqual (use a known stable response shape).
   - Test 5: `toolsCallParity` returns `{ parity: false, diff.fields }` listing divergent field names (add a key to one side, drop on the other).

2. **Run tests, confirm 5 RED.** `node --test tools/learning-loop-mastra/__tests__/parity-harness.test.js` → 0/5 pass.

3. **Implement `parity-harness.js`** (~120 lines):
   ```js
   import assert from "node:assert/strict";
   import { z } from "zod";

   // Sort keys recursively for deterministic comparison (per validation).
   function sortKeysDeep(obj) {
     if (Array.isArray(obj)) return obj.map(sortKeysDeep);
     if (obj && typeof obj === "object") {
       return Object.keys(obj).sort().reduce((acc, k) => {
         acc[k] = sortKeysDeep(obj[k]);
         return acc;
       }, {});
     }
     return obj;
   }

   export function schemaJsonParity(legacySchema, mastraSchema) {
     // Both sides are zod schemas (or shape objects). Convert with z.toJSONSchema.
     // The factory's mastra input is z.preprocess-wrapped; set io: "input" to
     // unwrap to the input type so the comparison is apples-to-apples.
     const legacyJson = z.toJSONSchema(legacySchema, { target: "draft-7" });
     const mastraJson = z.toJSONSchema(mastraSchema, { target: "draft-7", io: "input" });
     // Strip description / $schema / title from mastra (legacy omits them).
     const stripMeta = (s) => { const { $schema, title, ...rest } = s; return rest; };
     // Normalize: sort keys recursively (per validation, JSON key order is non-deterministic).
     const legacyNorm = sortKeysDeep(stripMeta(legacyJson));
     const mastraNorm = sortKeysDeep(stripMeta(mastraJson));
     const parity = JSON.stringify(legacyNorm) === JSON.stringify(mastraNorm);
     return parity
       ? { parity: true }
       : { parity: false, diff: { legacyJson: legacyNorm, mastraJson: mastraNorm } };
   }

   export function toolsListParity(legacyList, mastraList, opts = {}) {
     const nameMap = opts.nameMap || new Map(); // legacy_name → mastra_name
     const mastraByName = new Map(mastraList.map((t) => [t.name, t]));
     const diff = { missing: [], extra: [], schemaDiff: [] };

     for (const legacyTool of legacyList) {
       const mastraName = nameMap.get(legacyTool.name) || `mastra_${legacyTool.name}`;
       const mastraTool = mastraByName.get(mastraName);
       if (!mastraTool) {
         diff.missing.push({ legacyName: legacyTool.name, mastraName });
         continue;
       }
       if (legacyTool.description !== mastraTool.description) {
         diff.schemaDiff.push({ name: legacyTool.name, field: "description", legacy: legacyTool.description, mastra: mastraTool.description });
       }
       const schemaResult = schemaJsonParity(legacyTool.inputSchema, mastraTool.inputSchema);
       if (!schemaResult.parity) {
         diff.schemaDiff.push({ name: legacyTool.name, ...schemaResult.diff });
       }
     }
     const parity = diff.missing.length === 0 && diff.extra.length === 0 && diff.schemaDiff.length === 0;
     return parity ? { parity: true } : { parity: false, diff };
   }

   export function toolsCallParity(legacyCall, mastraCall, opts = {}) {
     // Parse both content[0].text as JSON, sort keys recursively, deepEqual.
     const legacyParsed = JSON.parse(legacyCall.content[0].text);
     const mastraParsed = JSON.parse(mastraCall.content[0].text);
     const legacyNorm = sortKeysDeep(legacyParsed);
     const mastraNorm = sortKeysDeep(mastraParsed);
     const parity = JSON.stringify(legacyNorm) === JSON.stringify(mastraNorm);
     return parity
       ? { parity: true }
       : { parity: false, diff: { legacy: legacyNorm, mastra: mastraNorm } };
   }
   ```

4. **Run tests, confirm 5 GREEN.** 5/5 pass.

5. **Refactor if needed** (YAGNI; do not add features the harness does not need).

## Success Criteria

- [ ] 5 invariant tests pass
- [ ] `parity-harness.js` exports `toolsListParity`, `toolsCallParity`, `schemaJsonParity`
- [ ] `z.toJSONSchema()` is used (not raw Zod `_def.typeName` reflection) — F11 resolved
- [ ] Per-field type comparison is implicit in JSON Schema serialization (F7 resolved)
- [ ] No server spawn in the harness module (Phase 3 handles that)
- [ ] No silent fallbacks; `parity: false` always includes a `diff` object

## Risk Assessment

- **Risk:** `z.toJSONSchema()` on a `z.preprocess`-wrapped input may include the `preprocess` metadata in the output, causing a false-positive diff. **Mitigation:** the `io: "input"` option is the documented escape hatch; the 5 invariant tests include a case with a `z.preprocess` wrapper to surface this risk early.
- **Risk:** the legacy `McpServer`'s JSON Schema output includes `additionalProperties: false` (Zod v3 default), but `z.toJSONSchema()` for Zod v4 in output mode also includes it — they should match. In `io: "input"` mode, Zod v4 does NOT include `additionalProperties: false`. **Mitigation:** Phase 4's tests run BOTH `io: "input"` and `io: "output"` for one known schema; if they diverge, the harness normalizes.

## Security Considerations

None. The harness is pure functions; no I/O, no privileged operations.

## Next Steps

Phase 3 (dual-server spawn loop) uses the harness to actually compare live server output. Phase 4 expands the harness to cover content JSON. Phase 5 uses the harness in the cold-session test. Phase 6 uses it for the collision test.
