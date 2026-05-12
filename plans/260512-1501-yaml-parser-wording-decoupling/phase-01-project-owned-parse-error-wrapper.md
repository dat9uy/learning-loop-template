---
phase: 1
title: "Project-owned parse-error wrapper"
status: complete
priority: P2
effort: "30m"
dependencies: []
---

# Phase 1: Project-owned parse-error wrapper

## Overview

Stop the negative-fixture runner from asserting against `yaml` library message text. Add a thin wrapper that catches `yaml.parse` exceptions and throws a project-owned `RecordParseError` with a stable `kind` field. Update the one fixture case (`invalid-plain-scalar`) that currently depends on library wording to assert on `kind` instead.

## Context

- Predecessor journal: `docs/journals/260512-yaml-parser-library-swap.md` (Q2)
- Current leak site: `tools/validate-records/validate-records.js:44` pins literal string `"Nested mappings are not allowed in compact mappings"` (a `yaml@2.x` message). Library version bump rewrites this without touching project intent.
- Only ONE of the 26 negative cases couples to library text. The other 25 already assert on project validator errors.

## Requirements

- Functional:
  - `parseRecordYaml(text, file)` returns parsed value on success.
  - On parse failure, throws `RecordParseError` with `{ kind: "yaml-syntax", file, cause }`.
  - `runNegativeFixtures` accepts a parse-error case and matches on `kind`, not message.
- Non-functional:
  - No new runtime dependencies.
  - All existing 26 negative fixtures continue to pass.
  - All 34 positive records still parse and validate.

## Architecture

```
record-loader.js          validate-records.js (runNegativeFixtures)
       |                              |
       +-- parseRecordYaml(text,file) +-- catch (err)
              |                              if err instanceof RecordParseError
              +-- try yaml.parse                && err.kind === expectedKind
              +-- catch -> RecordParseError    -> matches
```

Single wrapper module: `tools/validate-records/yaml-parse-wrapper.js`.

## Related Code Files

- Create: `tools/validate-records/yaml-parse-wrapper.js`
- Modify: `tools/validate-records/record-loader.js` (swap `parseYaml` → `parseRecordYaml`)
- Modify: `tools/validate-records/validate-records.js` (refactor `invalid-plain-scalar` case to assert on `kind`)

## Implementation Steps

1. Create `tools/validate-records/yaml-parse-wrapper.js`:
   - Export class `RecordParseError extends Error` with fields `kind`, `file`, `cause`.
   - Export `parseRecordYaml(text, file)`: wraps `yaml.parse` in try/catch and rethrows as `RecordParseError({ kind: "yaml-syntax", file, cause })`.
2. Update `tools/validate-records/record-loader.js`:
   - Replace both `parseYaml(readFileSync(...))` call sites in `loadRecords` and `loadPackStatuses` with `parseRecordYaml(readFileSync(...), filePath)` (pass the file path for the error context).
3. Update `tools/validate-records/validate-records.js`:
   - Change the case row for `invalid-plain-scalar` from message-string to a tagged shape, e.g. `["invalid-plain-scalar", { kind: "yaml-syntax" }]`. Keep all other rows as `[name, "message substring"]`.
   - In the `try { loadRecords } catch (parseError)` block, branch on whether `expected` is a string (current behavior) or a `{ kind }` object (new behavior: check `parseError instanceof RecordParseError && parseError.kind === expected.kind`).
4. Run `pnpm validate:records` — must pass with same 34 records and 26 negative cases.
5. Sanity check: temporarily edit the fixture to a different syntax error (e.g., unclosed bracket) and confirm the case still matches on `kind` — proves the test no longer cares about specific wording. Revert the fixture.

## Todo List

- [x] Create `yaml-parse-wrapper.js` with `RecordParseError` and `parseRecordYaml`
- [x] Swap both `parseYaml` call sites in `record-loader.js`
- [x] Refactor `invalid-plain-scalar` case in `validate-records.js` to assert on `kind`
- [x] Run `pnpm validate:records` — green
- [x] Sanity check: alternate syntax error still matches, then revert

## Success Criteria

- [x] `pnpm validate:records` passes (34 records, 26 negative fixtures green).
- [x] `validate-records.js` contains no literal `yaml@2.x` message text.
- [x] `record-loader.js` has zero direct `yaml.parse` call sites (all routed through wrapper).
- [x] `verify-claim.js` is **not** changed in this phase (its in-function `try/catch` is already project-owned; touching it would be churn).

## Risk Assessment

- **Risk:** Refactoring case-row shape breaks the loop's destructuring. **Mitigation:** Keep string-typed rows working (use `typeof expected === "string"` branch). Only the one row changes shape.
- **Risk:** `parseRecordYaml` adds latency to the hot path. **Mitigation:** It's a single try/catch wrapper — overhead is negligible vs file I/O.
- **Risk:** Wrapper hides parse errors during normal positive loads, making debugging harder. **Mitigation:** `RecordParseError.cause` retains the original `YAMLParseError` for stack/diagnostics; the new error's message includes the file path which the previous flow did not.

## Out of Scope

- Wrapping `verify-claim.js`'s inline `parseValue` — it already throws a project-owned message and is covered by Phase 2's test.
- Generalizing other validator errors (the other 25 cases are already project-owned).
- AJV deferral, schema rewrites, or runtime dependency changes.
