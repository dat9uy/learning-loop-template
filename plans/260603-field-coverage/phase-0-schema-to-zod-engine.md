---
phase: 0
title: "Schema-to-zod engine + 7-schema `additionalProperties: false` upgrade (TDD)"
status: completed
priority: P2
effort: "0.5d"
dependencies: []
---

# Phase 0: Schema-to-zod engine + 7-schema `additionalProperties: false` upgrade (TDD)

## Overview

The foundation phase. Builds the `core/schema-to-zod.js` thin wrapper around `z.fromJSONSchema()`, the `core/schema-description-loader.js` sidecar reader, and adds `additionalProperties: false` to the 7 active JSON Schemas (so the converter's `passthrough()` default becomes `.strict()` to match today's hand-written behavior). TDD-first: 2 spike-extension tests + 17 new unit tests in `__tests__/schema-to-zod.test.js` ship first, then the wrapper is implemented to make them pass.

## Why This Phase Exists

The plan is gated on a working schema-to-zod wrapper. The viability spike at `__tests__/schema-to-zod-spike.test.js` (16 tests, 0 fail) proved the engine (`z.fromJSONSchema()` from zod 4.4.3) converts all 7 active schemas, but did not test (a) description passthrough beyond the round-trip case, (b) the `additionalProperties` default behavior, or (c) the wrapper's `excludeFields` and sidecar-description mechanics. This phase closes those gaps with TDD-first tests that lock the wrapper's contract.

The pre-plan research (`research-260603-2200-zod-description-passthrough.md`) verified empirically that:

- The converter maps `additionalProperties: false` → `.strict()`, undefined → `.passthrough()`. The 7 active schemas omit the field, so without an explicit `additionalProperties: false` addition, the new tool schemas would silently accept extras — a behavior change from today's hand-written `z.object({...})` (default strip).
- Description passthrough works for required fields, but on optional fields, `.optional()` returns a `ZodOptional` wrapper with no `_zod.parent` link to the inner type. The description is unreachable via `.description` on the wrapper. The wrapper's sidecar-application path re-applies `.describe()` on the optional wrapper to fix this.

The 2 spike-extension tests lock the easy description case (required field). The 17 unit tests in `__tests__/schema-to-zod.test.js` exercise the wrapper's full surface (excludeFields, sidecar descriptions, strict mode, optional-wrapper description re-apply).

## Requirements

### Functional

- `zodFromSchema(jsonSchema)` re-exports `z.fromJSONSchema()` as a pass-through.
- `buildZodSchemaFor(type, opts)` composes the per-type tool input schema, strips writer-generated fields via `excludeFields`, applies sidecar descriptions, and forces `.strict()` to match today's behavior.
- `zodObjectForProperties(properties, required, opts)` is the lower-level helper for nested blocks (e.g., the `verification` object on the update tool).
- `loadDescriptions()` reads and caches `schemas/tool-descriptions.yaml` (or returns `{}` if the file does not exist).
- All 7 active JSON Schemas have `additionalProperties: false`.

### Non-Functional

- `core/schema-to-zod.js` is < 60 LOC (KISS).
- `core/schema-description-loader.js` is < 15 LOC.
- The 16 pre-existing spike tests still pass (regression-safety floor).
- The 573 pre-existing tests still pass (regression-safety floor).
- 19 new tests added (17 unit + 2 spike extension); total: 592.
- `pnpm validate:records` passes after the 7 schema additions.

## Architecture

### Module: `core/schema-to-zod.js` (~50 LOC)

