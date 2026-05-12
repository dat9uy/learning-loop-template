---
type: problem-solving
technique: simplification-cascades
target: tools/validate-records/
date: 2026-05-12
context_plan: plans/260512-1534-ajv-schema-validation-swap/ (completed)
---

# Validate-Records Simplification Cascade Scout

## Frame

Post-AJV swap. Schemas now own field types, enums, datetime patterns, required-key presence. Question: where is the project still doing schema's job by hand, and where is the remaining hand-rolled code legitimately core learning-loop logic?

Guiding principle (user): rely on schema/framework over invention; only custom-implement learning-loop core; do not fight the schema.

## Files Scanned (post-swap state)

| File | LoC | Role | Schema-owned? |
|------|-----|------|---------------|
| validate-records.js | 140 | Orchestrator + negative-fixture runner | n/a |
| record-validation-rules.js | 183 | AJV-compile + source_ref + path/realpath + experiment-pack + record-ref | partial |
| claim-verification-rules.js | 203 | Cross-record ledger (claim ↔ experiment ↔ decision) | no — core |
| derived-claim-assurance.js | 87 | Derived assurance level | no — core |
| publication-gate-validation.js | 139 | Knowledge-pack publication gates | no — core |
| pack-source-validation.js | 85 | Pack YAML walker + ref/allowlist check | partial |
| use-case-fixture-validation.js | 59 | Use-case fixture shape checks | **schema-shaped, no schema** |
| filename-convention-validation.js | 48 | Warns on legacy timestamp filenames | no — convention |
| record-loader.js | 34 | YAML loader | n/a |
| yaml-parse-wrapper.js | 19 | Parse-error wrapper | n/a |
| generated-validation.js | 28 | Index/doc staleness check | **dead code** |

## Cascade 1 — Dead code: generated-validation.js

**Finding:** `tools/validate-records/generated-validation.js` exports `normalizedIndex` + `validateGeneratedFiles`. Grep shows zero importers project-wide. Predecessor of an index check that got pulled out of the validator. Pure orphan.

**Action:** delete file. Net: −28 LoC, −1 file, zero behavior change.

## Cascade 2 — Dead code: use-case-fixture-validation.js

**Finding:** `fixtures/use-cases/` directory does not exist on disk. `validateUseCaseFixtures()` early-returns `[]` on missing dir. Imported and called in main() but a guaranteed no-op. The validator itself is also a schema-shaped hand-roll (id present, prompt present, enum membership for `expected_classification`, array shape for `required_records` / `allowed_actions` / `blocked_actions`, `pass`/`fail` enum, notes present) — exactly what AJV does.

**Two collapse paths:**
- **(A) Delete** — if use-cases are retired, delete `use-case-fixture-validation.js` + its import + caller. Net: −59 LoC + cleaner orchestrator.
- **(B) Schema-promote** — if use-cases will return, add `schemas/use-case-fixture.schema.json` and let AJV check it (one more entry in the `schemas` map; no separate validator file). Adopting the new posture.

Either way removes a hand-roll. Don't keep both the file and the missing dir.

## Cascade 3 — `recordLocalRoots` + `allowedDescriptionFor` shape mismatch

**Finding:** `record-validation-rules.js:63-66` defines roots as a string list per record type. `allowedDescriptionFor()` (lines 143-148) reconstructs a friendly description by pattern-matching the default's two-element shape. Function exists only to produce one error message variant.

**Collapse:** make the config carry its own description:

```js
const recordLocalRoots = {
  default: { roots: [...], description: "records/evidence or knowledge-packs" },
  capability: { roots: [...], description: "records/evidence, knowledge-packs, product/*/capabilities" },
};
```

`validateLocalRef` reads `.description` directly. `allowedDescriptionFor` deleted. Net: −8 LoC, removes a special-case branch.

## Cascade 4 — `dimensionEntries` reinvents Object.entries

**Finding:** `claim-verification-rules.js:122-127`:
```js
return [...verificationDimensions]
  .filter((dimension) => verification[dimension] !== undefined)
  .map((dimension) => [dimension, verification[dimension]]);
```

**Collapse:**
```js
return Object.entries(claim.verification || {}).filter(([k]) => verificationDimensions.has(k));
```

Net: 5 lines → 1, same semantics (also naturally excludes `blocked_actions` and any future non-dimension keys via Set membership).

## Cascade 5 — Source-ref prefix grammar (deferred posture shift, not now)

**Finding:** `record-validation-rules.js:69-89` hand-codes the URI scheme grammar:
- `legacy:` / `local:` / `record:` / `pack:` startsWith checks
- "unsupported source reference" catchall
- "malformed pack reference" length check

