---
phase: 1
title: "Schema-normalize seam"
status: pending
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Schema-normalize seam

## Overview

Extract `normalizeInputSchema` from `mastra/create-loop-tool.js` into a new transport-agnostic `core/schema-normalize.js` that imports nothing Mastra-bound. The MCP factory re-imports it; behavior is unchanged. This is the seam the CLI needs so it can parse handler args without pulling `@mastra/core` into its import graph.

## Requirements

- Functional: `core/schema-normalize.js` exports `normalizeInputSchema(inputSchema)` with byte-identical behavior to the current inline function — a schema with `_def`/`def` + `parse` is returned as-is; a plain shape object is wrapped in `z.object(...)`.
- Functional: `mastra/create-loop-tool.js` imports `normalizeInputSchema` from `../core/schema-normalize.js` instead of defining it inline.
- Non-functional: `core/schema-normalize.js` imports ONLY `z` from `zod`. No `@mastra/*`, no `./schema-parity.js`, no `./with-r2-gate.js`. (`attachParityJSONSchema` stays in `mastra/` — it is MCP/JSON-schema-generation-only and uses `z.toJSONSchema` + `buildParitySchema`; the CLI does not need it.)
- Non-functional: MCP server boots; the existing tool/parity suites stay green. The public JSON Schema contract exposed via MCP `tools/list` is unchanged (the parity override is applied in `attachParityJSONSchema`, which is untouched).

## Architecture

`normalizeInputSchema` is the only piece of `create-loop-tool.js` the CLI needs. It is a pure zod wrapper with no Mastra coupling (verified by scout: `schema-parity.js` imports only `z`/`globalRegistry` from zod, and `normalizeInputSchema` itself uses only `z.object` + duck-typing). Moving it to `core/` makes the import graph reflect the dependency direction: `core/` is transport-agnostic, `mastra/` is the MCP transport. The CLI (Phase 2) imports from `core/`, never from `mastra/`.

No data flow change. The function is called in exactly one place (`createLoopTool`), so the move is a single re-import.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/schema-normalize.js`
- Modify: `tools/learning-loop-mastra/mastra/create-loop-tool.js` (remove inline `normalizeInputSchema`, add import)
- Create: `tools/learning-loop-mastra/__tests__/schema-normalize.test.js`
- Delete: none

## Implementation Steps (TDD)

1. **Test first.** Write `__tests__/schema-normalize.test.js`:
   - Plain shape `{ a: z.string() }` → result `.parse({ a: "x" })` returns `{ a: "x" }`; result is a ZodObject (has `_def`).
   - Already-zod schema (e.g. `z.object({ a: z.string() })`) passed in → returned by identity (`===`).
   - Empty object `{}` → wrapped (parses `{}` ok).
   - Static import-graph assertion: read `core/schema-normalize.js` source as text and assert it does NOT contain `@mastra` and does NOT contain `from "./schema-parity` / `from "./with-r2-gate`. This locks the Mastra-free boundary so a future edit can't silently reintroduce the dependency the CLI relies on.
2. Run the test — it fails (module does not exist yet).
3. **Implement.** Create `core/schema-normalize.js` with the function body copied verbatim from `create-loop-tool.js:18-28` and `import { z } from "zod"`.
4. Edit `create-loop-tool.js`: delete the inline function, add `import { normalizeInputSchema } from "../core/schema-normalize.js";`. Leave `attachParityJSONSchema` and the `createLoopTool` body untouched.
5. Run the new test → green.

## Success Criteria

- [ ] `__tests__/schema-normalize.test.js` green (behavior + Mastra-free boundary).
- [ ] `pnpm test` (full suite) green — MCP server boot and existing tool/parity tests unaffected.
- [ ] `grep -n "@mastra" tools/learning-loop-mastra/core/schema-normalize.js` returns nothing.
- [ ] `node tools/learning-loop-mastra/mastra/server.js` boots (smoke: `pnpm gate:server` starts and prints the registered-tools stderr line, then kill) — or assert via an existing boot test.

## Risk Assessment

- **Lowest-risk phase.** Pure relocate of one pure function called from one site. No public contract change, no behavior change.
- **Mitigation for "did I change behavior?":** the test asserts the already-zod path is identity (`===`) and the plain-shape path parses; the full suite re-runs every MCP tool/parity test, which exercises `normalizeInputSchema` through `createLoopTool`.
- **Rollback:** revert the import line and restore the inline function (one edit each direction).