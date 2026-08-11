# MCP Tool Schema Architecture — Zod + Mastra SDK Integration

**Audience:** Engineers and agents debugging or extending tool inputSchemas in the `learning-loop-mastra` MCP server. Replaces the need to read `node_modules/@mastra/{core,mcp,schema-compat}/dist/*.js` and `node_modules/zod/v4/core/*.js`.

**Why this doc exists:** the coerce-layer zod-native migration introduced a 125-line `schema-parity.js` shim that has a non-obvious interaction with the Mastra SDK and zod 4.4.3 internal APIs. Without this doc, future agents have to re-discover the shim's behavior empirically. This file is the canonical reference. (The shim lives in `core/` — a pure zod transform, imported by the shell's tool/workflow factories and the CLI's context-savings path.)

**Transport scope:** this doc describes the **MCP transport's** schema-conversion path (`tools/list` → JSON Schema). The stateless CLI (`tools/learning-loop-mastra/bin/loop.mjs`) calls handlers directly and **bypasses** `MCPServer.convertSchema` and the shim, so the shim only affects the MCP residue surface (8 tools); the 42-tool CLI surface is unaffected.

**Source of truth (read these to verify or extend):**
- `tools/learning-loop-mastra/core/schema-parity.js` — the shim
- `tools/learning-loop-mastra/mastra/create-loop-tool.js` — the factory that applies the shim
- `tools/learning-loop-mastra/mastra/server.js` — the canonical MCP server entry
- `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js` — regression net for the shim

---

## TL;DR

The MCP server exposes tools to clients via `tools/list`. Each tool's `inputSchema` is converted from a Zod schema to JSON Schema. The conversion goes through **Mastra SDK 1.42.0's `MCPServer.convertSchema`**, which delegates to `@mastra/schema-compat`'s `standardSchemaToJSONSchema`. This path **honors** the `_zod.toJSONSchema` override that `create-loop-tool.js:60` sets (verified by live e2e; see §3.5). The shim's job is to recover byte-identical JSON Schema for migration use cases where `z.preprocess` / `z.union([bool, string]).transform` would otherwise change the shape. (This affects the MCP surface only — the CLI transport bypasses this path; see Transport scope above.)

---

## 1. The Flow (zod schema → MCP client)