AJV `pattern` on `source_refs.items` could absorb the catchall and the length check:
```json
"items": { "type": "string", "pattern": "^(local|record|pack|legacy):.+" }
```

**Why not now:** scope. AJV-swap plan explicitly excluded ID-pattern + source-ref uniqueness for posture reasons. Adding prefix-pattern shifts the same boundary; needs its own decision record. The remaining `ledger` checks (`record:<id>` exists, `local:<path>` resolves under repo) are core learning-loop logic and stay hand-rolled regardless.

**Recommendation:** note as candidate for a future minor posture shift. Do not bundle.

## Cascade 6 — Pack-source validation is schemaless (deferred)

**Finding:** `pack-source-validation.js` hand-rolls type checks (`source_refs must be array`, `source_refs[0] must be string`), recurses into pack YAML looking for `source_allowlist` to forbid, and re-implements record-ref existence. The reason: there is **no schema** for `manifest.yaml` / `facts.yaml` / `capabilities.yaml`. So the entire 85-line walker exists because the framework wasn't given the chance.

**Path:** add `schemas/pack-manifest.schema.json`, `schemas/pack-facts.schema.json`, `schemas/pack-capabilities.schema.json`. AJV handles array/string types and forbids `source_allowlist` via `not` or absent-from-properties + `additionalProperties:false`. Pack-source-validation collapses to a thin loader + cross-ref check (~20 LoC).

**Why not now:** out of scope. New schemas = new posture-shift decision. Listed as Tier-2 candidate.

## Cascade 7 — Two recursive walkers in pack-source-validation

**Finding:** `pack-source-validation.js` has `collectRefs()` (lines 15-22) AND `validateSourceRefFields()` (lines 41-63) — two independent recursive walks of the same YAML tree, one collecting `record:` refs to verify, one finding `source_refs` arrays to type-check. Either one with a single pass + visitor callbacks would do.

**Why not now:** purely cosmetic until the schema route (Cascade 6) makes the whole file shrink. If schemas adopt, both walks collapse.

## Cascade 8 — `experimentSupportsClaim` vs `experimentProvesDimension`

**Finding:** `derived-claim-assurance.js:16-21` and `claim-verification-rules.js:42-54` both check "does experiment E prove dimension D for claim C". The former is loose (no scope/output check), the latter is strict (matches scope, output_level). Subtle but real semantic gap.

**Why not now:** unifying changes the semantic of derived assurance. Out of scope for a simplification pass; requires deliberate decision about whether assurance derivation should be strict.

## Convergence Insight

Schemas absorbed about 30% of what used to be hand-rolled. The remaining hand-rolled code splits cleanly:

- **Genuinely core** (claim verification, derived assurance, publication gates, fs realpath security, experiment-pack approval): keep hand-rolled. These ARE the learning-loop's contribution.
- **Schemaless schema-checks** (use-cases, pack files): the framework is sitting unused on this content because no schema exists for it. Either adopt or remove.
- **Dead** (`generated-validation.js`, the use-case validator if dir stays gone): delete.
- **Local invention** (`dimensionEntries`, `allowedDescriptionFor`, the friendly-error special case): collapse into stdlib/data idioms.

## Recommended Phased Cleanup

**Phase A — pure deletion + idiom (no posture shift, no schema work):**
1. Delete `generated-validation.js` (orphan).
2. Delete `use-case-fixture-validation.js` + its import + main() call **iff** `fixtures/use-cases/` stays retired.
3. Collapse `recordLocalRoots` config + delete `allowedDescriptionFor`.
4. Collapse `dimensionEntries` to one-liner.

Net delta: ≈ −95 LoC across 3 files, 0 behavior change for `pnpm check`. No new decision record needed (all internal refactor).

**Phase B — Tier-2 posture-shift candidates (each needs its own decision):**
- Source-ref URI prefix `pattern` on schemas (absorbs Cascade 5).
- Pack-file schemas (absorbs Cascades 6 + 7 collateral).
- Use-case-fixture schema (if use-cases revive).

**Phase C — semantic unification (separate brainstorm needed):**
- `experimentSupportsClaim` ↔ `experimentProvesDimension`.

## Unresolved Questions

1. Is `fixtures/use-cases/` permanently retired, or coming back? Answer determines Cascade 2 path (delete vs schema-promote).
2. `generated-validation.js` — was it part of an earlier `validate:records` flow that was extracted into `generate-docs`? Git log would confirm, but the dead-code status is independent of provenance.
3. Phase A goes in as one commit or four? Each is internal-only and reversible; bundling reads cleaner in `git log`.
