---
phase: 5
title: "Outside Reference Block"
status: pending
priority: P2
effort: "3h"
dependencies: []
---

# Phase 5: Outside Reference Block

## Overview

Add a validation layer that blocks agents from referencing `docs/journals/` and `plans/reports/` in new records. This closes the loop boundary leak: agents currently bypass the `local:` root restriction by using `legacy:` or plain-string references to external docs. The 1:1 artifact philosophy requires that all findings be internalized into `records/<surface>/evidence/` or `records/<surface>/index/` and referenced via `local:` or `record:` (allowed roots only).

## Requirements

- **Functional:** New records (created_at >= 2026-06-01) fail validation if any string field contains `docs/journals/` or `plans/reports/`
- **Functional:** All records (no grandfathering) fail validation if a `legacy:` ref points to `docs/` or `plans/`
- **Functional:** Existing records with `legacy:docs/` or `legacy:plans/` refs are grandfathered (only new records affected)
- **Non-functional:** `pnpm validate:records` passes after all changes (existing records pass)
- **Non-functional:** `pnpm test` passes after all changes
- **Non-functional:** Error message is actionable: "Use record: refs to decisions/experiments/index entries instead of external docs."

## Architecture

### Two layers of enforcement

**Layer 1: Legacy ref ban (all records, no grandfathering)**

In `source-ref-validator.js` (or `record-validation-rules.js` `validateSourceRefs`):
```js
if (ref.startsWith("legacy:")) {
  const legacyPath = ref.slice("legacy:".length);
  if (legacyPath.includes("docs/") || legacyPath.includes("plans/")) {
    return { valid: false, error: `legacy: refs to docs/ or plans/ are banned. Use record: refs to internalized records instead.` };
  }
  return { valid: true, deprecated: true };
}
```

**Layer 2: Outside reference block (new records only, grandfathered)**

Add a new validation function in `record-validation-rules.js`:
```js
const OUTSIDE_PATTERNS = [
  /docs\/journals\//,
  /plans\/reports\//,
];

function validateOutsideReferences(record) {
  const errors = [];
  if (!record.created_at || record.created_at < "2026-06-01T00:00:00Z") {
    return errors; // grandfathered
  }
  const strings = extractAllStrings(record);
  for (const str of strings) {
    if (OUTSIDE_PATTERNS.some(p => p.test(str))) {
      errors.push(`${record.__file}: references outside-artifact "${str}". Internalize findings into records/<surface>/evidence/ or records/<surface>/index/ and reference via record: or local: (allowed roots only).`);
    }
  }
  return errors;
}
```

### Scope

- **Records:** Only `.yaml` structured records under `records/` (decisions, experiments, risks, index entries)
- **Evidence files:** OUT OF SCOPE for this plan — `.md` evidence files are handled by surface-specific plans
- **Targets:** `docs/journals/` and `plans/reports/` only
- **Fields:** All string values recursively scanned (YAML frontmatter + body)
- **Pattern precision:** Use path-level patterns to avoid false positives on conceptual mentions:
  - `docs/journals/` alone is NOT flagged (conceptual mention)
  - `docs/journals/260513-vnstock-bootstrap-substrate-experiment.md` IS flagged (actual file path)
  - `plans/reports/` alone is NOT flagged
  - `plans/reports/brainstorm-260601-meta-1to1-artifact-cleanup.md` IS flagged

**Note:** This plan is scoped to the `meta` surface. Non-meta surfaces (vnstock, product, etc.) will handle their own evidence files in separate sessions.

### Grandfathering logic

```js
const GRANDFATHERED_CUTOFF = "2026-06-01T00:00:00Z";

function isGrandfathered(record) {
  const createdAt = record.created_at || record.extraction?.first_extracted_at;
  return !createdAt || createdAt < GRANDFATHERED_CUTOFF;
}
```

### Pattern design (precision to avoid false positives)

