---
phase: 3
title: "Evidence Deletion"
status: pending
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Evidence Deletion

## Overview

Delete all 28 evidence files in `records/meta/evidence/`, the deprecated claim in `records/meta/claims/`, and the 2 stale `.deleted/` risk versions. This is the third step of Approach B: after index entries have `self:` refs, the evidence files are redundant and safe to delete.

## Requirements

- **Functional:** `records/meta/evidence/` is empty
- **Functional:** `records/meta/claims/claim-meta-loop-capabilities-stack-allowlist.yaml` is deleted
- **Functional:** `records/meta/risks/.deleted/` is empty
- **Non-functional:** `pnpm validate:records` passes after all deletions
- **Non-functional:** `pnpm test` passes after all deletions
- **Non-functional:** No non-meta records have dangling `local:records/meta/evidence/...` refs

## Architecture

### Prerequisite: Scan for dangling references

Before deleting any evidence file, scan ALL records (not just meta) for `local:records/meta/evidence/` references. The Grep search showed these references exist in:
- `records/meta/decisions/*.yaml` (multiple files, including `source_refs` and `decision_effect.affected_refs`)
- `records/meta/experiments/*.yaml` (2 files)
- `records/meta/index/*.yaml` (should be fixed by Phase 2)
- `records/meta/claims/*.yaml` (1 file — being deleted)
- `records/meta/risks/*.yaml` (1 file)
- `records/product/experiments/*.yaml` (1 file)
- `records/vnstock/decisions/*.yaml` (1 file)
- `records/vnstock/experiments/*.yaml` (multiple files)

**Critical finding:** `decision_effect.affected_refs` in meta decisions also contains `local:records/meta/evidence/...` paths (e.g., `decision-meta-260512T0046Z-loop-meta-evidence-gap-revisit.yaml` lines 30-32). These are NOT `source_refs` — they are in a separate `affected_refs` array. The plan must scan ALL fields, not just `source_refs`.

These non-meta refs must be re-routed before evidence deletion. Options:
- Replace with `record:` ref to the relevant index entry (semantic upgrade — `affected_refs` currently holds plain paths, upgrading to `record:` refs is acceptable)
- Replace with `self:` if the record itself is canonical
- Delete the reference if it is no longer relevant
- For `decision_effect.affected_refs`, replace with `record:` refs to the relevant index entries

### Deletion approach

Evidence files are not audit records (unlike decisions/experiments/risks). They can be hard-deleted. Git history preserves them.

1. `rm records/meta/evidence/*.md` (28 files)
2. `rm records/meta/claims/claim-meta-loop-capabilities-stack-allowlist.yaml`
3. `rm -rf records/meta/risks/.deleted/`

## Related Code Files

- **Delete:** `records/meta/evidence/*.md` (28 files)
- **Delete:** `records/meta/claims/claim-meta-loop-capabilities-stack-allowlist.yaml`
- **Delete:** `records/meta/risks/.deleted/*.yaml` (2 files)
- **Modify:** Non-meta records with dangling refs (see list below)
- **Modify:** `docs/artifact-concepts.md` (document that evidence is temporary scaffolding)

### Non-meta records with dangling refs to delete

From Grep scan, these need re-routing before Phase 3:

| File | Ref | Action |
|------|-----|--------|
| `product/experiments/experiment-product-macro-cook-no-loop-20260522T055121Z.yaml` | `local:records/meta/evidence/skill-template-gap-260520T2133Z.md` | Replace with `record:assertion-meta-static-skill-template-gaps` |
| `vnstock/decisions/decision-vnstock-20260510T170623Z-installer-bootstrap.yaml` | `local:records/meta/evidence/capabilities-stack-migration.md` | Replace with `record:assertion-meta-static-capability-generation` or delete if superseded |
| `meta/risks/risk-meta-loop-capability-allowlist-overreach.yaml` | `local:records/meta/evidence/capability-allowlist-deferred-axes.md` | Replace with `record:assertion-meta-static-capability-allowlist` |
| `meta/claims/claim-meta-loop-capabilities-stack-allowlist.yaml` | `local:records/meta/evidence/capability-allowlist-deferred-axes.md` | File being deleted; no action needed |

**Note:** `legacy:docs/journals/...` and `legacy:plans/reports/...` refs in non-meta records are NOT `local:records/meta/evidence/` refs and are NOT blocked by Phase 3. They will be handled by Phase 5 (Outside Reference Block) and are grandfathered.

## Implementation Steps

1. **Re-route dangling refs:** Update non-meta records (see table above) to replace `local:records/meta/evidence/...` with `record:assertion-meta-*` or remove the reference
2. **Verify no dangling refs:** `grep -r "local:records/meta/evidence/" records/` — expect zero results
3. **Delete evidence:** `rm records/meta/evidence/*.md`
4. **Delete deprecated claim:** `rm records/meta/claims/claim-meta-loop-capabilities-stack-allowlist.yaml`
5. **Delete `.deleted/`:** `rm -rf records/meta/risks/.deleted/`
6. **Validate:** `pnpm validate:records` — must pass
7. **Test:** `pnpm test` — must pass
8. **Commit:** `git add records/` and commit the deletions

## Success Criteria

- [ ] `records/meta/evidence/` is empty (28 files deleted)
- [ ] `records/meta/claims/` is empty (1 file deleted)
- [ ] `records/meta/risks/.deleted/` is empty (2 files deleted, folder removed)
- [ ] No record anywhere references `local:records/meta/evidence/`
- [ ] `pnpm validate:records` passes
- [ ] `pnpm test` passes
- [ ] Git history shows all deletions (not git-ignored)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Missed dangling reference breaks validation | Medium | Critical | Two-pass grep: before re-route and after deletion |
| Evidence file needed for future extraction | Low | Low | Git history preserves all files; index entries are canonical |
| Deleting `.deleted/` removes audit trail | Low | Medium | `.deleted/` already contains stale risks; gate log still records |
| Non-meta records have undetected evidence refs | Medium | High | `grep -r "local:records/meta/evidence/" records/` is mandatory |