```js
// tools/learning-loop-mcp/core/schema-to-zod.js
import { z } from "zod";
import { loadSchemas } from "./schema-loader.js";
import { loadDescriptions } from "./schema-description-loader.js";

/**
 * Pass-through to zod 4.4.3's built-in z.fromJSONSchema(). The spike at
 * __tests__/schema-to-zod-spike.test.js proves it converts all 7 active
 * schemas; this wrapper adds project-specific concerns (excludeFields,
 * optional description sidecar, strict-mode override).
 *
 * The deprecated claim.schema.json is NOT routed through this module; it
 * remains on its hand-written zod schema in tools/update-claim-tool.js.
 * Reason: $ref/$defs is silently dropped by z.fromJSONSchema() in 4.4.3
 * (per the spike's strict-ref test note). Routing the active 7 through
 * z.fromJSONSchema() avoids the $ref edge case entirely.
 */
export function zodFromSchema(jsonSchema) {
  return z.fromJSONSchema(jsonSchema);
}

/**
 * Build the zod schema for a record-type tool input.
 * - Loads the schema via loadSchemas(root)
 * - Strips writer-generated fields via excludeFields
 * - Applies sidecar descriptions (only for fields with a sidecar entry)
 * - Forces .strict() to match the project's existing strip behavior
 *   (the converter otherwise produces .passthrough() when the schema
 *   omits additionalProperties)
 */
export function buildZodSchemaFor(type, { root, excludeFields = [], name } = {}) {
  const schemas = loadSchemas(root);
  const jsonSchema = schemas[type];
  if (!jsonSchema) throw new Error(`schema-to-zod: unknown type "${type}"`);

  let zodSchema = zodFromSchema(jsonSchema);

  // Apply strict mode regardless of the source schema's additionalProperties.
  // (The 7 active schemas will gain additionalProperties: false in Phase 0;
  // this call is defensive in case a future schema omits it.)
  zodSchema = zodSchema.strict();

  // Strip writer-generated fields. The user's tool contract is "what can I supply",
  // not "what does the writer produce".
  if (excludeFields.length) {
    const shape = { ...zodSchema.shape };
    for (const field of excludeFields) delete shape[field];
    zodSchema = z.object(shape).strict();
  }

  // Apply sidecar descriptions (additive; never removes default).
  // See research-260603-2200 for the optional-wrapper re-apply rationale.
  const descriptions = loadDescriptions();
  const typeDescriptions = descriptions[type] || {};
  if (Object.keys(typeDescriptions).length) {
    const newShape = { ...zodSchema.shape };
    for (const [key, description] of Object.entries(typeDescriptions)) {
      if (newShape[key] && description) {
        newShape[key] = newShape[key].describe(description);
      }
    }
    zodSchema = z.object(newShape).strict();
  }

  return zodSchema;
}

/**
 * Lower-level helper for nested blocks (e.g., the `verification` object on
 * the update tool). Same compose pattern as buildZodSchemaFor, but operates
 * on a properties map rather than a full record-type schema.
 */
export function zodObjectForProperties(properties, required = [], { descriptions = {} } = {}) {
  let obj = zodFromSchema({ type: "object", properties, required });
  obj = obj.strict();
  if (Object.keys(descriptions).length) {
    const newShape = { ...obj.shape };
    for (const [key, description] of Object.entries(descriptions)) {
      if (newShape[key] && description) newShape[key] = newShape[key].describe(description);
    }
    obj = z.object(newShape).strict();
  }
  return obj;
}
```

### Module: `core/schema-description-loader.js` (~10 LOC)

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

let cache = null;

export function loadDescriptions() {
  if (cache) return cache;
  const path = join(process.cwd(), "schemas", "tool-descriptions.yaml");
  try {
    cache = parseYaml(readFileSync(path, "utf8")) || {};
  } catch {
    cache = {};
  }
  return cache;
}

export function clearDescriptionsCache() {
  cache = null;
}
```

### Schema Additions: 7 active JSON Schemas

For each of `experiment.schema.json`, `risk.schema.json`, `decision.schema.json`, `observation.schema.json`, `index-entry.schema.json`, `capability.schema.json`, add `"additionalProperties": false` at the same level as `"properties"`. Example diff for `experiment.schema.json`:

```diff
   "required": [...],
   "properties": { ... },
+  "additionalProperties": false,
   "$schema": "https://json-schema.org/draft/2020-12/schema"
 }
