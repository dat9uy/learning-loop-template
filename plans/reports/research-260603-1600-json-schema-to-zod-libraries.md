---
date: "2026-06-03T16:00:00Z"
status: agreed
tags: [research, json-schema, zod, codegen, field-coverage, approach-2, fifth-bridge]
related:
  - plans/reports/brainstorm-260603-field-coverage.md (the field-coverage report; Approach 2 = schema-derived zod tool schemas)
  - docs/trajectory.md (the "Fifth Bridge: Schema as Source of Truth" section)
  - schemas/experiment.schema.json
  - schemas/risk.schema.json
  - schemas/decision.schema.json
  - schemas/observation.schema.json
  - schemas/claim.schema.json (deprecated; uses $defs/$ref)
  - schemas/index-entry.schema.json
  - schemas/capability.schema.json
---

# Research: JSON Schema → Zod Libraries for the Fifth Bridge

> **Question:** Is there a maintained external library that translates our JSON Schema into Zod, so we don't write the conversion by hand for `core/schema-to-zod.js`?
>
> **Headline answer:** Yes — three options, each with trade-offs. The strongest candidate is **zod 4's built-in `z.fromJSONSchema()`** (added in v4.2, December 2025). It is currently marked **experimental** but it is the project's existing zod version (4.4.3) and adds zero new dependencies. The other two options (`zod-from-json-schema`, `json-schema-to-zod`) are external libraries with significant caveats. A 1-day prototype spike is the right next step.

## Research Methodology

- **Sources consulted:** 6 web searches + 4 npm/GitHub/zod-docs page fetches.
- **Date range of materials:** 2021 (oldest package) to 2026-04 (newest release).
- **Key search terms used:** `json-schema-to-zod npm 2024 2025 maintenance zod 4`, `npm packages convert JSON Schema to Zod 2025`, `json-schema-to-zod github issue tracker Draft 2020-12`, `zod 4 json schema conversion library production ready`, `zod fromJSONSchema experimental coverage draft 2020-12 $ref $defs`, `zod 4 fromJSONSchema const enum pattern required`.

## Executive Summary

Three viable approaches exist for the JSON Schema → Zod translation step of Approach 2:

1. **zod 4 built-in `z.fromJSONSchema()`** — zero new dependencies, already on the project's zod 4.4.3, but currently marked **experimental** with no public feature-coverage matrix. **Recommended first try.** A 1-day spike should confirm it covers our 7 active schemas.
2. **`zod-from-json-schema` (glideapps)** — the most mature *runtime* library (44 dependents, 100% code coverage, passes the majority of the official JSON Schema Test Suite). Does **not** support `$ref` / `$defs`, which `claim.schema.json` (deprecated) needs.
3. **`json-schema-to-zod` (Stefan Terdell)** — the most popular by dependents (180), but **deprecated as of March 2026** ("this project will no longer be actively maintained"), and is a *code generator* (returns source code you must `eval()`), not a runtime converter. Not recommended.

The project's specific schema set is **mostly compatible with all three**, with the single exception of `claim.schema.json` (deprecated, uses `$defs`/`$ref`). For the 7 active schemas, the schema's feature surface is small: `type`, `properties`, `required`, `enum`, `const`, `pattern`, `array.items`, `object.properties`. None of the active schemas use `$ref`, `oneOf`/`anyOf`/`allOf`, `patternProperties`, or `if/then/else`. This narrow subset is well within the supported range of all three candidates.

## Key Findings

### 1. Candidate A: zod 4 built-in `z.fromJSONSchema()` (recommended first try)

