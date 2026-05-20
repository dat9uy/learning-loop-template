---
phase: 4
title: "Acceptance Validation"
status: completed
priority: P2
effort: "30m"
dependencies: ["1", "2", "3"]
---

# Phase 4: Acceptance Validation

## Overview

Run grep-based validation and cross-document consistency checks to verify that all acceptance criteria from the plan are met. No code or doc changes — pure verification.

## Requirements

- Functional: All four acceptance criteria from `plan.md` pass.
- Non-functional: Validation commands must be deterministic and reproducible.

## Architecture

Validation is grep-based. Four checks corresponding to the four acceptance criteria:

1. **No live claim references**: Grep for "claims" in docs (excluding `records/claims/` and deprecation-banner contexts) — every hit must be qualified as "frozen-legacy" or be a verb/idiom/field-name use.
2. **_KIND.md exists**: File existence check.
3. **`pnpm check` passes**: Existing validation pipeline.
4. **Cross-document consistency**: Manual spot-check of index-first routing language across the four docs modified in Phase 1 and Phase 2, plus `docs/philosophy.md` and `docs/operator-guide.md` (already converted in Plan 4).

## Related Code Files

- Read: `docs/artifact-reference.md`
- Read: `docs/charter.md`
- Read: `docs/record-system-architecture.md`
- Read: `docs/problem-classification.md`
- Read: `docs/red-team-review.md`
- Read: `docs/vendor-vnstock-installer.md`
- Read: `records/evidence/vnstock-data/unified-ui-snapshot/_KIND.md`

## Implementation Steps

1. **Grep for unqualified "claims" in docs**:
   ```bash
   grep -rn "claims" docs/ --include="*.md" | grep -v "frozen-legacy" | grep -v "claim_refs" | grep -v "claim.verification" | grep -v "Deprecation" | grep -v "deprecated"
   ```
   Review each hit. If any hit is a record-type reference without frozen-legacy qualifier, flag as failure.

2. **Check _KIND.md exists**:
   ```bash
   test -f records/evidence/vnstock-data/unified-ui-snapshot/_KIND.md && echo "OK" || echo "FAIL"
   ```

3. **Run `pnpm check`**:
   ```bash
   pnpm check
   ```

4. **Cross-document consistency check**: Read the index-first routing statements in:
   - `docs/artifact-reference.md` (Phase 1 changes)
   - `docs/record-system-architecture.md` (Phase 2 changes)
   - `docs/philosophy.md` (already converted — verify still consistent)
   - `docs/operator-guide.md` (already converted — verify still consistent)
   Confirm they all route to `records/index/` first and describe claims as frozen-legacy audit trail.

5. **Report results**: Summarize pass/fail for each criterion.

## Success Criteria

- [ ] Grep finds zero unqualified record-type "claims" references in docs (excluding verb/idiom, field-name, and deprecation-banner contexts)
- [ ] `_KIND.md` exists and names class as `vendor-documentation-snapshot`
- [ ] `pnpm check` passes
- [ ] Cross-document index-first routing language is consistent across artifact-reference, record-system-architecture, philosophy, and operator-guide

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Grep false positives (verb/idiom "claim" matches) | Medium | Low | Manually review each hit; only flag record-type uses |
| Grep false negatives (variant phrasing like "a claim's dimension" that should be qualified) | Low | Medium | Use broader grep patterns; review all hits, not just exact-word matches |