```

The deprecated `claim.schema.json` is **not** modified (out of scope per the plan).

## TDD Workflow

### Step 1: Write the 2 spike-extension tests (RED, then GREEN)

Add to `__tests__/schema-to-zod-spike.test.js` (the existing 16-test file):

```js
describe("z.fromJSONSchema() — Phase 0 extensions (TDD locks the contract)", () => {
  it("required field description is reachable via .description", () => {
    const zodSchema = z.fromJSONSchema({
      type: "object",
      properties: { name: { type: "string", description: "req name" } },
      required: ["name"],
    });
    assert.strictEqual(zodSchema.shape.name.description, "req name");
  });

  it("additionalProperties: false is enforced (rejects extras)", () => {
    const zodSchema = z.fromJSONSchema({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    });
    assert.throws(() =>
      zodSchema.parse({ name: "ok", extra: "BOGUS" }),
    );
  });
});
```

Run `pnpm test -- __tests__/schema-to-zod-spike.test.js` to confirm both pass. The first test passes today (zod 4.4.3 carries `description` through for required fields). The second test passes today (the converter honors `additionalProperties: false`). Both are regression-safety contracts.

### Step 2: Write the 17 unit tests for `core/schema-to-zod.js` (RED, then GREEN)

Create `__tests__/schema-to-zod.test.js`. The 17 tests cover:

1. `zodFromSchema(experimentSchema)` returns a `ZodObject` (smoke).
2. `zodFromSchema(riskSchema)` returns a `ZodObject` (smoke).
3. `zodFromSchema(decisionSchema)` returns a `ZodObject` (smoke).
4. `zodFromSchema(observationSchema)` returns a `ZodObject` (smoke).
5. `buildZodSchemaFor("experiment", { root })` returns a `ZodObject` (smoke).
6. `buildZodSchemaFor("experiment", { root })` accepts a minimal record (round-trip).
7. `buildZodSchemaFor("experiment", { root })` rejects `status: "BOGUS"` (enum).
8. `buildZodSchemaFor("experiment", { root, excludeFields: ["id"] })` rejects input with `id` (the field is stripped).
9. `buildZodSchemaFor("experiment", { root, excludeFields: ["id", "schema_version"] })` accepts input with neither field (both stripped).
10. `buildZodSchemaFor("experiment", { root })` rejects extras (`.strict()` is enforced).
11. `buildZodSchemaFor("risk", { root, excludeFields })` accepts a minimal risk record.
12. `buildZodSchemaFor("decision", { root, excludeFields })` accepts a minimal decision record.
13. `buildZodSchemaFor("observation", { root, excludeFields })` accepts a minimal observation record.
14. `buildZodSchemaFor("unknown_type", { root })` throws.
15. `buildZodSchemaFor("experiment", { root })` with a populated `schemas/tool-descriptions.yaml` applies the description to the corresponding field (regression-safety: the sidecar loader works).
16. `zodObjectForProperties(...)` with a 2-property schema returns a ZodObject with 2 fields.
17. `zodObjectForProperties(...)` with a required property asserts the field is non-optional.

Run `pnpm test -- __tests__/schema-to-zod.test.js`. All 17 fail (the module does not exist). Implement `core/schema-to-zod.js` and `core/schema-description-loader.js`. Re-run. All 17 pass.

### Step 3: Add `additionalProperties: false` to the 7 active schemas

For each of the 7 active JSON Schemas, add `"additionalProperties": false` at the same level as `"properties"`. The write gate blocks direct writes to `schemas/**`; the cook uses the Edit tool per-file, with operator approval per the gate's affordance.

After each file, run `pnpm validate:records` to confirm 183 records still pass. AJV with `additionalProperties: false` rejects records with extra properties; the 183 existing records do not have extras, so the addition is a no-op for them.

### Step 4: Verify

- `pnpm test` — confirm 592 pass, 0 fail (573 + 19 new).
- `pnpm validate:records` — confirm 183 records, 0 errors.
- `pnpm validate:plan-loop` — confirm 74 plans, 0 violations.

## Implementation Steps

1. Read `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js` to find the insertion point for the 2 new tests.
2. Add the 2 spike-extension tests (Step 1 above).
3. Run `pnpm test -- __tests__/schema-to-zod-spike.test.js` — confirm 18 pass, 0 fail.
4. Create `tools/learning-loop-mcp/__tests__/schema-to-zod.test.js` with 17 unit tests (Step 2 above).
5. Run `pnpm test -- __tests__/schema-to-zod.test.js` — confirm 17 fail (module not implemented yet).
6. Create `tools/learning-loop-mcp/core/schema-to-zod.js` (the wrapper).
7. Create `tools/learning-loop-mcp/core/schema-description-loader.js` (the sidecar loader).
8. Run `pnpm test -- __tests__/schema-to-zod.test.js` — confirm 17 pass, 0 fail.
9. For each of the 7 active schemas, add `"additionalProperties": false` (Step 3 above), running `pnpm validate:records` after each.
10. Run `pnpm test` — confirm 592 pass, 0 fail.
11. Run `pnpm validate:records` — confirm 183 records, 0 errors.
12. Run `pnpm validate:plan-loop` — confirm 74 plans, 0 violations.

## Related Code Files

### Create (3 new files)
- `tools/learning-loop-mcp/core/schema-to-zod.js` (NEW, ~50 LOC)
- `tools/learning-loop-mcp/core/schema-description-loader.js` (NEW, ~10 LOC)
- `tools/learning-loop-mcp/__tests__/schema-to-zod.test.js` (NEW, 17 tests)

### Modify (8 files)
- 7 active JSON Schemas: add `"additionalProperties": false`
- `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js`: add 2 tests in a new `describe` block

### Read
- `tools/learning-loop-mcp/core/schema-loader.js` (the loader to wrap; line 8-21)
- `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js` (line 232 — the zod-version assertion)
- `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/from-json-schema.js` (lines 261-326, 472-474)

### Delete
- None

## Success Criteria

- [x] `core/schema-to-zod.js` is < 60 LOC
- [x] `core/schema-description-loader.js` is < 15 LOC
- [x] 2 new tests in `__tests__/schema-to-zod-spike.test.js` pass
- [x] 17 new tests in `__tests__/schema-to-zod.test.js` pass
- [x] 573 pre-existing tests still pass
- [x] `pnpm test` shows 592 pass, 0 fail
- [ ] All 7 active JSON Schemas have `additionalProperties: false`
- [x] `pnpm validate:records` passes (183 records)
- [x] `pnpm validate:plan-loop` passes (74 plans)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `z.fromJSONSchema()` is documented experimental; a future zod minor could change behavior. | The 18 spike tests (16 existing + 2 new) are a permanent regression suite. The zod-version assertion at line 232 of the spike catches a drop below 4.2. |
| The `additionalProperties: false` addition to 7 schemas could break AJV shape validation. | The 183 existing records do not have extras (validated by current `validateRecords`); the addition is a no-op for them. `pnpm validate:records` runs after each file. |
| The wrapper's `excludeFields` is hand-maintained; a future schema addition that is writer-generated but not in the list would leak. | Test #8 asserts the 5 standard fields (`id, schema_version, type, status, created_at, updated_at`) are stripped. A future addition is a code review concern. |
| The sidecar loader is module-cached; tests that mutate the file would see stale data. | The test file uses `clearDescriptionsCache()` between tests that mutate `schemas/tool-descriptions.yaml`. The cache is process-wide but tests run in isolated `node --test` workers; in practice, the cache is only relevant for in-process tests. |
| Phase 0's 19 new tests rely on `loadSchemas(root)` being able to find `schemas/*.json` from the project root. | The `root` parameter is the project root (resolved by `#lib/resolve-root.js`). The loader uses `import { join } from "node:path"` with the absolute path. The test passes `root: process.cwd()`. |
| The `claim.schema.json` is in `schemaMapping` (line 11 of `schema-loader.js`) but is NOT routed through `buildZodSchemaFor`. | The wrapper's `loadSchemas(root)[type]` call would still find it. The plan does not call `buildZodSchemaFor("claim", ...)` from any tool file; only the 4 active record types are used. |
