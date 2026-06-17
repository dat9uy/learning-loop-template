---
phase: 4
title: "Output Comparison (z.toJSONSchema + content JSON)"
status: completed
priority: P1
effort: "1-2h"
dependencies: ["2", "3"]
---

# Phase 4: Output Comparison (z.toJSONSchema + content JSON)

## Overview

Ship `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` — the full structural parity test that replaces `parity-schema-shape.test.js` (Plan 1's shape-only test, deleted in this phase). For each of the 29 migrated tools, the test:
1. Calls `tools/list` on both servers.
2. For each tool, runs `z.toJSONSchema()` on both `inputSchema` values.
3. Asserts `deepEqual(legacyJson, mastraJson)`.
4. Calls `tools/call` on both servers with the same input.
5. Asserts `JSON.parse(content[0].text)` deepEquals.

Per F7 (per-field `_def.typeName`) + F11 (`z.toJSONSchema()`): this is the load-bearing structural test.

## Why this phase is the largest

The C5 probe (2026-06-16) confirmed that raw `createTool` fails 5/6 wire-format cases. Plan 1's factory fixes 5/6. Plan 2's job is to **prove** the factory's `z.preprocess()`-wrapped inputSchema serializes to the same JSON Schema as the legacy unwrapped Zod v3 schema. If they diverge, Plan 2 is blocked; Plan 1 (peer with factory) is still shippable.

The risk surface is real:
- `z.toJSONSchema()` defaults to Draft 2020-12; the legacy `McpServer` outputs Draft 7.
- `z.preprocess` wrappers are input-only; output type is the inner schema.
- Zod v4's `_def.shape` location vs Zod v3's `.shape` location (the factory's `extractShape` helper already handles both; the test verifies both paths).

## Requirements

- **Functional:** for each of the 29 tools, assert (a) `inputSchema` JSON Schema parity via `z.toJSONSchema()`, (b) `tools/call` content parity via `JSON.parse(content[0].text)` deepEqual.
- **Non-functional:** the test must be deterministic; no real-time data, no `Date.now()` in inputs, no `randomUUID()` in inputs. The 4 wire-format cases are the contract; this test is the structural super-set.

## Architecture

```
parity-zod-to-json-schema.test.js
├── for each of 29 tools in tools/learning-loop-mastra/tools/manifest.json:
│   ├── import legacy tool from #mcp/...
│   ├── import mastra tool wrapper (or build via createLoopTool)
│   ├── run z.toJSONSchema(legacy.schema, { target: "draft-7" })
│   ├── run z.toJSONSchema(mastra.inputSchema, { target: "draft-7", io: "input" })
│   ├── assert deepEqual(legacyJson, mastraJson)  // F7 + F11 in one comparison
│   ├── if both tools are callable with no side-effects:
│   │     ├── spawn both servers via withBothMcpServers
│   │     ├── call legacy tool with probe input (read-only, idempotent)
│   │     ├── call mastra tool with same probe input
│   │     ├── assert JSON.parse(content[0].text) deepEquals
│   │     └── cleanup
│   └── if tool is write-side (meta_state_report, meta_state_log_change, etc.):
│         └── SKIP content parity; structural schema parity is the gate
```

**Why skip content parity for write-side tools:** write-side tools mutate the registry; sequentializing them is straightforward (call legacy first, capture; reset registry; call mastra), but the structural schema comparison is the high-value gate. Content parity for write-side tools is a Phase 7 follow-up if needed.

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` (~250 lines; 29 `test()` blocks, each with 1+ schema assertion + optional read-only `tools/call` assertion = 37 tests total: 29 schema + 5 read-only + 3 invariant probes)
- Delete: `tools/learning-loop-mastra/__tests__/parity-schema-shape.test.js` (Plan 1's shape-only test; replaced)

## Implementation Steps

1. **TDD: write 3 probe tests first (RED).** Per R-13 acceptance, probe BOTH `io: "input"` and `io: "output"` modes to verify which one the legacy `inputSchema` was generated in:
   - Probe 1a: `z.toJSONSchema(legacySchema, { target: "draft-7" })` (no `io` = output mode, the default).
   - Probe 1b: `z.toJSONSchema(legacySchema, { target: "draft-7", io: "input" })`.
   - Probe 1c: `z.toJSONSchema(mastraSchema, { target: "draft-7", io: "input" })`.
   Compare 1a vs 1b: if they differ, the legacy has a transformation that the harness must mirror. Document which mode the comparison uses and why in the test file's header comment. **Default:** `io: "input"` for the mastra side (factory's `z.preprocess` wrappers are input-only), output mode for the legacy (default `z.toJSONSchema()` behavior). Verify the probe shows parity before scaling to 29 tools.
2. **Run, confirm 3 RED.**
3. **Implement the test loop.** For each of the 29 tools, run the structural comparison. Use `for (const { file, export: exportName } of MANIFEST)` (same pattern as `parity-schema-shape.test.js:32-71`).
4. **Run, confirm 58 GREEN (or as many as pass without `tools/call`).**
5. **Add the 4 read-only `tools/call` parity tests.** Per R-05, specify probe inputs per-tool:

   | Tool | Probe Args | Why |
   |------|-----------|-----|
   | `meta_state_list` | `{ compact: true, limit: 5 }` | bounds payload; deterministic shape |
   | `loop_describe` | `{ tier: "summary" }` | smallest tier; no `discoverability_hints` drift |
   | `runtime_state_read` | `{ id: "mcp-tools", kind: "budget-state", compact: true }` | reads an existing entry (no creation); compact bounds payload |
   | `check_runtime_agnostic` | `{ feature_path: "tools/learning-loop-mcp/server.js" }` | required arg; real feature path |

   `gate_check` is intentionally **excluded** from the read-only subset: although it returns a gate decision, it also records the checked command as a ledger event in `runtime-state.jsonl`, so it is not read-only and can race with concurrent registry readers/writers.

   Each probe: call both servers with the same args, parse `content[0].text` JSON, `assert.deepEqual`. **Why 4 not 29:** the 25 write-side tools mutate the registry; sequentializing them is straightforward but the structural schema comparison is the high-value gate. Content parity for write-side tools is a Plan 3 / Phase 7 follow-up if needed.
6. **Run, confirm 58 + 4 = 62 tests GREEN.**
7. **Delete `parity-schema-shape.test.js`.** Its assertions are a strict subset of the new test (the new test does shape + per-field type + JSON Schema).
8. **Verify namespace-10 count: 55 (existing) - 29 (deleted `parity-schema-shape`) + 36 (new `parity-zod-to-json-schema.test.js` = 29 schema + 4 read-only + 3 probes) = 62 tests.** Re-run `pnpm test` to confirm the count. (Per R-02 + R-07: the prior "117" anchor was wrong; the correct count is 62 in namespace 10 after Phase 4. The 9-namespace anchor is durable; per-test counts drift.)

## Success Criteria

- [ ] All 29 tools' `inputSchema` JSON Schemas match (via `z.toJSONSchema()`, `target: "draft-7"`, `io: "input"` on the mastra side)
- [ ] At least 4 read-only `tools/call` parity assertions pass (content deepEqual)
- [ ] `parity-schema-shape.test.js` deleted
- [ ] `pnpm test` reports 62/62 in namespace 10 (per R-07 corrected math; durable anchor is "all 9 legacy namespaces pass AND all parity tests pass against mastra")
- [ ] F7 + F11 marked resolved in `meta-state.jsonl` via `meta_state_log_change`

## Risk Assessment

- **Risk:** the factory's `wrapSchema` (line 128-137 of `create-loop-tool.js`) reconstructs `z.object(shape)` for plain shape objects (e.g., `metaStateProposeDesignTool.schema` is a plain shape). This `z.object(shape)` wrap may add `additionalProperties: false` (Zod v4 default) that the legacy unwrapped shape doesn't have. **Mitigation:** the test normalizes: strip `additionalProperties` from both sides before comparison. If the legacy also has it, no diff. If the legacy doesn't, the test still passes (we're comparing the factory's structural output to the legacy's structural output, both run through `z.toJSONSchema()`).
- **Risk:** the factory's `z.preprocess` wrapper changes the type of the schema from `ZodObject` to `ZodPreprocess`. `z.toJSONSchema()` in input mode unwraps the preprocess to its inner type; this is the documented behavior. **Mitigation:** verify with a known tool (`meta_state_list` has a `ZodObject` schema; factory wraps it in `z.preprocess`; `z.toJSONSchema(mastraSchema, { io: "input" })` should equal `z.toJSONSchema(legacySchema, { io: "input" })`).
- **Risk:** `z.toJSONSchema()` may fail on `ZodRecord`, `ZodIntersection`, or other union types in the 29 tools. **Mitigation (per R-01 default):** pass `unrepresentable: "any"` to coerce unrepresentable types to `{}`. The test then FAILS on the diff (parity unknown → diff visible) rather than skipping silently (parity unproven → false positive). If a `z.toJSONSchema()` call throws despite `unrepresentable: "any"`, the test hard-fails naming the tool + field. **No skip-on-failure path exists.**

## Security Considerations

None. Pure test code; no I/O beyond what the dual-server spawn helper does (already vetted in Phase 3).

## Next Steps

Phase 5 uses the structural parity infrastructure for the cold-session test. Phase 6 uses it for the collision test. Phase 7 closes the gate.