```
┌─────────────────────────────┐
│ tools/learning-loop-mastra/ │  22 tool inputSchemas
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

**File:** `tools/learning-loop-mastra/core/schema-parity.js` (125 lines)

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
| `schema._zod.toJSONSchema` (assignment) | `create-loop-tool.js:60` | **WRITES** an override function returning a clone; zod's own `process` checks it at `node_modules/zod/v4/core/to-json-schema.js:49` | Mechanism works in 4.4.3; see §3 |

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

In `create-loop-tool.js:23-62`:
```js
function attachParityJSONSchema(schema, parityHints) {
  const paritySchema = buildParitySchema(schema);
  const parityJSONSchema = z.toJSONSchema(paritySchema, {
    target: "draft-7",
    io: "input",
  });
  // Inject model-visible JSON-schema hints (draft-7 constraints like
  // minProperties) on top of the parity view. Generation-only: this never
  // affects .parse() — the override is on the converted JSON schema object,
  // while runtime validation uses the real Zod schema. Deep-merges per-field
  // so existing property constraints are preserved.
  if (parityHints && typeof parityHints === "object") {
    for (const [field, hint] of Object.entries(parityHints)) {
      const propSchema = parityJSONSchema?.properties?.[field];
      if (!propSchema || !hint || typeof hint !== "object") continue;
      Object.assign(propSchema, hint);
    }
  }
  // Override zod's per-schema JSON Schema generator so the schema exposed to
  // MCP clients via `tools/list` is the parity view. zod's `process` in
  // node_modules/zod/v4/core/to-json-schema.js:49 checks
  // `schema._zod.toJSONSchema?.()` and uses its return value. The override IS
  // honored through Mastra's MCPServer.convertSchema → standardSchemaToJSONSchema
  // path (verified empirically; e2e guard in mcp-tools-list-parity.test.js).
  //
  // IMPORTANT: return a clone on every call. Mastra converts tools more than
  // once (MCPServer constructor + __registerMastra), and zod's toJSONSchema
  // mutates the returned object in place (extractDefs replaces the root schema
  // with {"$ref":"#"}). Reusing the same object causes the second conversion
  // to emit only the $ref sentinel.
  schema._zod.toJSONSchema = () => JSON.parse(JSON.stringify(parityJSONSchema));
  return schema;
}
```

The override does two things:

1. **Parity view** — it returns the unwrapped JSON Schema (`buildParitySchema` strips `z.preprocess` / guarded-boolean unions) so `tools/list` exposes the pre-migration shape while `.parse()` stays strict. `parityHints` deep-merges draft-7 constraints (e.g. `minProperties`) onto the parity view — generation-only, never affecting `.parse()`.
2. **Clone on every call** — `() => JSON.parse(JSON.stringify(parityJSONSchema))`, not `() => parityJSONSchema`. zod's `toJSONSchema` mutates the returned object in place (`extractDefs` replaces the root schema with `{"$ref":"#"}`), and Mastra converts each tool more than once (`MCPServer` constructor + `__registerMastra`). Returning the same object makes the second conversion emit only the `$ref` sentinel. The clone is the fix — and the diagnosis of the synthetic-probe `$ref` quirk in §3.3/§3.5 (the probe reused the object; production clones).

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

**Pattern (synthetic probe, now explained):** the probe returned `{"$ref":"#"}` for nested schemas. This is not a nested-vs-simple routing difference — it is the mutation-in-place diagnosed in §3.1: the probe reused the same object across calls, and zod's `extractDefs` replaces the root schema with `{"$ref":"#"}` once it has been through a conversion, so the next call emitted only the sentinel. Production clones on every call and never hits it (see §3.5).

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

### 3.5 Override-bypass concern: refuted by live e2e

The concern that the `_zod.toJSONSchema` override is bypassed in production
was investigated empirically. A live e2e probe spawns the actual
MCP server, sends `tools/list`, and inspects every MCP-registered tool's
inputSchema. Result: all return real JSON Schemas
(`type:"object"` with proper `properties` map). The override DOES propagate
through `MCPServer.convertSchema` → `standardSchemaToJSONSchema` →
`schema["~standard"].jsonSchema.input` → `process` + `finalize`.
(The MCP-registered set is the residue — the
CLI surface is not on this path.)

**Known caveat (not blocking):** the synthetic probe at
`/tmp/probe-q3-clean.cjs` returns `{"$ref":"#"}` for synthetic nested schemas.
The cause is now known (see §3.1): zod's `toJSONSchema` mutates the returned
object in place — `extractDefs` replaces the root schema with `{"$ref":"#"}` —
so reusing the same object across Mastra's multiple conversions makes the
second conversion emit only the `$ref` sentinel. The production override
returns a clone on every call (`JSON.parse(JSON.stringify(parityJSONSchema))`),
so it never hits the mutation; the synthetic probe reused the object and did.

**Bottom line:** the shim works in production. No refactor needed. The e2e
test in `mcp-tools-list-parity.test.js` is a regression guard against future
shim/SDK changes; it will fail loudly if the `$ref` sentinel ever
re-manifests in production.

### 3.6 Fallback strategies (not pursued — the bug is not real)

The synthetic-probe bypass is refuted for all MCP-surfaced production tools
(verified by live e2e). The strategies below are not pursued. If a future
zod 4.4.x patch or Mastra SDK upgrade re-manifests the synthetic-probe quirk
in production, the e2e regression test
(`tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js`) will
fail loudly. These remain valid fallbacks for that hypothetical future:

- Strategy A: Wrap with Vercel-shape `{ _type: "function", jsonSchema: parity }` — incompatible with `createTool` (which expects zod), but documents the short-circuit path
- Strategy B: Wrap with `toStandardSchema()` from `@mastra/schema-compat` — would be a no-op refactor
- Strategy C: Pin zod to 4.4.x — already in effect (`package.json:48`)

---

## 4. Grounding fingerprint scope

A meta-state entry records a fingerprint on `create-loop-tool.js`. The shim file `schema-parity.js` is **NOT** in the grounding fingerprint registry.

**Implication:** if zod renames a `_zod.def.type` string, `schema-parity.js` may silently change behavior (passthrough branch at line 110) without the grounding check detecting the drift. The 7 parity tests in `coerce-correctness.test.js` are the de facto regression net — they will fail loudly.

**Recommendation:** add `schema-parity.js` to the grounding fingerprint registry (via `meta_state_log_change` with `evidence_code_ref: "tools/learning-loop-mastra/core/schema-parity.js"`).

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
| `tools/learning-loop-mastra/core/schema-parity.js:15-125` | `buildParitySchema` — the shim |
| `tools/learning-loop-mastra/core/schema-normalize.js:18` | `normalizeInputSchema` (moved out of create-loop-tool.js so transport-agnostic consumers — the read-only CLI — can reuse it without importing `@mastra/core`) |
| `tools/learning-loop-mastra/mastra/create-loop-tool.js:23-62` | `attachParityJSONSchema` — parity view + `parityHints` deep-merge + clone-on-return override |
| `tools/learning-loop-mastra/mastra/create-loop-tool.js:60` | The `_zod.toJSONSchema` override assignment (returns a clone) |
| `tools/learning-loop-mastra/mastra/create-loop-tool.js:64-76` | `createLoopTool` — the factory that applies the shim + the R2 write-gate |
| `tools/learning-loop-mastra/mastra/server.js:13-43` | Manifest loop, tool registration, `MCPServer.startStdio()` |
| `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:89-189` | 7 parity tests that lock the shim's behavior |
| `tools/learning-loop-mastra/__tests__/coerce-correctness.test.js:94-103` | `assertParityMatchesBaseline` — tests `z.toJSONSchema` directly, NOT the MCP path |
| `tools/learning-loop-mastra/__tests__/with-mcp-server.js` | Helper for spawning the actual server via stdio |
| `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` | Existing e2e pattern (could be extended for tools/list parity) |
| `tools/learning-loop-mastra/core/envelope-stripper.js` | `stripEnvelope` — undefined-safe envelope stripper used in 17 inputSchemas |
| `tools/learning-loop-mastra/core/strict-boolean-guard.js` | `strictBooleanGuard` — the 6-field boolean guard |
| `node_modules/zod/v4/core/to-json-schema.js:49` | The override check `const overrideSchema = schema._zod.toJSONSchema?.()` |
| `node_modules/zod/v4/core/to-json-schema.js:442-448` | `createStandardJSONSchemaMethod` |
| `node_modules/.pnpm/@mastra+mcp@1.10.0_*/node_modules/@mastra/mcp/dist/index.js:4403-4408` | `MCPServer.convertSchema` |
| `node_modules/.pnpm/@mastra+mcp@1.10.0_*/node_modules/@mastra/mcp/dist/index.js:3143-3174` | `ListToolsRequestSchema` handler |
| `node_modules/.pnpm/@mastra+schema-compat@*/node_modules/@mastra/schema-compat/dist/chunk-H72LBCXW.js:149-161` | `standardSchemaToJSONSchema` |

---

## 8. JIT branch contracts + shared field glossary

A prior phase slimmed the `tools/list` manifest-tool wire by moving the **branch-union tool schemas** off the wire and onto **at-invocation error payloads** (JIT). Per-tool invocation contracts are never trimmed; only the *location* of the branch schema moves.

### 8.1 What moved off-wire

- **`meta_state_patch`** — the `patch` argument is now a free-form `z.preprocess(deepStripEnvelope, z.record(z.string(), z.unknown()))` with a parity `minProperties: 1` constraint, NOT the per-kind `buildPatchSchemaFor(kind).strict()` union. The four per-kind branch schemas (`finding`/`change-log`/`rule`/`loop-design`) are no longer serialized into `tools/list`; they ride `invalid_field` / `empty_patch` error payloads instead. Call sites: `meta-state-patch-tool.js` (`invalid_field` payload built from `buildPatchSchemaPayload(entry_kind)`; `empty_patch` payload when the effective patch has no mutable field after stripping identity/CAS fields).
- **`meta_state_batch`** — same pattern via `buildInvalidFieldResult` in `meta-state-batch-tool.js`.
- **`meta_state_report`** — input schema narrowed to the user-settable `REPORT_FIELDS` subset (immutable/server-set fields like `id`, `created_at`, `status`, `entry_kind` are no longer accepted inputs; the handler never read them). Each field's `.describe()` points at the glossary: `See field_glossary.<field>`.

### 8.2 The identity invariant is preserved

Relocating the branch schema does NOT relax the identity invariant. `entry_kind` inside a patch is denied at the handler as `{patched:false, reason:"immutable_field", denied_fields:["entry_kind"]}` (deep strip in `core/meta-state.js` + the `IMMUTABLE_PATCH_FIELDS` set) — the registry's `entry_kind` cannot flip via a patch. The rejection *mechanism* moved from a Zod `.strict()` throw at the MCP boundary to a handler-level `immutable_field` return; the registry-state invariant is unchanged.

### 8.3 Shared field glossary

`core/field-glossary.js` is the single source of truth for meta-state field definitions (role: `primitive` — no imports, pure data + lookup). It is served two ways:

- **`loop_describe` cold tier** — the glossary is appended post-cache-read (a static glossary does not change the cold-tier cache's 3-SHA key, so a stale hit still returns the glossary; see the red-team review note on this point).
- **JIT error payloads** — `invalid_field` / `empty_patch` payloads embed `patch_schema` (the branch schema) so a caller can correct and retry without a separate lookup.

A reader can derive the error-payload contract from this section: send a free-form patch → on a wrong-branch field, receive `invalid_field` + `patch_schema` for the declared `entry_kind`; on an empty effective patch, receive `empty_patch` + `patch_schema`. The `_zod.toJSONSchema` root-sentinel warning from §3 still applies to whatever branch schema is serialized into the payload.
