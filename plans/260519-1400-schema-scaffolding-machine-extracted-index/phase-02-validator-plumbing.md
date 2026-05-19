---
phase: 2
title: "Validator Plumbing"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Validator Plumbing

## Overview

Extend `tools/validate-records/` to recognize `records/index/` YAMLs, load the new schema, and validate `extracted-assertion` records alongside existing record types. Preserve all existing validation behavior for claims, experiments, decisions, risks, and capabilities.

## Context Links

- Existing loader: `tools/validate-records/record-loader.js`
- Existing entry point: `tools/validate-records/validate-records.js`
- Existing rules: `tools/validate-records/record-validation-rules.js`
- Claim verification rules: `tools/validate-records/claim-verification-rules.js` (type-gated, no changes needed)
- Derived assurance: `tools/validate-records/derived-claim-assurance.js` (type-gated, no changes needed)
- Filename conventions: `tools/validate-records/filename-convention-validation.js` (already skips non-event types)

## Key Insights

- `record-loader.js` uses `recordDirs` array and `sortedYamlFiles` guards non-existent directories with `existsSync`, so adding `"index"` is safe before the directory is populated.
- `validate-records.js` hardcodes schema loading via type-to-filename mapping. Because the schema file is `index-entry.schema.json` but the record type is `extracted-assertion`, an explicit mapping object replaces the array map.
- `validateSourceRefs` currently does `typeof sourceRef !== "string" && continue`, which silently skips structured `source_refs` objects. For index entries, we need type-specific handling that validates `source_refs.*.file` with the same `local:`/`record:`/`legacy:` rules (including file existence and allowed-root checks).
- `validateRecordReferences` only checks `evidence_refs` and `supersedes`. It should also validate `superseded_by` and `experiment_refs` when they carry `record:` prefixes.
- `filename-convention-validation.js` already limits timestamp checks to `decision`, `experiment`, `risk` — `extracted-assertion` is naturally skipped.

## Requirements

- Functional:
  - `record-loader.js` discovers `records/index/*.yaml` files.
  - `validate-records.js` loads `schemas/index-entry.schema.json` and maps it to type `extracted-assertion`.
  - `record-validation-rules.js` validates `extracted-assertion` records against the schema.
  - `source_refs.*.file` in index entries undergoes the same local-path and record-existence checks as other types.
  - `superseded_by` and `experiment_refs` are checked for dangling `record:` references.
- Non-functional:
  - `pnpm check` passes before and after changes.
  - No changes to `claim-verification-rules.js` or `derived-claim-assurance.js`.

## Architecture

```
validate-records.js
  ├─ schema-loader.js (shared type→filename mapping + AJV compile)
  ├─ record-loader.js (add "index" to recordDirs)
  ├─ record-validation-rules.js
       ├─ validateSourceRefs (add extracted-assertion branch)
       └─ validateRecordReferences (add experiment_refs)
  ├─ claim-verification-rules.js (unchanged — type-gated)
  └─ derived-claim-assurance.js (unchanged — type-gated)
verify-claim.js
  └─ schema-loader.js (shared, replaces local hardcoded mapping)
```

## Related Code Files

- Create: `tools/validate-records/schema-loader.js`
- Modify: `tools/validate-records/record-loader.js`
- Modify: `tools/validate-records/validate-records.js`
- Modify: `tools/validate-records/record-validation-rules.js`
- Modify: `tools/claim-verification/verify-claim.js`
- Create: `tools/validate-records/validate-records.test.js` (minimal test)
- Read for context: `tools/validate-records/claim-verification-rules.js`
- Read for context: `tools/validate-records/filename-convention-validation.js`

## Implementation Steps

1. **Modify `record-loader.js`** (line 5):
   - Change `recordDirs` from `["claims", "experiments", "decisions", "risks", "capabilities"]` to include `"index"` at the end.

2. **Create `tools/validate-records/schema-loader.js`**:
   - Export a function `loadSchemas(root)` that returns the compiled AJV validators object.
   - Hardcode the mapping object:
     ```js
     const schemaMapping = {
       claim: "claim.schema.json",
       experiment: "experiment.schema.json",
       decision: "decision.schema.json",
       risk: "risk.schema.json",
       capability: "capability.schema.json",
       "extracted-assertion": "index-entry.schema.json",
     };
     ```
   - Use `ajv/dist/2020.js` with `strict: true, allErrors: true` to compile each schema.
   - Return `Object.fromEntries` of type → compiled validator.

