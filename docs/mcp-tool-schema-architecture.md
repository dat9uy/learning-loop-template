# MCP Tool Schema Architecture — Zod + Mastra SDK Integration

**Audience:** Engineers and agents debugging or extending tool inputSchemas in the `learning-loop-mastra` MCP server. Replaces the need to read `node_modules/@mastra/{core,mcp,schema-compat}/dist/*.js` and `node_modules/zod/v4/core/*.js`.

**Why this doc exists:** PR#5's coerce-layer zod-native migration (commit `b7cd756`) shipped a 125-line `schema-parity.js` shim that has a non-obvious interaction with the Mastra SDK and zod 4.4.3 internal APIs. Without this doc, future agents have to re-discover the shim's behavior empirically. This file is the canonical reference.

**Source of truth (read these to verify or extend):**
- `tools/learning-loop-mastra/schema-parity.js` — the shim
- `tools/learning-loop-mastra/create-loop-tool.js` — the factory that applies the shim
- `tools/learning-loop-mastra/server.js` — the canonical MCP server entry
- `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js` — regression net for the shim
- `plans/reports/scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md` — full empirical evidence

---

## TL;DR

The MCP server exposes tools to clients via `tools/list`. Each tool's `inputSchema` is converted from a Zod schema to JSON Schema. The conversion goes through **Mastra SDK 1.42.0's `MCPServer.convertSchema`**, which delegates to `@mastra/schema-compat`'s `standardSchemaToJSONSchema`. **This path does NOT reliably honor the `_zod.toJSONSchema` override** that `create-loop-tool.js:38` sets. The shim's job is to recover byte-identical JSON Schema for migration use cases where `z.preprocess` / `z.union([bool, string]).transform` would otherwise change the shape.

---

## 1. The Flow (zod schema → MCP client)

```
┌─────────────────────────────┐
│ tools/learning-loop-mcp/    │  22 tool inputSchemas
│ tools/*.js (per-tool file)  │  e.g. z.preprocess(stripEnvelope, z.array(...))
└──────────────┬──────────────┘  .default([])
               │  re-exported via #mcp/* import map
               v
┌─────────────────────────────┐
│ tools/learning-loop-mastra/ │
│ server.js                   │  for each tool in MANIFEST:
│                             │    tools[prefix] = createLoopTool({inputSchema, ...})
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ create-loop-tool.js         │  Step 1: normalizeInputSchema (wrap plain shape in z.object)
│                             │  Step 2: attachParityJSONSchema
│                             │    - buildParitySchema(schema) → paritySchema
│                             │    - z.toJSONSchema(paritySchema) → parityJSON
│                             │    - schema._zod.toJSONSchema = () => parityJSON  ← OVERRIDE
│                             │  Step 3: return createTool({inputSchema: schema, ...})
└──────────────┬──────────────┘
               │  tools registered with MCPServer
               v
┌─────────────────────────────┐
│ @mastra/mcp MCPServer       │  On tools/list request:
│ (node_modules)               │    for each tool:
│                             │      convertSchema(tool.parameters)
│                             │        → standardSchemaToJSONSchema(schema, {io:"input"})
└──────────────┬──────────────┘
               │  The path: see §3
               v
┌─────────────────────────────┐
│ @mastra/schema-compat       │  standardSchemaToJSONSchema:
│ chunk-H72LBCXW.js           │    const jsonSchemaFn = schema["~standard"].jsonSchema.input
│                             │    return jsonSchemaFn({target, libraryOptions:{override}})
└──────────────┬──────────────┘
               │  zod's built-in ~standard.jsonSchema.input
               v
┌─────────────────────────────┐
│ zod 4.4.3                   │  createStandardJSONSchemaMethod(schema, "input")
│ v4/core/to-json-schema.js   │    → process(schema, ctx)  ← checks _zod.toJSONSchema?.() at L49
│                             │    → finalize(ctx, schema)
└──────────────┬──────────────┘
               │  returns JSON Schema
               v
        MCP client receives inputSchema
```

---

## 2. The shim: `schema-parity.js`

**File:** `tools/learning-loop-mastra/schema-parity.js` (125 lines)

