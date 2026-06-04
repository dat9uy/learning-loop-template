---
date: "2026-06-03T22:00:00Z"
status: agreed
tags: [research, zod, json-schema, description, passthrough, additionalProperties, fifth-bridge, field-coverage, approach-2]
related:
  - plans/reports/research-260603-1600-json-schema-to-zod-libraries.md (the original libraries research; recommended `z.fromJSONSchema()`)
  - plans/reports/brainstorm-260603-field-coverage.md (the field-coverage report; Approach 2 = schema-derived zod tool schemas)
  - tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js (the viability spike; did NOT test descriptions)
  - tools/learning-loop-mcp/tools/create-experiment-record-tool.js (canonical hand-written `.describe(...)` example)
  - schemas/*.schema.json (the 7 active record schemas; currently have NO `description` fields)
---

# Research: Zod 4 `z.fromJSONSchema()` — Description Passthrough and `additionalProperties` Behavior

> **Question:** Does zod 4.4.3's `z.fromJSONSchema()` carry the JSON Schema `description` field through to `.describe()` on the resulting zod schema? If not, is the sidecar `schemas/tool-descriptions.yaml` (proposed in the field-coverage report) actually required?
>
> **Bonus question:** Does `z.fromJSONSchema()` set `additionalProperties` correctly when the JSON Schema omits the field (our 7 active schemas all omit it)?
>
> **Headline answer:** **Partially yes, but with a major caveat for optional fields.** `z.fromJSONSchema()` does call `.describe()` on every schema node that has a JSON Schema `description`, and the description is correctly reachable on required fields and on the root schema. **However, on optional fields, `.describe()` is called on the inner type, then the inner type is wrapped in `.optional()` — which returns a NEW schema instance with NO metadata link to the inner type. The description is therefore NOT reachable via `.description` on the optional wrapper, even though it exists on the underlying ZodString via `_zod.def.innerType.description`.** This is a general Zod 4 design (confirmed in the official docs) and not a bug in `z.fromJSONSchema()`. **Implication:** the sidecar `schemas/tool-descriptions.yaml` is **still recommended** for the 7 active schemas, because (a) the schemas currently have NO `description` fields on their properties (so there is nothing to carry), and (b) even if descriptions were added, optional-field descriptions would be invisible to the consumer of `.shape.<field>.description`. The 30-line-wrapper approach from the libraries research can be salvaged, but only if the field-coverage plan adds a post-pass that re-applies `.describe()` on the optional wrappers (or after `.parse()` on the wrapper). On `additionalProperties`: the converter maps `additionalProperties: false` → `.strict()`, schema object → `.catchall(...)`, and undefined/`true` → `.passthrough()`. **Our schemas omit the field, so the converter produces a passthrough object — extras are silently allowed.** This is more permissive than the hand-written tools today (which use `z.object({...})` default strip behavior). See "Recommendation" for the action.

## Research Methodology

- **Sources consulted:** 4 — zod 4.4.3 source at `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/from-json-schema.js`, zod 4.4.3 source at `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js`, zod 4.4.3 source at `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js`, official docs at https://zod.dev/json-schema and https://zod.dev/metadata.
- **Empirical verification:** Ran 8 in-process node commands using the project's installed zod 4.4.3 to verify behavior. No test files were created or modified; this is research only.
- **Date range of materials:** zod 4.4.3 (May 2025 release), docs as of June 2026.

## Key Findings

### 1. Direct answer to Q1: Does `z.fromJSONSchema()` carry `description` through?

**Yes — at the call site, it calls `.describe()` on every schema that has a JSON Schema `description`.** Source: `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/from-json-schema.js` lines 472-474:

```js
// Apply description last. `.describe()` clones the schema and sets
// `_zod.parent` on the clone, so registry lookups on the returned reference
// still resolve `extraMeta` via parent inheritance.
if (schema.description) {
    baseSchema = baseSchema.describe(schema.description);
}
```

The `.describe()` method is itself defined at `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js` lines 166-170:

```js
describe(description) {
    const cl = this.clone();
    core.globalRegistry.add(cl, { description });
    return cl;
}
```

So every `description` field in the JSON Schema IS registered against the corresponding zod schema in `z.globalRegistry`, and the description is reachable on the returned schema.

**The exact path is `.description` (a getter on each schema instance), not a direct property.** The getter is defined at `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js` lines 192-196:

```js
Object.defineProperty(inst, "description", {
    get() {
        return core.globalRegistry.get(inst)?.description;
    },
    configurable: true,
});
```

`globalRegistry.get()` walks the `_zod.parent` chain (defined at `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js` lines 30-43):

```js
get(schema) {
    const p = schema._zod.parent;
    if (p) {
        const pm = { ...(this.get(p) ?? {}) };
        delete pm.id;
        const f = { ...pm, ...this._map.get(schema) };
        return Object.keys(f).length ? f : undefined;
    }
    return this._map.get(schema);
}
```

So `.description` on a schema reads `globalRegistry.get(self).description`, where the registry walks the parent chain.

### 2. The catch: optional fields lose their description

`z.fromJSONSchema()` does the following for each property of an object (from `from-json-schema.js` lines 261-269):

```js
for (const [key, propSchema] of Object.entries(properties)) {
    const propZodSchema = convertSchema(propSchema, ctx);
    // If not in required array, make it optional
    shape[key] = requiredSet.has(key) ? propZodSchema : propZodSchema.optional();
}
```

The `convertSchema` call at the end calls `.describe(schema.description)` on the inner schema (a `ZodString`, `ZodObject`, `ZodArray`, etc.). If the property is NOT in the parent's `required` array, `.optional()` is then called on the result. `optional()` is implemented at `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js` lines 1109-1114:

```js
export function optional(innerType) {
    return new ZodOptional({
        type: "optional",
        innerType: innerType,
    });
}
```

**`optional()` does NOT call `clone()` on the inner type, so the new `ZodOptional` does NOT get `_zod.parent` set to the inner type.** The parent chain is broken at the `.optional()` boundary. This is a general Zod 4 design choice, not specific to `fromJSONSchema`.

**Empirical confirmation (run against the project's zod 4.4.3):**

```js
import { z } from "zod";

// Required field — works
const a = z.fromJSONSchema({
  type: "object",
  properties: { name: { type: "string", description: "req name" } },
  required: ["name"],
});
a.shape.name.description;             // => "req name" ✓
a.shape.name._zod.parent;            // => ZodString (parent set)

// Optional field — broken
const b = z.fromJSONSchema({
  type: "object",
  properties: { name: { type: "string", description: "opt name" } },
});
b.shape.name.description;             // => undefined ✗
b.shape.name._zod.parent;            // => undefined (no parent!)
b.shape.name._zod.def.type;          // => "optional"
b.shape.name._zod.def.innerType.description;  // => "opt name" (reachable via innerType, but not via .description)
```

The same pattern holds for `z.string().describe("...").optional()` (manual) — it loses the description on the wrapper. This is consistent with the official docs at https://zod.dev/metadata which warn:

> "Metadata is associated with a specific schema instance. This is important to keep in mind, especially since Zod methods are immutable—they always return a new instance."
>
> ```js
> const A = z.string().meta({ description: "A cool string" });
> A.meta(); // => { description: "A cool string" }
> const B = A.refine(_ => true);
> B.meta(); // => undefined
> ```

So `.refine()`, `.transform()`, `.optional()`, `.nullable()`, `.default()`, `.pipe()`, etc. all return NEW schema instances with no metadata link to the predecessor.

### 3. The same caveat applies to nested objects and arrays

When a required nested object has a field with a description, the field's description is visible if the field is required INSIDE the nested object's `required` array. If the nested object does not declare its own `required` array, ALL its fields are treated as optional at the nested level, and their descriptions are unreachable.

```js
// Required outer object, required inner field
const s1 = z.fromJSONSchema({
  type: "object",
  properties: {
    inner: { type: "object", description: "Inner",
      properties: { val: { type: "string", description: "val desc" } },
      required: ["val"],   // <-- required inside inner
    },
  },
  required: ["inner"],
});
s1.shape.inner.description;             // => "Inner" ✓
s1.shape.inner.shape.val.description;   // => "val desc" ✓

// Required outer object, optional inner field (no required inside inner)
const s2 = z.fromJSONSchema({
  type: "object",
  properties: {
    inner: { type: "object", description: "Inner",
      properties: { val: { type: "string", description: "val desc" } },
    },
  },
  required: ["inner"],
});
s2.shape.inner.description;             // => "Inner" ✓
s2.shape.inner.shape.val.description;   // => undefined ✗
```

**Implication:** the project would need to ensure every nested object has its own `required` array if it wants field-level descriptions to be reachable on the resulting `.shape.<field>.description`.

For arrays: `array.element.description` works because `.element` is a property on `ZodArray` (not a wrapper) — it returns the inner type's clone with parent set.

### 4. Are descriptions visible via `z.globalRegistry.get()` directly?

Yes. The `globalRegistry` is the underlying storage, and the `.description` getter is a convenience wrapper around `globalRegistry.get(self)?.description`. For optional fields, the description is NOT in the registry under the wrapper's identity, but IS in the registry under the inner type's identity. So a custom accessor like:

```js
function getDescription(schema) {
  return z.globalRegistry.get(schema)?.description
      ?? schema._zod.def?.innerType && z.globalRegistry.get(schema._zod.def.innerType)?.description;
}
```

would work, but is non-idiomatic. The clean workaround is to re-apply `.describe()` on the optional wrapper after construction:

```js
const zodObj = z.fromJSONSchema(jsonSchema);
// .shape.<field> is a ZodOptional wrapping a ZodString with description
// .describe() on the wrapper re-registers in globalRegistry for THIS instance
for (const [key, propSchema] of Object.entries(jsonSchema.properties ?? {})) {
  if (propSchema.description && !jsonSchema.required?.includes(key)) {
    zodObj.shape[key] = zodObj.shape[key].describe(propSchema.description);
  }
}
```

But the wrapper from `.optional()` is itself an un-cloned `ZodOptional` — calling `.describe()` on it works (it clones the ZodOptional, sets parent to the original ZodOptional, and adds description to the registry). The consumer then sees the description on the clone. This is the approach the project should take if it wants to keep Approach 2's zero-sidecar vision.

### 5. `additionalProperties` behavior

Source: `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/from-json-schema.js` lines 313-326:

```js
// Handle additionalProperties
// In JSON Schema, additionalProperties defaults to true (allow any extra properties)
// In Zod, objects strip unknown keys by default, so we need to handle this explicitly
const objectSchema = z.object(shape);
if (schema.additionalProperties === false) {
    // Strict mode - no extra properties allowed
    zodSchema = objectSchema.strict();
}
else if (typeof schema.additionalProperties === "object") {
    // Extra properties must match the specified schema
    zodSchema = objectSchema.catchall(convertSchema(schema.additionalProperties, ctx));
}
else {
    // additionalProperties is true or undefined - allow any extra properties (passthrough)
    zodSchema = objectSchema.passthrough();
}
```

**Behavior matrix (verified empirically):**

| JSON Schema `additionalProperties` | Resulting zod | Extras allowed? |
|---|---|---|
| `false` | `z.object(shape).strict()` | NO — rejected |
| `{ type: "string" }` (or any schema) | `z.object(shape).catchall(<that schema>)` | YES, but must match schema |
| `true` or **omitted (our case)** | `z.object(shape).passthrough()` | YES, any value |

**All 7 active record schemas omit `additionalProperties`. Therefore the converter produces passthrough objects.** The resulting `record_create_experiment(input)` will NOT reject `input.experiment_id` if the schema doesn't declare it — it will be silently kept on the parsed output object.

This is a meaningful behavior difference from the hand-written `z.object({...})` schemas in `tools/learning-loop-mcp/tools/create-experiment-record-tool.js`, which use zod's default strip behavior. **The spike test passed because extras didn't break the required-field validation, but the spike did not assert on extra-field handling.**

**Recommendation for the field-coverage plan:** Approach 2 should explicitly add `additionalProperties: false` to each of the 7 active JSON Schemas (a one-time edit) if the desired semantic is "no extras allowed." Alternatively, the `core/schema-to-zod.js` wrapper can post-process the converter output to call `.strict()` on every top-level object. Without one of these changes, the conversion will silently accept extras.

### 6. Caveats discovered

1. **Experimental API.** Per the official docs at https://zod.dev/json-schema: "`z.fromJSONSchema()` is experimental and is not considered part of Zod's stable API. It is likely to undergo implementation changes in future releases." The function is defined at `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/from-json-schema.js` and its top-level JSDoc says: "This function should be considered semi-experimental. It's behavior is liable to change."

2. **Optional-field metadata loss is by design, not a bug.** The Zod 4 design separates schema identity from metadata; methods that produce a new schema (`.optional()`, `.refine()`, `.transform()`, etc.) do not propagate metadata. This is documented at https://zod.dev/metadata.

3. **Registry is global state.** `z.globalRegistry` is a process-wide singleton. Using it for description passthrough means that if two different schemas in the same process happen to reference the same zod object (rare but possible with shared `def` references), the registry entries could collide. In practice, the `fromJSONSchema` always creates fresh objects via `convertSchema` recursion, so this is a theoretical concern only.

4. **JSON-normalize step.** `fromJSONSchema` first does `JSON.parse(JSON.stringify(schema))` (line 478-485) to materialize getters, Proxies, and cyclic references. Cyclic inputs throw. This is fine for our static schema files, but means that runtime `Object.create` schemas with `get` traps would lose their dynamic behavior.

5. **No public feature matrix.** The docs at https://zod.dev/json-schema only document the `z.toJSONSchema()` (inverse) function in detail. The `z.fromJSONSchema()` section is a one-paragraph example. The maintainer has not published a coverage matrix for JSON Schema Draft 2020-12 → zod, so the spike test was the right call to verify the 5 features our schemas use.

### 7. Does the behavior differ between `z.object({...})` and `z.fromJSONSchema(schema)` for the same input?

**For required-field descriptions, no.** Both APIs ultimately call `.describe()` (or the underlying `core.globalRegistry.add(schema, { description })`), and both produce a ZodString with a parent clone that has the description in the registry. The two APIs are functionally equivalent for required-field metadata.

**For optional-field descriptions, the behavior is the same (broken) for both APIs.** The issue is not in `fromJSONSchema` — it's in the general `.optional()` implementation. `z.string().describe("X").optional().description` returns `undefined`, the same as `z.fromJSONSchema({type: "string", description: "X"})` inside an optional property slot.

**For the `passthrough`/`strict` behavior of object schemas, the two APIs differ.** `z.object({...})` (no method call) defaults to **strip** — extra keys are silently removed from the output. `z.fromJSONSchema({type: "object", properties: {...}})` (without `additionalProperties: false`) returns `z.object(shape).passthrough()` — extra keys are **kept** on the output. This is a deliberate JSON-Schema-faithful choice in `fromJSONSchema` but is a meaningful semantic shift for the project's tool inputs.

## Recommendation

### On the sidecar `schemas/tool-descriptions.yaml`

The field-coverage report proposed a sidecar YAML keyed by `<type>.<field>` for human-readable field documentation, conditional on `z.fromJSONSchema()` not carrying descriptions through. The empirical finding is more nuanced than a simple yes/no:

| Path | Result | Action needed |
|---|---|---|
| Add JSON Schema `description` to all 7 active record types | Descriptions are carried through to `.description` for **required fields and the root schema** | None |
| Same, but for **optional fields** (13 of the 17 decision fields; 6 of 17 experiment fields, etc.) | Description is set on `innerType.description` but NOT on `.description` of the optional wrapper | Post-pass wrapper in `core/schema-to-zod.js` that re-applies `.describe()` on the optional wrapper, OR add a `description` lookup helper that walks the `_zod.def.innerType` chain |
| Same, for **optional fields inside optional nested objects** | Same as above; doubles down if the nested object lacks its own `required` array | Same; also ensure nested objects declare their own `required` arrays in the JSON Schemas |

**Verdict: the sidecar is OPTIONAL but RECOMMENDED.** Three reasons:

1. **The 7 active schemas have no `description` fields today.** Even if `z.fromJSONSchema()` perfectly passed descriptions through, the project would have to first edit the 7 JSON Schemas to add descriptions. That work is the same regardless of whether the descriptions are read via `.description` (after a post-pass) or via a sidecar YAML.
2. **The optional-field metadata-loss gotcha is real and the post-pass fix is non-trivial.** A 5-line helper that walks `shape` and re-applies `.describe()` works, but it's an extra moving part that breaks if the zod minor version changes the optional-wrapper internals. The sidecar YAML is more robust against zod 4.x churn (which the docs warn about).
3. **The sidecar can be richer than a JSON Schema `description` allows.** Tool descriptions in this project (e.g., `z.string().describe("Surface/scope this risk applies to (e.g., 'product', 'api')")`) are sometimes user-facing one-liners with examples in parens, which JSON Schema `description` could carry but is less ergonomic for. The sidecar is the project's natural place for the operator-tuned strings.

**Concrete recommendation for the field-coverage plan's Approach 2:**
- **Option A (preferred, more conservative):** Keep the sidecar `schemas/tool-descriptions.yaml` proposal. The 30-line `core/schema-to-zod.js` becomes: `z.fromJSONSchema(jsonSchema)`, then merge in descriptions from the sidecar (only for fields that have a sidecar entry), then re-apply `.strict()` on the top-level object to override the passthrough default. Total ~50 lines.
- **Option B (less robust, fewer files):** Drop the sidecar. Add `description` fields to the 7 active JSON Schemas. Implement a 10-line post-pass in `core/schema-to-zod.js` that re-applies `.describe()` on every optional property wrapper, walking the shape recursively. Add `additionalProperties: false` to each top-level object in the JSON Schemas. Total ~40 lines plus JSON Schema edits. **Risk:** the post-pass depends on the internal `.optional()`-wrapper structure of zod 4.4.x, which is documented as subject to change in an experimental API.

**Whichever option is chosen, add `additionalProperties: false` to all 7 JSON Schemas** (or post-process to `.strict()`), to match the project's existing strip behavior. The current schemas would silently accept extras via the converter, which is a behavior change the field-coverage plan should call out.

### What I could NOT determine

- **Whether the `.optional()` parent-chain gap is a known Zod 4 issue with a planned fix.** I did not search the GitHub issue tracker for `optional describe metadata`; that was outside the time-box of this research. If the field-coverage plan chooses Option B, a quick search of `colinhacks/zod` issues for "optional describe" would confirm whether the gap is a deliberate API contract or an outstanding issue with a near-term fix.
- **Behavior under zod 4.5+, 4.6+.** This is documented as experimental; the recommendation above is anchored to zod 4.4.3. A lockfile bump could change the answer. The spike test catches structural breaks (throw vs. don't throw); it would NOT catch a silent semantic change in metadata propagation. **Mitigation:** add a 1-test assertion in the spike that `z.fromJSONSchema({type:"object", properties:{x:{type:"string", description:"hi"}}}).shape.x.description === "hi"` (required field, no optional). This locks the easy case. The optional case is more brittle; revisit if the project upgrades zod.
- **Whether `z.toJSONSchema()` round-trip preserves the description.** I did not run the round-trip test. If the project ever needs to publish zod → JSON Schema (out of scope for Approach 2), this is a separate question.

## Additional Tests That Would Resolve Remaining Uncertainty

If the field-coverage plan wants belt-and-suspenders confidence before committing to Approach 2, add these to the spike (the current spike is at `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js`):

1. **Required-field description visibility:** for each of the 7 active schemas, add a `description: "test"` to one required field, convert, assert `.shape.<field>.description === "test"`. Locks the easy case.
2. **Optional-field description visibility (the gotcha):** for each of the 7 active schemas, add a `description: "test"` to `notes` (which is optional in every schema), convert, assert the FAILURE `.shape.notes.description !== "test"` to document the current behavior; then re-apply `.describe()` on the wrapper and assert it succeeds. This makes the gap visible to anyone reading the test output and pins the workaround.
3. **`additionalProperties: false` enforcement:** convert a schema with `additionalProperties: false` (already true for some hand-written test fixtures in the project), parse an object with an extra key, assert it throws. Locks the strict behavior so a future zod bump that drops strict support is caught.
4. **Round-trip:** convert a real schema, take the resulting zod, run it through `z.toJSONSchema()`, assert the result has `additionalProperties: false` (because the source has it) AND that the description is present on the round-tripped JSON Schema. This is a one-line test once the previous ones pass.

None of these are blockers; the field-coverage plan can ship Approach 2 with the existing spike plus the `additionalProperties: false` addition, and add the description tests in a follow-up.

## Resources & References

### Source code inspected (zod 4.4.3, pinned in `package.json`)

- `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/from-json-schema.js` lines 16-29 (RECOGNIZED_KEYS — `description` listed), 261-326 (object conversion, including `additionalProperties`), 472-474 (description passthrough at the end of `convertSchema`).
- `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js` lines 166-170 (`.describe()` implementation), 192-196 (`.description` getter), 1109-1114 (`optional()` wrapper), 736-784 (ZodObject definition with `shape` getter).
- `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js` lines 30-43 (`$ZodRegistry.get` parent-chain walk).
- `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/util.js` lines 261-266 (`clone()` — the ONLY path that sets `_zod.parent`).

### Official documentation

- JSON Schema: https://zod.dev/json-schema (covers both `z.fromJSONSchema()` and `z.toJSONSchema()`; documents the experimental status)
- Metadata and registries: https://zod.dev/metadata (documents the per-instance metadata model and the "new instance has no metadata" caveat)
- Zod 4 release notes: https://zod.dev/v4
- Zod 4 versioning: https://zod.dev/v4/versioning

### Project files referenced

- `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js` (existing viability spike; does not test descriptions)
- `tools/learning-loop-mcp/tools/create-experiment-record-tool.js` lines 9-20 (canonical hand-written `.describe(...)` example for `record_create_experiment`)
- `schemas/experiment.schema.json` (representative of the 7 active schemas; no `description` fields on any property today)

## Unresolved Questions

1. **Is the optional-wrapper parent-chain gap a known Zod 4 issue?** Not searched in this research. If the field-coverage plan chooses Option B above, search `colinhacks/zod` issues.
2. **Will the experimental `z.fromJSONSchema()` API signature or behavior change in zod 4.5+?** Unanswerable from current docs; the spike locks the structural case but not the metadata-propagation semantics.
3. **Should `core/schema-to-zod.js` post-process to `.strict()` and re-`.describe()` optional wrappers, or should the 7 JSON Schemas be edited to add `additionalProperties: false` and `description` fields directly?** This is a design call for the field-coverage follow-up plan, not this research.