- **Source:** https://zod.dev/json-schema, GitHub issue colinhacks/zod#5233 (closed 2025-12-16).
- **Status:** Landed in zod 4.2 (December 2025). Currently marked **experimental** in the docs: "It is likely to undergo implementation changes in future releases."
- **Project's installed version:** zod 4.4.3 — we already have it. No new dependency.
- **API:** Single function `z.fromJSONSchema(jsonSchema)` returns a Zod schema instance. No options documented yet.
- **Documentation coverage:** The zod docs page mostly describes `z.toJSONSchema()` (the inverse direction). The `fromJSONSchema()` function is documented at the top of the page with one example but no feature matrix.
- **Community signal:** GitHub issue #5233 had 8 thumbs-up before landing. The maintainer (`colinhacks`) closed it himself. No public tracking issue for "complete the experimental API."
- **Risk:** The "experimental" tag means the function may change signature, options, or coverage between minor zod versions. A lockfile bump could break the build. The `pnpm check` script (which runs `validate:records` + `validate:plan-loop` + test suite) would catch a runtime regression, but a silent semantic change would not.
- **Open question:** Does `z.fromJSONSchema()` handle `enum`, `const`, `pattern`, `array.items` (with nested `pattern` on the item schema) — the 5 features our active schemas use? The docs do not say. The spike answers this.

### 2. Candidate B: `zod-from-json-schema` (glideapps) — strongest external option

- **Source:** https://www.npmjs.com/package/zod-from-json-schema, https://github.com/glideapps/zod-from-json-schema
- **Latest version:** 0.5.2 (published 7 months ago; 12 versions total).
- **Dependents:** 44 packages. Actively used.
- **Runtime vs. codegen:** **Runtime converter** — `convertJsonSchemaToZod(schema)` returns a Zod instance directly. This is what we want; no `eval()`.
- **Draft 2020-12 coverage:** Comprehensive for the basic subset. Specifically supports: `string` (minLength, maxLength, pattern), `number`/`integer` (minimum, maximum, exclusiveMinimum/Maximum, multipleOf), `boolean`, `null`, `object` (properties, required, additionalProperties, minProperties, maxProperties), `array` (items, prefixItems, minItems, maxItems, uniqueItems, contains, minContains, maxContains), schema composition (anyOf, allOf, oneOf, not, const, enum), title/description/default, Unicode-aware string length validation, special property name handling (constructor, toString, __proto__).
- **Test rigor:** 100% code coverage; passes the majority of the official JSON Schema Test Suite (246 tests skipped, list published in repo).
- **Zod 4 support:** "latest" package version supports zod 4 proper. Older 0.1.x supports zod 3.
- **Critical gap:** **Does NOT support `$ref` / `$defs` / `definitions` / `$dynamicRef` / `$dynamicAnchor`**. Other unsupported features: `patternProperties`, `dependentSchemas`, `dependentRequired`, `propertyNames`, `unevaluatedProperties`, `unevaluatedItems`, `if/then/else`. Source: README "Currently Unsupported Features" section.
- **Impact for our project:** Our 7 active schemas do not use `$ref` or `$defs`. Our 1 deprecated schema (`claim.schema.json`) does — it has `$defs: { proof_dimension, scoped_proof_dimension, runtime_dimension, product_dimension }` and references them via `$ref` from inside `verification`. If we use `zod-from-json-schema` for the 7 active schemas and the deprecated `claim` schema, the claim schema would either need a small adapter (pre-resolve `$ref` via `ajv` or a hand-rolled dereferencer) or be excluded from the codegen.
- **Dependencies:** 1 transitive dependency (likely `json-pointer` or similar — README does not list it explicitly; would need to inspect the lockfile to confirm).
- **Maintenance signal:** 7 months since last release is a yellow flag, not a red one. The library is feature-complete for the supported subset; the slow release cadence is consistent with "works, no new features to add."

### 3. Candidate C: `json-schema-to-zod` (Stefan Terdell) — most popular, but deprecated and not runtime