**Purpose:** Recursively unwrap zod wrappers that the migration introduced (`z.preprocess`, `z.union([bool, string]).transform(...)`) and rebuild them in a way that produces byte-identical JSON Schema to the pre-migration baseline.

### 2.1 Zod 4.4.3 internal APIs the shim touches

| API | Used at | Purpose | Stability |
|-----|---------|---------|-----------|
| `schema._zod` | lines 16, 20, 27, 28, ... | Universal internal handle on every zod v4 schema | Stable in 4.x |
| `schema._zod.def.type` | 14 branches | Discriminator: `"string"`, `"array"`, `"object"`, `"pipe"`, `"optional"`, `"default"`, `"union"`, `"tuple"`, `"record"`, `"nullable"`, `"discriminatedUnion"` | Stable in 4.x; if zod renames any string, shim falls through to passthrough |
| `schema._zod.def.shape` | line 64 | Object's field map | Stable for `type:"object"` |
| `schema._zod.def.catchall` | line 68 | Object's catchall (ZodNever = `.strict()`, ZodUnknown = passthrough) | Stable |
| `schema._zod.def.element` | line 55 | Array's element schema | Stable for `type:"array"` |
| `schema._zod.def.options` | lines 32, 96, 100 | Union's options array | Stable for `type:"union"`/`"pipe"` |
| `schema._zod.def.innerType` | lines 40, 45, 51 | Inner schema for optional/default/nullable | Stable |
| `schema._zod.def.defaultValue` | line 45 | Default value (function or static) | Stable for `type:"default"` |
| `schema._zod.def.keyType` / `def.valueType` | line 81 | Record's key + value schemas | Stable for `type:"record"` |
| `schema._zod.def.discriminator` | line 88 | Discriminator key for `discriminatedUnion` | Stable |
| `schema._zod.def.items` / `def.rest` | line 104-105 | Tuple items + rest | Stable for `type:"tuple"` |
| `schema._zod.def.in` / `def.out` | lines 27, 28, 36 | Pipe's input/output schemas (used for `z.preprocess` and `z.union().transform()`) | Stable for `type:"pipe"` |
| `schema._zod.bag` | lines 56-58 | Object with array min/max (read for length constraints) | Stable for arrays |
| `globalRegistry` | line 120 | Public API; `.get(schema)?.description` to preserve `.describe()` | Stable — public |
| `schema._zod.toJSONSchema` (assignment) | `create-loop-tool.js:38` | **WRITES** an override function; zod's own `process` checks it at `node_modules/zod/v4/core/to-json-schema.js:49` | Mechanism works in 4.4.3; see §3 caveat |

### 2.2 Shim branches (migration wrappers → parity view)

| Input | Branch | Output |
|-------|--------|--------|
| `z.preprocess(stripEnvelope, z.array(...))` | `type:"pipe"` recursion (line 26-37) → unwraps to inner | `z.array(...)` (envelope stripper is a parse-time wrapper, not a type) |
| `z.preprocess(stripEnvelope, z.array(...)).default([])` | pipe → default → `z.array(...).default([])` | `z.array(...).default([])` (recovers `default:[]`) |
| `z.union([z.boolean(), z.string()]).transform(guard).optional().default(false)` | pipe where `out` is transform and `in` is union → collapses to `z.boolean()` (line 30-35) | `z.boolean().optional().default(false)` (recovers `type:"boolean"` instead of `anyOf`) |
| Plain `z.object({...})` | recursive build with shape + catchall handling (line 62-77) | `z.object({...})` with `.strict()` if catchall is ZodNever, otherwise `.catchall(...)` |
| `z.discriminatedUnion("k", [...])` | rebuild (line 86-94) | `z.discriminatedUnion("k", [...].map(buildParitySchema))` |
| `z.tuple([...])` | rebuild (line 103-107) | `z.tuple([...].map(buildParitySchema))` |
| Primitives, literals, enums | passthrough (line 110) | unchanged |

### 2.3 Migration case coverage (verified empirically)

