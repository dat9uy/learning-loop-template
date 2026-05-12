---
phase: 2
title: "Schema Edits"
status: completed
priority: P1
effort: "20m"
dependencies: [1]
---

# Phase 2: Schema Edits

## Overview

Add `"pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$"` to 11 timestamp fields across all 5 JSON Schema files. Hand-rolled validator silently ignores `pattern` (not in `validatePrimitive`), so this phase introduces zero behavior change while the engine is still hand-rolled — `pnpm validate:records` remains green even with malformed timestamps. The new rule activates in Phase 4.

## Requirements

- Functional: 11 `pattern` additions made — 5 schemas × `created_at`, 5 schemas × `updated_at`, 1 × `claim.approval.reviewed_at`.
- Functional: `$schema` declarations untouched (still `https://json-schema.org/draft/2020-12/schema`).
- Functional: no other schema keys added or removed in this phase.
- Non-functional: pattern strings are byte-identical across schemas (DRY: same literal everywhere).

## Architecture

Each schema gets the pattern keyword inline next to `"type": "string"`:

```json
"created_at": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$" },
"updated_at": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$" },
```

For `claim.approval.reviewed_at` (nested inside `$defs`-equivalent object), edit in place:

```json
"approval": {
  "type": "object",
  "required": ["status", "reviewer", "reviewed_at"],
  "properties": {
    "status": { "enum": ["draft", "reviewed", "approved", "rejected"] },
    "reviewer": { "type": "string" },
    "reviewed_at": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$" }
  }
}
```

## Related Code Files

- Modify: `schemas/claim.schema.json` (3 patterns: created_at, updated_at, approval.reviewed_at).
- Modify: `schemas/experiment.schema.json` (2 patterns).
- Modify: `schemas/decision.schema.json` (2 patterns).
- Modify: `schemas/capability.schema.json` (2 patterns).
- Modify: `schemas/risk.schema.json` (2 patterns).

## Implementation Steps

1. Edit `schemas/claim.schema.json`: add pattern to `created_at`, `updated_at`, and `properties.approval.properties.reviewed_at`.
2. Edit `schemas/experiment.schema.json`: add pattern to `created_at` and `updated_at`.
3. Edit `schemas/decision.schema.json`: add pattern to `created_at` and `updated_at`.
4. Edit `schemas/capability.schema.json`: add pattern to `created_at` and `updated_at`.
5. Edit `schemas/risk.schema.json`: add pattern to `created_at` and `updated_at`.
6. Run `pnpm validate:records`. Expected: exit 0 (hand-rolled validator silently ignores `pattern`).
7. Run `pnpm check`. Expected: exit 0.

## Success Criteria

- [ ] All 11 pattern additions present, strings byte-identical.
- [ ] No other schema fields modified.
- [ ] `pnpm validate:records` exit 0.
- [ ] `pnpm check` exit 0.
- [ ] Diff is mechanical — pure additions, no deletions, no reformatting.

## Risk Assessment

- **Risk**: regex string escaping wrong. JSON requires `\\d` for `\d`, JS regex needs `\d`. Schema JSON expects `\\d` (double backslash). **Mitigation**: copy from dry-run script line `const UTC_Z_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$"` — proven to compile in AJV.
- **Risk**: editing one schema's `approval.reviewed_at` accidentally drops a sibling property. **Mitigation**: use `Edit` tool with full surrounding context (`old_string` includes `reviewer` line + `reviewed_at` line); verify with diff before next phase.
