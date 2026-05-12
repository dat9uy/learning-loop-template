---
phase: 4
title: "Engine Swap"
status: completed
priority: P1
effort: "45m"
dependencies: [3]
---

# Phase 4: Engine Swap

## Overview

Replace hand-rolled `validateSchema` (and its helper `validatePrimitive`) in `tools/validate-records/record-validation-rules.js` with AJV 2020 compiled validators. Activate the datetime pattern enforcement landed in Phase 2. Keep all other helpers (`validateSourceRefs`, `validateExperimentPacks`, `validateRecordReferences`, `validateClaimVerification`) unchanged — they encode ledger/cross-record rules that are not JSON Schema concerns.

## Requirements

- Functional: `validatePrimitive` and `validateSchema` deleted. AJV 2020 strict:true allErrors:true compiled validators used instead.
- Functional: error output format changes from `path.field is required` to AJV-native `{file}: {instancePath} {keyword}: {message}`. Caller in `validate-records.js` (line 130: `errors.map((error) => \`- ${error}\`).join("\\n")`) continues to work since errors are still strings prefixed with `${record.__file}:`.
- Functional: `validateRecords` signature unchanged externally; internal `validateSchema(record, schemas[record.type])` call replaced with AJV compiled-validator call.
- Functional: 5 schemas compiled once at module load (or on first call), cached.
- Non-functional: zero new modules; all changes within `record-validation-rules.js`. No new files in `tools/validate-records/`.

## Architecture

### New imports

```js
import Ajv2020 from "ajv/dist/2020.js";
```

### Compilation singleton

Compile schemas lazily on first `validateRecords` call (avoids module-load side effects):

```js
let compiledValidators = null;
function getCompiledValidators(schemas) {
  if (compiledValidators) return compiledValidators;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  compiledValidators = {};
  for (const [type, schema] of Object.entries(schemas)) {
    compiledValidators[type] = ajv.compile(schema);
  }
  return compiledValidators;
}
```

### Replacement of `validateSchema`

Original lines 17-30 (export `validateSchema`) are deleted. Original line 37 caller becomes:

```js
const validators = getCompiledValidators(schemas);
for (const record of records) {
  if (!schemas[record.type]) {
    errors.push(`${record.__file}: unknown type ${record.type}`);
    continue;
  }
  const validator = validators[record.type];
  const recordForValidation = stripInternalFields(record);
  if (!validator(recordForValidation)) {
    for (const err of validator.errors) {
      errors.push(`${record.__file}: ${err.instancePath || "/"} ${err.keyword}: ${err.message}`);
    }
  }
  if (ids.has(record.id)) errors.push(`${record.__file}: duplicate id ${record.id}`);
  ids.set(record.id, record.__file);
}
```

### stripInternalFields helper

```js
function stripInternalFields(record) {
  const { __file, ...rest } = record;
  return rest;
}
```

The `__file` field is injected by `record-loader.js` for error message formatting; AJV with `strict:true` will reject it as unknown property at the data level... actually no — `strict:true` is about schema keywords, not data extras. But the schema files don't declare `__file` in properties, so without `additionalProperties:false` AJV ignores extras. Safer to strip anyway for cleanliness.

### Removed exports

Delete `export function validateSchema` since no caller outside this module uses it. Grep confirms: `validateSchema` is only referenced by the deleted internal caller and by `validate-records.js:37` (which is in the same logical pipeline). No external module imports it.

## Related Code Files

- Modify: `tools/validate-records/record-validation-rules.js` — delete lines 5-30 (validatePrimitive + validateSchema); add Ajv2020 import, compilation singleton, stripInternalFields helper; update the call site in `validateRecords`.
- No other files modified.

## Implementation Steps

1. Open `tools/validate-records/record-validation-rules.js`.
2. Add `import Ajv2020 from "ajv/dist/2020.js";` to the top.
3. Add `let compiledValidators = null;` module-scope variable.
4. Add `function getCompiledValidators(schemas) { ... }`.
5. Add `function stripInternalFields(record) { ... }`.
6. Delete `validatePrimitive` (lines 5-15) and `validateSchema` (lines 17-30).
7. In `validateRecords`, replace the inline `validateSchema` call with the compiled-validator pattern shown in Architecture.
8. Run `pnpm validate:records`. Expected: exit 0, `Validated 34 records.` before the new decision is promoted.
9. If validation fails: read the specific AJV error; either fix the record (if Phase 3 missed a case) or fix the schema pattern (if Phase 2 has a typo).
10. Run `pnpm check`. Expected: exit 0 (tests pass; new error format may need a test snapshot update if any test asserts exact error strings — investigate per-failure).

## Success Criteria

- [ ] `validatePrimitive` and `validateSchema` removed from `record-validation-rules.js`.
- [ ] `Ajv2020` import + compilation singleton added.
- [ ] `pnpm validate:records` exit 0 with `Validated 35 records.` before the new decision is promoted.
- [ ] `pnpm check` exit 0.
- [ ] No test snapshots assert legacy error format with literal `is required` text (Phase 5 covers test-suite verification).

## Risk Assessment

- **Risk**: existing tests in `tools/**/*.test.js` assert exact legacy error strings (`"id is required"`). **Mitigation**: grep for `is required` in test files BEFORE the swap; update assertions if found. Phase 5 verifies.
- **Risk**: AJV `strict: true` rejects a current schema keyword. **Mitigation**: dry-run already proved schemas compile under strict (8 records passed end-to-end). If anything fails, AJV's error message names the offending keyword precisely.
- **Risk**: AJV reports errors for fields not in the schema (`__file`, etc.). **Mitigation**: `stripInternalFields` removes `__file` before validation; no `additionalProperties: false` in schemas so other extras pass.
- **Risk**: error messages now duplicate at the file level — current code prepends `${record.__file}:` once per record, AJV may emit multiple errors per record now (e.g. both `created_at` and `updated_at` fail). **Acceptable**: this is the `allErrors: true` behavior the brainstorm chose; main() already iterates `errors.map((error) => \`- ${error}\`)` so list grows but format stays.
- **Risk**: negative fixtures in `validate-records.js:runNegativeFixtures` assert error substring matches (e.g. `"id is required"`). AJV emits `id required: must have required property 'id'`. **Mitigation**: Phase 5 step explicitly inspects each negative-fixture assertion and updates the expected substring to AJV-compatible text (e.g. `"must have required property 'id'"`).