3. **Modify `validate-records.js`** (lines 12–17):
   - Replace the local array-map schema loading with `import { loadSchemas } from "./schema-loader.js";`.
   - Call `const schemas = loadSchemas(root);` where `schemas` is the compiled validators object (same shape as before: type → compiled validator).

4. **Modify `record-validation-rules.js`** — `validateSourceRefs` (lines 67–83):
   - Add a type-specific branch at the top of `validateSourceRefs` for `extracted-assertion`:
     ```js
     if (record.type === "extracted-assertion") {
       for (const sourceRef of record.source_refs || []) {
         if (typeof sourceRef !== "object" || !sourceRef.file) continue;
         const fileRef = sourceRef.file;
         if (typeof fileRef !== "string") continue;
         if (fileRef.startsWith("legacy:")) {
           if (!allowDisallowedFixtures) errors.push(`${record.__file}: disallowed legacy source ${fileRef.slice("legacy:".length)}`);
           continue;
         }
         if (fileRef.startsWith("local:")) {
           validateLocalRef(record, fileRef, root, errors);
           continue;
         }
         if (fileRef.startsWith("record:")) {
           if (!ids.has(fileRef.slice("record:".length))) errors.push(`${record.__file}: missing record reference ${fileRef}`);
           continue;
         }
       }
       return;
     }
     ```
   - Existing string-only logic remains unchanged after this branch.

5. **Modify `record-validation-rules.js`** — `validateRecordReferences` (lines 149–158):
   - Extend `refFields` to include `superseded_by` and `experiment_refs`:
     ```js
     const refFields = [
       ...(record.evidence_refs || []),
       ...(record.supersedes || []),
       ...(record.superseded_by ? [record.superseded_by] : []),
       ...(record.experiment_refs || []),
     ];
     ```
   - Loop over `refFields` instead of the inline spread.

6. **Modify `tools/claim-verification/verify-claim.js`** (lines 52–59):
   - Replace the local hardcoded schema loading with `import { loadSchemas } from "../validate-records/schema-loader.js";`.
   - Call `const schemas = loadSchemas(root);` to get the compiled validators.
   - `verify-claim.js` calls `loadRecords(root)` which will discover `records/index/*.yaml` once Phase 2 step 1 lands; the shared loader ensures `extracted-assertion` is included.

7. **Run `pnpm validate:records`** to confirm no regressions on existing files.

8. **Create `tools/validate-records/validate-records.test.js`**:
   - Write a minimal Node.js test (`node --test`) that:
     - Imports `loadSchemas` and verifies `extracted-assertion` compiles without error.
     - Imports `loadRecords` with a temporary `records/index/` fixture and verifies the file is discovered.
     - Imports `validateRecords` and validates a minimal `extracted-assertion` fixture, asserting zero errors.
   - The test does not need to cover all edge cases — that is Plan 2 scope. Goal: prove the new pipeline loads and validates.

## Success Criteria

- [ ] `pnpm validate:records` passes on existing records (no regressions).
- [ ] `record-loader.js` includes `"index"` in `recordDirs`.
- [ ] `validate-records.js` loads `index-entry.schema.json` under key `extracted-assertion`.
- [ ] `record-validation-rules.js` validates `source_refs.*.file` for index entries and extends record-reference checks to `experiment_refs` (for `record:` prefixed refs).
- [ ] `verify-claim.js` loads `extracted-assertion` schema and validates index entries without error.
- [ ] `tools/validate-records/validate-records.test.js` passes under `node --test`.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Schema mapping object breaks existing type loading | Object keys match existing array elements exactly; no behavior change for existing types. |
| `validateSourceRefs` branch shadows existing logic | The branch returns early; existing logic is untouched for all other types. |
| `superseded_by` / `experiment_refs` on existing records cause false positives | Existing records do not populate these fields; the `typeof ref !== "string"` guard and `startsWith("record:")` check ensure only `record:` prefixed strings are validated. |
| `superseded_by` uses bare IDs, so dangling refs are not caught | By design — `superseded_by` and `supersedes` follow the same plain-ID convention as `decision`/`claim` `supersedes`. The generic validator only checks `record:` prefixed refs. Dangling bare IDs are not validated in this plan. |

## Security Considerations

- Local-path validation (`validateLocalRef`) still enforces that `local:` refs stay inside `records/evidence` (or `product/*/capabilities` for capability records). Index entry `source_refs.*.file` uses the same `validateLocalRef` function, so path-escape protection is preserved.

## Next Steps

- Phase 3: Update `docs/record-system-architecture.md` to describe the new `records/index/` entity.
