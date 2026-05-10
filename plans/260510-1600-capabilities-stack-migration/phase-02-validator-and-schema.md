---
phase: 2
title: "Validator and Schema"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Validator and Schema

## Overview

Add `schemas/capability.schema.json` and extend `tools/validate-records/` to support per-record-type allowlists with a glob prefix match for capability records.

## Requirements

- Functional: Capability records validate against the new schema. The validator admits `local:product/*/capabilities/...` only for capability records.
- Non-functional: No new npm dependencies. Glob match is segment-based, not regex. `*` matches exactly one segment with no `.` or `..`.

## Architecture

`record-validation-rules.js` replaces the flat `allowedRecordLocalRoots` with a per-type table:

```js
const recordLocalRoots = {
  default: ["records/evidence", "knowledge-packs"],
  capability: ["records/evidence", "knowledge-packs", "product/*/capabilities"],
};
```

`expandAllowedRoots` converts patterns to structured entries (`exact` or `glob`). `matchAllowedRoot` checks prefix match segment-by-segment. `validateLocalRef` now receives the full `record` object (not just `record.__file`) to look up the type.

`validate-records.js` adds `"capability"` to the schema-loading array and extends the negative-fixture cases array with three new entries.

## Related Code Files

- Create: `schemas/capability.schema.json`
- Modify: `tools/validate-records/record-validation-rules.js`
- Modify: `tools/validate-records/validate-records.js`

## Implementation Steps

1. Read current `tools/validate-records/record-validation-rules.js` and `tools/validate-records/validate-records.js`.
2. Author `schemas/capability.schema.json` with the locked field shape:
   - Required: `id`, `schema_version`, `type`, `status`, `created_at`, `updated_at`, `source_refs`, `stack`, `surface`, `maps`.
   - `type` const: `"capability"`.
   - `status` enum: `["draft", "approved", "rejected", "superseded"]`.
   - `stack`: open-string (not enum).
   - `surface`: open-string.
   - `maps`: array of objects with `source` (required), `route_class`, `view_class`, `response_class`.
   - Optional: `supersedes` (array of strings).
3. Update `record-validation-rules.js`:
   - Replace `allowedRecordLocalRoots` with `recordLocalRoots` table.
   - Add `expandAllowedRoots(patterns, root)`.
   - Add `matchAllowedRoot(realRelativeSegs, allowedRoot)`.
   - Update `validateLocalRef(record, ref, root, errors)` to accept `record`, look up type, call `validateAllowedLocalPath` with structured roots.
   - Update `validateSourceRefs` signature to pass `record` instead of `record.__file`.
4. Update `validate-records.js`:
   - Add `"capability"` to schema-loading array.
   - Add three negative-fixture cases to `runNegativeFixtures`.
5. Run `pnpm validate:records` to confirm baseline still green.
6. Run `pnpm check`.

## Prompt Block (Code)

```text
Task: Extend the record validator to support per-record-type allowlists and add the capability schema.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- tools/validate-records/record-validation-rules.js
- tools/validate-records/validate-records.js
- schemas/{claim,experiment,decision,risk}.schema.json
- plans/reports/brainstorm-20260510-capabilities-stack-migration.md (Validator changes section)

Goal:
- Create schemas/capability.schema.json.
- Modify record-validation-rules.js to support glob prefix match for capability records only.
- Modify validate-records.js to load capability schema and register new negative fixtures.

Constraints:
- No new npm dependencies.
- Glob * matches exactly one segment; reject . and .. in matched segment.
- realpathSync already used in validateLocalPath; reuse for glob match.
- Default-deny: non-capability types fall back to strict allowlist.

Validation:
- Run pnpm validate:records.
- Run pnpm check.

Stop and ask before:
- Changing the allowlist for non-capability record types.
- Adding multi-segment globs (**) or character classes.
```

## Success Criteria

- Process: 6/6 steps complete.
- Experiment outcome: `inconclusive` (fixtures not yet authored; full test in phase 03).
- `pnpm validate:records` passes against live tree (baseline green).
- `pnpm check` passes.
- `schemas/capability.schema.json` exists and is valid JSON.
- `record-validation-rules.js` implements segment-based glob match with `.`/`..` rejection.

## Risk Assessment

- Risk: `validateSourceRefs` signature change breaks other call sites. Mitigation: only call site is inside `validateRecords` in the same file; verify with grep.
- Risk: glob match allows traversal via symlinks. Mitigation: `realpathSync` resolves before match; existing `validateLocalPath` already does this.

## Approval Gate

**Operator approval REQUIRED before this phase executes.**
Confirm:
1. Capability schema field shape (open-string `stack`, not enum).
2. Per-record-type allowlist table design (default-deny, capability-only widening).
3. Glob match semantics (single-segment `*`, no `.`/`..`).