```js
const OUTSIDE_PATTERNS = [
  /docs\/journals\/[^\s]+\.(md|yaml|yml)/,  // actual file paths
  /plans\/reports\/[^\s]+\.(md|yaml|yml)/,  // actual file paths
];
```

This pattern only matches complete file paths, not conceptual mentions like "the docs/journals directory". The pattern allows `.md`, `.yaml`, and `.yml` extensions.

**Why this matters:** The experiment `experiment-product-macro-cook-no-loop-20260522T055121Z.yaml` has a `goal` field containing "Compare actual output (docs/journals/) against expected output (records/)" — this is a conceptual mention, not a file path. The precise pattern would NOT flag this grandfathered record, nor would it flag a new record with the same conceptual mention.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/record-validation-rules.js` — add `validateOutsideReferences()` function and call it in `validateRecords()`
- **Modify:** `schemas/index-entry.schema.json` — no schema change needed (this is a semantic layer, not structural)
- **Modify:** `tools/learning-loop-mcp/core/negative-fixture-runner.js` — add negative fixtures for outside-reference violations
- **Create:** `tools/learning-loop-mcp/fixtures/negative/outside-reference-docs/` — test fixture with `docs/journals/` in a new record
- **Create:** `tools/learning-loop-mcp/fixtures/negative/outside-reference-plans/` — test fixture with `plans/reports/` in a new record
- **Create:** `tools/learning-loop-mcp/fixtures/negative/legacy-docs-ref/` — test fixture with `legacy:docs/journals/...` in any record
- **Modify:** `docs/artifact-concepts.md` — document the outside-reference rule

## Implementation Steps

1. **Add `extractAllStrings` helper:** Recursively extract all string values from a parsed YAML record
2. **Add `validateOutsideReferences` function:** Check for `docs/journals/` and `plans/reports/` patterns in new records
3. **Add legacy-docs ban in `validateSourceRefs`:** Block `legacy:docs/` and `legacy:plans/` in all records
4. **Add negative fixtures:** Create 3 test fixtures (outside-ref docs, outside-ref plans, legacy-docs-ref)
5. **Add positive fixture:** Create a fixture with `created_at < 2026-06-01` containing `docs/journals/` to verify grandfathering
6. **Wire into `validateRecords`:** Call `validateOutsideReferences()` after schema validation
7. **Run tests:** `pnpm test` must pass
8. **Run validation:** `pnpm validate:records` must pass (existing records are grandfathered)
9. **Document:** Update `docs/artifact-concepts.md` with the rule

## Success Criteria

- [ ] `record-validation-rules.js` has `validateOutsideReferences()` function
- [ ] New records (created_at >= 2026-06-01) with `docs/journals/` fail validation
- [ ] New records (created_at >= 2026-06-01) with `plans/reports/` fail validation
- [ ] All records with `legacy:docs/...` or `legacy:plans/...` fail validation
- [ ] Existing records with `docs/journals/` or `plans/reports/` pass (grandfathered)
- [ ] `pnpm validate:records` passes (existing records grandfathered)
- [ ] `pnpm test` passes (new negative fixtures fail, grandfathered positive fixtures pass)
- [ ] `docs/artifact-concepts.md` documents the outside-reference rule

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| False positive on legitimate `docs/journals/` mention | Medium | Medium | Only scan string values; exempt fields with `_allow_outside_ref` if needed |
| Pattern too narrow (misses `docs/journals` without trailing slash) | Low | Medium | Pattern is `docs\/journals\/` which catches path references |
| Legacy ban breaks existing records | Low | High | Grep scan showed only `.deleted/` risks use `legacy:plans/reports/` and `legacy:docs/journals/` — those are already deleted in Phase 3 |
| `extractAllStrings` performance on large records | Low | Low | Records are small YAML files; overhead is negligible |
| Created_at field missing on some records | Low | Medium | Fallback to `extraction.first_extracted_at` for index entries; if both missing, grandfathered (safe default) |
