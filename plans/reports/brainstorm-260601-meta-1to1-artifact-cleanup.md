---
date: "2026-06-01T13:53:00Z"
tags: [brainstorm, meta, artifact-philosophy, 1to1, index-entry, cleanup]
---

# Meta Surface 1:1 Artifact Cleanup

## Problem

The `records/meta/` surface has accumulated overlapping artifacts. The current state:

- **96 index entries** (`records/meta/index/`) — machine-extracted assertions from evidence
- **28 evidence files** (`records/meta/evidence/`) — raw material that was extracted into index entries
- **1 deprecated claim** (`records/meta/claims/`) — frozen-legacy, superseded by index entries
- **2 `.deleted/` risk versions** — stale soft-deleted artifacts

The 1:1 artifact philosophy means: one canonical artifact per concept. The index entry is the canonical artifact. The evidence file is the raw material — once extracted, it is redundant.

## What We Decided

1. **1:1 artifact philosophy** — the index entry is the single artifact. Evidence files are temporary scaffolding.
2. **Delete ALL evidence files in `records/meta/evidence/`** — all 28 files have been extracted.
3. **Delete the deprecated claim** — `claim-meta-loop-capabilities-stack-allowlist` is superseded.
4. **Delete the `.deleted/` folder** — soft-deleted records are no longer needed.
5. **Order matters** — first update all index entries to use `self:` prefix in `source_refs`, then delete the evidence files.

## Evaluated Approaches

| Approach | Pros | Cons |
|----------|------|------|
| A. Delete evidence first, then fix index entries | Direct | Validation breaks between steps |
| B. Fix index entries first (`self:` prefix), then delete evidence | Zero downtime for validation | Requires bulk update |
| C. Keep evidence files | No change | Violates 1:1 philosophy |
| D. Move evidence to `.archived/` | Preserves audit | Still redundant |

**Selected: Approach B** — update index entries first, then delete evidence.

## Implementation

### Phase 1: `self:` prefix support

- Update `source-ref-validator.js` to recognize `self:` prefix (skip existence check)
- Update `index-entry.schema.json` `source_refs` pattern to allow `self:` prefix
- Update `record-validation-rules.js` if needed
- Test: `pnpm validate:records` passes with `self:` refs

### Phase 2: Bulk index entry update

- Update all 96 `records/meta/index/*.yaml` entries to replace `local:` refs with `self:` prefix
- The `self:` prefix means: this assertion stands on its own, no external evidence needed
- Test: `pnpm validate:records` passes

### Phase 3: Evidence deletion

- Delete all 28 files in `records/meta/evidence/`
- Delete `records/meta/claims/claim-meta-loop-capabilities-stack-allowlist.yaml`
- Delete `records/meta/risks/.deleted/` folder (2 files)
- Test: `pnpm validate:records` passes

### Phase 4: Extend `record_delete` MCP tool

- Add `evidence` and `claim` to `record_type` enum
- Hard-delete for evidence (not audit records)
- Hard-delete for claims (frozen-legacy)
- Test: `pnpm test` passes

## New: Outside Reference Block (New Phase)

### Problem

Agents bypass the `local:` root restriction by using `legacy:` prefix to reference `docs/journals/` and `plans/reports/` in records. This violates the 1:1 artifact philosophy and the loop boundary.

### What We Decided

- Any mention of `docs/journals/` or `plans/reports/` in any record field is blocked for new records.
- `legacy:` refs to `docs/` or `plans/` are banned entirely (no grandfathering).
- Only new records (created_at >= 2026-06-01) are affected — existing records are grandfathered.
- Error message: "Use record: refs to decisions/experiments/index entries instead of external docs."

### Implementation

**New Validation Layer: "Outside Reference Block"**

Add to `record-validation-rules.js` (Layer 2 or new Layer 5):

```js
// Outside Reference Block — agents must internalize docs/plans findings into records/
const OUTSIDE_PATTERNS = [
  /docs\/journals\//,
  /plans\/reports\//,
];

function validateOutsideReferences(record) {
  const errors = [];
  const strings = extractAllStrings(record);
  for (const str of strings) {
    if (OUTSIDE_PATTERNS.some(p => p.test(str))) {
      errors.push(`${record.__file}: references outside-artifact "${str}". ` +
        `Internalize findings into records/<surface>/evidence/ or records/<surface>/index/ and reference via record: or local: (allowed roots only).`);
    }
  }
  return errors;
}
```

**Legacy: Ref Ban**

In `source-ref-validator.js`:
```js
if (ref.startsWith("legacy:")) {
  const legacyPath = ref.slice("legacy:".length);
  if (legacyPath.includes("docs/") || legacyPath.includes("plans/")) {
    return { valid: false, error: `legacy: refs to docs/ or plans/ are banned. Use record: refs to internalized records instead.` };
  }
  return { valid: true, deprecated: true };
}
```

### Grandfathering
- Only apply `outside-reference` block to records with `created_at >= 2026-06-01`
- Legacy ban applies to ALL records (no grandfathering)

### Scope
- Records AND evidence files (any file under `records/`)
- `docs/journals/` and `plans/reports/` only
- All string fields (recursively scanned)

### Evidence File Impact
Evidence files (`records/<surface>/evidence/*.md`) are also subject to the outside-reference block. If an evidence file contains a `local:` or `legacy:` ref to `docs/` or `plans/`, it fails validation. The correct process is: extract the relevant content from the external artifact, write it into the evidence file itself, and reference the evidence file via `local:` (allowed roots only).

## Risks

- **Dangling references in other records** — some non-meta records may reference `records/meta/evidence/` via `local:` source refs. Need to check before deleting.
- **Validation gaps** — `self:` prefix might not be validated by all layers. Need to verify all 4 layers.
- **Git history** — evidence files are deleted, not moved. Git history preserves them.
- **Outside reference false positives** — some records may legitimately mention `docs/journals/` in a blocked_actions list. Need to tune the pattern.

## Success Criteria

- `records/meta/evidence/` is empty
- `records/meta/claims/` is empty
- `records/meta/risks/.deleted/` is empty
- `pnpm validate:records` passes
- `pnpm test` passes
- 96 index entries remain, all with `self:` refs

## Next Steps

`/ck:plan --tdd` — schema changes are low-risk but the validator is critical.