| Migration use case | zod 4.4.3 baseline (pre-migration) | zod 4.4.3 wrapped (post-migration, no shim) | After shim |
|-------------------|------------------------------------|--------------------------------------------|-----------|
| `z.array(z.string())` | `{type:"array",items:{type:"string"}}` | identical | identical (trivial case, no shim needed) |
| `z.array(z.string()).default([])` | `{default:[],type:"array",items:{type:"string"}}` | **diverges** — `default` lost | **recovered** (line 43-48) |
| `z.array(z.string()).optional()` | `{type:"array",items:{type:"string"}}` | identical (plan's "FAILS" claim was overstated) | identical (passthrough) |
| `z.union([bool,string]).transform(guard).optional().default(false)` | `{default:false,type:"boolean"}` | **diverges** — `anyOf` instead of `type:"boolean"` | **recovered** (line 30-35 pipe collapse) |
| Nested `z.object({x: z.preprocess(stripEnvelope, z.array(...)).optional()})` | baseline | wraps in preprocess | **recovered** via recursive object rebuild (line 62-77) |

### 2.4 What the shim does NOT do (YAGNI)

- It does NOT add an `additionalProperties: false` constraint.
- It does NOT preserve `.refine()` / `.superRefine()` validations (passthrough drops them).
- It does NOT handle `z.lazy()` (passthrough).
- It does NOT preserve `.transform()` chains (only the boolean guard pipe collapse).

If a future migration needs any of these, extend `buildParitySchema` and add a parity test in `coerce-correctness.test.js`.

---

## 3. The override mechanism: `schema._zod.toJSONSchema`

### 3.1 What the override does

In `create-loop-tool.js:29-40`:
```js
function attachParityJSONSchema(schema) {
  const paritySchema = buildParitySchema(schema);
  const parityJSONSchema = z.toJSONSchema(paritySchema, {
    target: "draft-7",
    io: "input",
  });
  // Zod's `process` checks `schema._zod.toJSONSchema?.()` before invoking the
  // type-specific processor, so overriding it lets us return the unwrapped
  // JSON Schema while still using the wrapped schema for parsing.
  schema._zod.toJSONSchema = () => parityJSONSchema;
  return schema;
}
```

The comment at lines 35-37 is **partially correct**:
- ✅ TRUE: zod's `process` function at `node_modules/zod/v4/core/to-json-schema.js:49` does check `schema._zod.toJSONSchema?.()` and uses its return value as the result.
- ⚠️ INACCURATE: "overriding it lets us return the unwrapped JSON Schema" — this only works for some call paths. See §3.3.

### 3.2 zod 4.4.3 `process` function (verbatim)

`node_modules/zod/v4/core/to-json-schema.js:31-69`:
```js
export function process(schema, ctx, _params = { path: [], schemaPath: [] }) {
    // ... cycle detection ...
    const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
    ctx.seen.set(schema, result);
    // custom method overrides default behavior
    const overrideSchema = schema._zod.toJSONSchema?.();
    if (overrideSchema) {
        result.schema = overrideSchema;
    } else {
        // ... fall through to per-type processor ...
    }
    // ... continue ...
}
```

When the override is set, `result.schema` is the pre-computed parity JSON. Then `finalize` at line 320 does `Object.assign(result, root.def ?? root.schema)` to build the final output.

### 3.3 Empirical behavior of the override (zod 4.4.3)

Tested at `/tmp/probe-q3-clean.cjs` (now removed; results inlined below):

| Path | Override used? | Output |
|------|----------------|--------|
| `z.toJSONSchema(s, {target:"draft-7", io:"input"})` direct | ❌ NO | `{"$schema":"...","$ref":"#"}` |
| `s["~standard"].jsonSchema.input({target:"draft-07", libraryOptions:{}})` (simple object) | ✅ YES | override result |
| `s["~standard"].jsonSchema.input(...)` (nested object) | ❌ NO | `{"$schema":"...","$ref":"#"}` |
| `standardSchemaToJSONSchema(s, {io:"input"})` (Mastra's actual call) | ❌ NO | `{"$schema":"...","$ref":"#"}` |

**Pattern:** the override is honored by zod's `process` for SIMPLE schemas, but routes through `finalize`'s def-extraction logic for NESTED schemas — and ends up as a self-reference `{"$ref":"#"}` because the override result is treated as a reusable def.

### 3.4 What this means for the MCP server

`MCPServer.convertSchema` (`@mastra/mcp/dist/index.js:4403-4408`):
```js
convertSchema(schema) {
  if (isStandardSchemaWithJSON(schema)) {
    return standardSchemaToJSONSchema(schema);
  }
  return schema?.jsonSchema || schema;
}
```

`isStandardSchemaWithJSON` returns `true` for raw zod schemas (verified — zod's `~standard` includes a lazy `jsonSchema.input` reference). So `standardSchemaToJSONSchema` is called.

`standardSchemaToJSONSchema` calls `schema["~standard"].jsonSchema.input(...)` — which empirically returns `{"$ref":"#"}` for the migration's nested object schemas (the 22 inputSchemas are all objects).

**Therefore:** the override is **bypassed** in the actual production code path.

### 3.5 Open question: does this actually break MCP clients?

The test suite passes (1063/0/1 per PR#5). Either:
- (a) MCP clients tolerate `{"$ref":"#"}` somehow
- (b) Some other code path intercepts before `convertSchema` is called
- (c) The bug is real but masked by something
- (d) The 22 inputSchemas happen to be simple enough to avoid the nested-object bug

The PR#5 description claims "5/5 end-to-end JSON Schema parity spot checks pass" — no matching test was found in the codebase (`grep -rn "spot check\|end-to-end" tools/` returns nothing). This claim is **unverified**.

**The existing `coerce-correctness.test.js` tests only exercise `z.toJSONSchema` directly** (lines 94-103), not the MCP server path. They do NOT catch the bypass.

### 3.6 What to do if the bug is real

Options to consider (do not apply without a plan):
1. **Wrap with `jsonSchema()` helper** (from `@mastra/core/utils`) — `MCPServer.convertSchema` checks for `"jsonSchema" in inputSchema` and uses it directly. This short-circuits `standardSchemaToJSONSchema` and uses the parity view verbatim.
2. **Wrap with `toStandardSchema(schema)`** from `@mastra/schema-compat` — this adds a new `~standard` interface that calls `convertToJsonSchema` → `toJSONSchema` from `zod/v4`, which DOES honor the override (verified empirically for nested objects via this path).
3. **Pin zod to a version where the override works correctly** for all paths.
4. **Write a true e2e test first** using the existing `with-mcp-server.js` helper at `tools/learning-loop-mastra/__tests__/with-mcp-server.js` and `mcp-protocol-e2e.test.cjs`. This is the missing piece — without it, the production behavior is unknown.

---

## 4. SP2 fingerprint scope

The meta-state entry `meta-260618T0557Z-tools-learning-loop-mastra-create-loop-tool-js` records a fingerprint on `create-loop-tool.js`. The shim file `schema-parity.js` is **NOT** in the SP2 fingerprint registry.

**Implication:** if zod renames a `_zod.def.type` string, `schema-parity.js` may silently change behavior (passthrough branch at line 110) without SP2 detecting the drift. The 7 parity tests in `coerce-correctness.test.js` are the de facto regression net — they will fail loudly.

**Recommendation:** add `schema-parity.js` to the SP2 fingerprint registry (via `meta_state_log_change` with `evidence_code_ref: "tools/learning-loop-mastra/schema-parity.js"`).

---

## 5. Zod upgrade risk

The shim uses zod internal APIs that are not contract-stable. A zod minor version bump (4.4.x → 4.5.x → 4.6.x) could break the shim.

| Upgrade risk | Likelihood | Impact | Mitigation |
|--------------|------------|--------|-----------|
| `_zod.def.type` string rename | Low (semver contract) | High — shim falls through to passthrough, parity breaks | `coerce-correctness.test.js` catches it |
| `_zod.bag` property rename | Low | Medium — array length constraints lost in JSON Schema | Same |
| `globalRegistry` API change | Very Low (public API) | Low — `.describe()` metadata lost in parity view | Same |
| `schema._zod.toJSONSchema` mechanism change | Low (it's the override path) | High — see §3 | Same |
| zod 4 → zod 5 major bump | Medium (announced) | Catastrophic — all internals may change | Pin to 4.4.x; re-test shim before upgrading |

**Recommendation:** pin zod to `4.4.x` in `package.json` and re-run `pnpm test` on every zod minor upgrade.

---

## 6. Cached reference (zod 4.4.3 internals)

This section is the "what's inside node_modules" view, cached locally so future agents don't need to re-read the source.

### 6.1 zod's `~standard` interface (the entry point)

`node_modules/zod/v4/core/schemas.js:117-130`:
```js
util.defineLazy(inst, "~standard", () => ({
    validate: (value) => { ... },
    vendor: "zod",
    version: 1,
}));
```

Zod's `~standard.jsonSchema.input` is added via a separate lazy init (zod adds it before `defineLazy` fires for jsonSchema access). It points to `createStandardJSONSchemaMethod` from `to-json-schema.js:442-448`:
```js
export const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
    const { libraryOptions, target } = params ?? {};
    const ctx = initializeContext({ ...(libraryOptions ?? {}), target, io, processors });
    process(schema, ctx);
    extractDefs(ctx, schema);
    return finalize(ctx, schema);
};
```

### 6.2 `@mastra/schema-compat` wrapper

`node_modules/.pnpm/@mastra+schema-compat@*/node_modules/@mastra/schema-compat/dist/chunk-H72LBCXW.js:25-46`:
```js
function toStandardSchema4(zodSchema, adapterOptions = {}) {
  const wrapper = Object.create(zodSchema);  // prototype-inherits
  const jsonSchemaConverter = {
    input: (options) => convertToJsonSchema(zodSchema, options, adapterOptions),
    output: (options) => convertToJsonSchema(zodSchema, options, adapterOptions),
  };
  Object.defineProperty(wrapper, "~standard", {
    value: { ...existingStandard, jsonSchema: jsonSchemaConverter },
    // ...
  });
  return wrapper;
}
```

This wrapper adds a new `~standard` that goes through `convertToJsonSchema` → `toJSONSchema` (the same as `z.toJSONSchema`). The override would propagate through this path IF the schema is wrapped.

### 6.3 `MCPServer.convertSchema` and the ListToolsRequestSchema handler

`node_modules/.pnpm/@mastra+mcp@1.10.0_*/node_modules/@mastra/mcp/dist/index.js:4403-4408`:
```js
convertSchema(schema) {
  if (isStandardSchemaWithJSON(schema)) {
    return standardSchemaToJSONSchema(schema);
  }
  return schema?.jsonSchema || schema;
}
```

Same file, `registerHandlersOnServer` (line 3143-3174):
```js
serverInstance.setRequestHandler(ListToolsRequestSchema, async (_request, extra) => {
  // ...
  return {
    tools: tools.map(([, tool]) => {
      const toolSpec = {
        name: tool.id || "unknown",
        description: tool.description,
        inputSchema: this.convertSchema(tool.parameters)  // ← HERE
      };
      // ...
    })
  };
});
```

`tool.parameters` is the raw zod schema (from `CoreToolBuilder.getParameters` at `chunk-KPO4UZVN.cjs:177-185`):
```js
let schema = this.originalTool.inputSchema;
if (chunkXB4FLS7A_cjs.isStandardSchemaWithJSON(schema)) {
  return schema;  // passthrough for zod schemas
}
```

So the path is: `zod schema → convertSchema → standardSchemaToJSONSchema → ~standard.jsonSchema.input → createStandardJSONSchemaMethod → process (override check) + finalize`.

### 6.4 zod 4.4.3 processor map (full list)

For the curious, all `def.type` values that zod 4.4.3 can produce (relevant to the shim):
- `"string"`, `"number"`, `"boolean"`, `"bigint"`, `"symbol"`, `"null"`, `"undefined"`, `"void"`, `"never"`, `"any"`, `"unknown"`, `"date"`, `"enum"`, `"literal"`, `"nan"`, `"templateLiteral"`, `"file"`, `"success"`, `"custom"`, `"function"`, `"array"`, `"object"`, `"tuple"`, `"record"`, `"map"`, `"set"`, `"promise"`, `"lazy"`, `"optional"`, `"nonoptional"`, `"nullable"`, `"default"`, `"catch"`, `"pipe"`, `"readonly"`, `"transform"`, `"union"`, `"discriminatedUnion"`, `"intersection"`, `"brand"`

The shim handles: `pipe`, `optional`, `default`, `nullable`, `array`, `object`, `record`, `discriminatedUnion`, `union`, `tuple` (lines 26-107). All others passthrough at line 110.

---

## 7. File:line index

| File | What it does |
|------|--------------|
| `tools/learning-loop-mastra/schema-parity.js:15-125` | `buildParitySchema` — the shim |
| `tools/learning-loop-mastra/create-loop-tool.js:17-50` | `normalizeInputSchema` + `attachParityJSONSchema` + `createLoopTool` |
| `tools/learning-loop-mastra/create-loop-tool.js:38` | The `_zod.toJSONSchema` override assignment |
| `tools/learning-loop-mastra/create-loop-tool.js:35-37` | The partially-correct comment about the override mechanism |
| `tools/learning-loop-mastra/server.js:13-43` | Manifest loop, tool registration, `MCPServer.startStdio()` |
| `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:89-189` | 7 parity tests that lock the shim's behavior |
| `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:94-103` | `assertParityMatchesBaseline` — tests `z.toJSONSchema` directly, NOT the MCP path |
| `tools/learning-loop-mastra/__tests__/with-mcp-server.js` | Helper for spawning the actual server via stdio |
| `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` | Existing e2e pattern (could be extended for tools/list parity) |
| `tools/learning-loop-mcp/core/envelope-stripper.js` | `stripEnvelope` — undefined-safe envelope stripper used in 17 inputSchemas |
| `tools/learning-loop-mcp/core/strict-boolean-guard.js` | `strictBooleanGuard` — the 6-field boolean guard |
| `node_modules/zod/v4/core/to-json-schema.js:49` | The override check `const overrideSchema = schema._zod.toJSONSchema?.()` |
| `node_modules/zod/v4/core/to-json-schema.js:442-448` | `createStandardJSONSchemaMethod` |
| `node_modules/.pnpm/@mastra+mcp@1.10.0_*/node_modules/@mastra/mcp/dist/index.js:4403-4408` | `MCPServer.convertSchema` |
| `node_modules/.pnpm/@mastra+mcp@1.10.0_*/node_modules/@mastra/mcp/dist/index.js:3143-3174` | `ListToolsRequestSchema` handler |
| `node_modules/.pnpm/@mastra+schema-compat@*/node_modules/@mastra/schema-compat/dist/chunk-H72LBCXW.js:149-161` | `standardSchemaToJSONSchema` |

---

## 8. Recommendations (in priority order)

| # | Action | Owner | Blocked by |
|---|--------|-------|------------|
| 1 | **Write a true e2e test** that spawns the MCP server via stdio, sends `tools/list`, and asserts each migrated tool's `inputSchema` is a real JSON Schema (not `{"$ref":"#"}`). Use the existing `with-mcp-server.js` helper. | any agent | none — needs a plan |
| 2 | If bug is real, **fix the shim** via one of: (a) wrap with `jsonSchema()` helper, (b) wrap with `toStandardSchema`, (c) pin zod. | any agent | (1) — must confirm bug first |
| 3 | **Fix the comment** at `create-loop-tool.js:35-37` to accurately describe the override's path-dependent behavior in zod 4.4.3. | any agent | none |
| 4 | **Add `schema-parity.js` to SP2 fingerprint registry** via `meta_state_log_change` with `evidence_code_ref: "tools/learning-loop-mastra/schema-parity.js"`. | any agent | none |
| 5 | **Pin zod to `4.4.x`** in `package.json` and document the upgrade procedure. | any agent | none |
| 6 | **Restore or remove** the missing `research-260618-0031-zod-impact-analysis.md` reference in `plan.md:11`. | any agent | none |
| 7 | **Fix the plan's `.optional()` overstatement** at `phase-01-schema-migration.md:123-126` (`.optional()` is actually identical in zod 4.4.3). | any agent | none |