- **Source:** https://www.npmjs.com/package/json-schema-to-zod, https://github.com/jonashoyer/json-schema-to-zod
- **Latest version:** 2.8.1 (published 2 months ago; 49 versions total).
- **Dependents:** 180 packages (the most popular by a wide margin).
- **Maintenance status:** **DEPRECATED.** The npm page has a "Notice of deprecation" banner: "As of March 2026, this project will no longer be actively maintained. Thank you to all the contributors and sponsors throughout the years! So long, and thanks for all the fish."
- **Runtime vs. codegen:** **CODE GENERATOR.** The function `jsonSchemaToZod(schema, opts)` returns a string of JavaScript source code. To use the schema at runtime, you must `eval()` (the README's own example labels it "an example that you shouldn't use"). The README's preferred workflow is to write the generated source to a file, format with Prettier, and check it in. The CLI does exactly this.
- **Why this is wrong for us:** The field-coverage report's design specifies a *runtime* module — `core/schema-to-zod.js` is called per tool registration, not at build time. A code generator would either (a) require a build step that commits generated `*-schema.js` files, or (b) require an `eval()` call, which violates the project's no-eval posture and the gate's vendor-import rules.
- **Zod 4 support:** Yes — `--zodVersion 4` is the default. Supports both v3 and v4 output.
- **Draft coverage:** 4+ (older scope; some Draft 2020-12 features like `prefixItems` may not be supported, but our schemas don't use them).
- **Verdict:** **Do not use.** Deprecated and the wrong architecture (codegen vs. runtime).

### 4. Other candidates (rejected on first scan)

- `@toolprint/json-schema-to-zod` — v0.1.0, 9 months old, 0 dependents, hobby project. Not production-grade.
- `@n8n/json-schema-to-zod` — n8n's internal fork, not a public API. Not a candidate.
- `json-to-zod` — last published 5 years ago. Abandoned.
- `zod-to-json-schema` (Stefan Terdell) — inverse direction (zod → json schema), used internally by the MCP TypeScript SDK. Not relevant for our direction. Note: the SDK had a known issue (#745) where its pinned `zod-to-json-schema@3.24.5` generates Draft-07, breaking some clients. We should pin a version that generates Draft-07 explicitly if we ever publish tool schemas to clients — but this is out of scope for Approach 2 (Approach 2 derives zod from our JSON schemas, not the other way around).

## Feature Coverage Matrix (for our 7 active schemas)

Our active schemas use only this subset of JSON Schema features:

| Feature | Used in | `z.fromJSONSchema()` | `zod-from-json-schema` | `json-schema-to-zod` |
|---|---|---|---|---|
| `type: "string"` | all 7 | likely yes | yes | yes |
| `type: "number"` | observation | likely yes | yes | yes |
| `type: "integer"` | index-entry, risk | likely yes | yes | yes |
| `type: "boolean"` | (none in active) | likely yes | yes | yes |
| `type: "object"` | all 7 | likely yes | yes | yes |
| `type: "array"` | experiment, risk, decision, index-entry, claim | likely yes | yes | yes |
| `properties` + `required` | all 7 | likely yes | yes | yes |
| `enum` | experiment, risk, decision, index-entry, capability | likely yes | yes | yes |
| `const` | decision, capability | likely yes | yes | yes |
| `pattern` | experiment, risk, observation, index-entry | likely yes | yes | yes |
| `items` (nested) | experiment, risk, index-entry | likely yes | yes | yes |
| `description` | most fields | likely yes (via metadata) | yes (carried over) | yes (via `--withJsdocs`) |
| `additionalProperties` (not set) | all 7 | likely yes (passes through) | yes (default permissive) | yes |
| `$ref` / `$defs` | **claim only (deprecated)** | unknown | **no** | yes (with `json-refs` preprocessor) |

"likely yes" for `z.fromJSONSchema()` is because the docs do not publish a feature matrix. The 1-day spike answers this with certainty.

## Comparative Analysis

| Dimension | `z.fromJSONSchema()` (zod 4 built-in) | `zod-from-json-schema` | `json-schema-to-zod` |
|---|---|---|---|
| New dependency | none (already on zod 4.4.3) | 1 small | 0 (but deprecated) |
| Runtime or codegen | runtime | runtime | **codegen** (must eval) |
| Maintenance | zod core team (active) | glideapps (yellow flag, 7 mo) | **deprecated March 2026** |
| Zod 4 support | yes (native) | yes (latest) | yes (`--zodVersion 4`) |
| Draft 2020-12 support | unknown (docs silent) | partial (basic subset yes, advanced no) | yes (with caveats) |
| `$ref` / `$defs` | unknown | **no** | yes (with preprocessor) |
| Test rigor | covered by zod's own test suite | 100% coverage + JSON Schema test suite | unit tests in repo |
| Community signal | 8 thumbs before landing + zod maintainer closure | 44 dependents, actively used | 180 dependents but **deprecated** |
| Fit for our 7 active schemas | likely yes (spike to confirm) | yes | yes |
| Fit for our 1 deprecated `claim` schema | unknown | needs adapter or skip | yes with preprocessor |
| Lock-in risk | experimental API may change in zod minor | mature, slow release | deprecated, no future fixes |

## Implementation Recommendations

### Recommended path: Spike first, then commit

1. **Phase 0a (1 day, TDD):** Write a `__tests__/schema-to-zod-spike.test.js` that loads each of our 7 active schemas, runs it through `z.fromJSONSchema()`, and asserts that the resulting zod schema accepts a hand-crafted "good" object and rejects a "bad" object for each of the 5 feature types we use (`enum`, `const`, `pattern`, `items` with nested `pattern`, `required`). If this passes, Approach 2's `core/schema-to-zod.js` is **a 30-line wrapper around `z.fromJSONSchema()`** — no new dependency.
2. **Phase 0b (1 day):** Same spike for the deprecated `claim.schema.json`. If `z.fromJSONSchema()` does not handle `$ref`/`$defs`, document the gap. Two options for the claim schema:
   - **Option A:** Pre-resolve `$ref`s at schema-load time using `ajv` (already a dependency). The resulting dereferenced schema is plain Draft 2020-12 and `z.fromJSONSchema()` handles it.
   - **Option B:** Hand-write a small `buildClaimZodSchema()` for the one deprecated record type. Acceptable because claim is deprecated and frozen-legacy.
3. **Phase 0c (decision):** If the spike on the active 7 schemas fails (e.g., `z.fromJSONSchema()` does not handle `pattern` correctly, or the experimental API is too unstable), fall back to `zod-from-json-schema` for those 7 and hand-write the claim adapter. Add the dependency, document the decision in the `field-coverage` follow-up plan.
4. **Phase 1+:** Proceed with Approach 2 as designed in the field-coverage report, with the `core/schema-to-zod.js` module now being either a 30-line wrapper or a thin pass-through to `zod-from-json-schema`.

### Quick Start (for the spike)

```js
// __tests__/schema-to-zod-spike.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");

describe("z.fromJSONSchema() spike", () => {
  for (const type of ["experiment", "risk", "decision", "observation", "index-entry", "capability", "claim"]) {
    it(`accepts a minimal valid record for ${type}`, () => {
      const schema = JSON.parse(readFileSync(join(root, "schemas", `${type === "index-entry" ? "index-entry" : type}.schema.json`), "utf8"));
      const zodSchema = z.fromJSONSchema(schema);
      // Build a minimal record by picking one of each required field
      // (hand-curated fixtures; if the test fails, inspect the error)
      const minimal = buildMinimal(type);
      assert.doesNotThrow(() => zodSchema.parse(minimal));
    });

    it(`rejects an invalid enum value for ${type}`, () => {
      const schema = JSON.parse(readFileSync(join(root, "schemas", `${type === "index-entry" ? "index-entry" : type}.schema.json`), "utf8"));
      const zodSchema = z.fromJSONSchema(schema);
      const bad = buildMinimal(type);
      // mutate the first enum field to a bogus value
      const enumField = findFirstEnumField(schema);
      bad[enumField] = "__BOGUS__";
      assert.throws(() => zodSchema.parse(bad));
    });
  }
});
```

### Common Pitfalls

- **Description passthrough.** The zod 4 built-in's metadata support (`z.globalRegistry`) is how descriptions reach `.describe(...)`. If `z.fromJSONSchema()` does not pass through `description`, the tool surface loses its human-readable field documentation. The sidecar `schemas/tool-descriptions.yaml` from the field-coverage report is the fallback — verify whether it's needed after the spike.
- **`$ref` resolution.** `claim.schema.json`'s `$defs` chain is the only blocker. `ajv` can pre-resolve in ~5 lines: `ajv.compile(schema)` then `ajv.removeSchema(schema)` after extracting the resolved form. Or use `json-refs` (already a transitive dep of some packages). Choose `ajv` because it's already in our `package.json`.
- **Experimental API stability.** Pin zod in `package.json` to a known-working minor version. If `z.fromJSONSchema()` changes between `4.4.x` and `4.5.x`, the field-coverage test will catch it on the next `pnpm install` and we can pin tighter.
- **The schema's `description: "..."` on a deprecated field.** The claim schema has a top-level `description: "Claim Record — deprecated for new entries..."` field. `z.fromJSONSchema()` should ignore it (it is not in `properties`), but the spike should verify.

## Resources & References

### Official documentation

- Zod 4 JSON Schema page (covers both `z.fromJSONSchema()` and `z.toJSONSchema()`): https://zod.dev/json-schema
- Zod 4 release notes: https://zod.dev/v4
- Zod 4 versioning policy: https://zod.dev/v4/versioning
- JSON Schema Draft 2020-12 release notes: https://json-schema.org/draft/2020-12/release-notes
- AJV 8 (already a project dependency): https://ajv.js.org/

### Candidate libraries

- `json-schema-to-zod` (Stefan Terdell) — https://www.npmjs.com/package/json-schema-to-zod, https://github.com/jonashoyer/json-schema-to-zod (**deprecated**)
- `zod-from-json-schema` (glideapps) — https://www.npmjs.com/package/zod-from-json-schema, https://github.com/glideapps/zod-from-json-schema
- `zod-from-json-schema` deep-wiki overview — https://deepwiki.com/glideapps/zod-from-json-schema
- `zod-to-json-schema` (Stefan Terdell) — https://github.com/StefanTerdell/zod-to-json-schema (inverse direction; not what we need)
- GitHub issue for `z.fromJSONSchema()` landing — https://github.com/colinhacks/zod/issues/5233

### Community signals

- LogRocket blog, "Here's why everyone's going crazy over Zod 4" (May 2025) — https://blog.logrocket.com/zod-4-update/ — explains that zod 4 is "fully compatible" with prior versions and that "in previous versions, developers relied on third-party libraries like zod-to-json-schema" for the inverse direction (i.e., before `z.fromJSONSchema()`).
- MCP TypeScript SDK issue #745 (zod-to-json-schema 3.24.5 generates Draft-07, breaking modern MCP clients) — https://github.com/modelcontextprotocol/typescript-sdk/issues/745 — relevant only if we ever *export* zod schemas to clients (out of scope for Approach 2).

## Unresolved Questions

1. **Does `z.fromJSONSchema()` cover `pattern`, `enum`, `const`, `array.items` with nested `pattern`?** The docs do not say. The 1-day spike answers this.
2. **Does `z.fromJSONSchema()` handle `$ref` / `$defs`?** Also unknown. The spike should try the claim schema.
3. **How stable is the experimental API across zod minor versions?** The deprecation policy on zod 4 is documented at https://zod.dev/v4/versioning; the spike should pin a known-working version.
4. **Should the `core/schema-to-zod.js` module be a wrapper around `z.fromJSONSchema()` or a fork that adds project-specific defaults (e.g., `additionalProperties: false` injection, sidecar-description lookup)?** This is a design call the field-coverage follow-up plan should make, not this research.
