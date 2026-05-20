---
phase: 2
title: "Ledger Docs Claim-To-Index Conversion"
status: completed
priority: P2
effort: "3h"
dependencies: []
---

# Phase 2: Ledger Docs Claim-To-Index Conversion

## Overview

Convert live claim references in five docs to index-first language. Each reference must be evaluated: rewrite to index-first, qualify as frozen-legacy, or preserve as verb/idiom. The key distinction: "claim" meaning the record type (needs qualification) vs. "claim" as a verb/idiom meaning "assertion under challenge" (preserve for adversarial tone).

## Requirements

- Functional: No doc outside `records/claims/` and deprecation-banner contexts says claims are the primary state store without the frozen-legacy qualifier.
- Non-functional: Preserve adversarial-review tone in `red-team-review.md`; preserve field names (`claim_refs`, `claim.verification.*`); preserve historical file references.

## Architecture

### Classification Rules

| Context | Action | Example |
|---------|--------|---------|
| "claim" = record type, used as current primary store | Rewrite to "index entry" or "frozen-legacy claim" | "claims, experiments, decisions" → "frozen-legacy claims, experiments, decisions" |
| "claim" = verb/idiom ("assertion under challenge") | Preserve as-is | "A claim with a weak experiment" |
| "claim" = field name in YAML/schema | Preserve as-is | `claim_refs`, `claim.verification.*` |
| "claim" = specific frozen-legacy file reference | Add frozen-legacy qualifier | `records/claims/claim-foo.yaml` → keep path, add "frozen-legacy" before |
| "claim" in provenance chain | Insert index entry | "evidence → claim → experiment" → "evidence → index entry → experiment" |

## Related Code Files

- Modify: `docs/charter.md`
- Modify: `docs/record-system-architecture.md`
- Modify: `docs/problem-classification.md`
- Modify: `docs/red-team-review.md`
- Modify: `docs/vendor-vnstock-installer.md`

## Implementation Steps

### charter.md (2 references)

1. **Line 13**: `"a small typed record ledger (claims, risks, experiments, decisions, capability records, observations)"` → `"a small typed record ledger (frozen-legacy claims, index entries, risks, experiments, decisions, capability records, observations)"`
2. **Line 45**: `"source YAML records (claims, risks, experiments, decisions, capability records, observations)"` → `"source YAML records (frozen-legacy claims, index entries, risks, experiments, decisions, capability records, observations)"`

### record-system-architecture.md (5 live references)

Already partially converted (lines 14, 31, 59 correctly describe index-first and frozen-legacy claims). Fix remaining:

3. **Line 7**: `"They describe claims, experiments, decisions, risks, capability records, and observations"` → `"They describe frozen-legacy claims, index entries, experiments, decisions, risks, capability records, and observations"`
4. **Line 19**: `"Maps verified library surfaces (claims) to product surfaces"` → `"Maps verified library surfaces (index entries or frozen-legacy claims) to product surfaces"`
5. **Line 23**: `"Derived claim assurance"` — this is a claim-specific concept that still exists for the frozen-legacy ledger. Add qualifier: `"Derived claim assurance (frozen-legacy claims only)"`
6. **Line 127**: `"Record status | claims, experiments, decisions, capability records"` → `"Record status | frozen-legacy claims, index entries, experiments, decisions, capability records"`
7. **Line 144**: `"The loop reads the record ledger (claims, experiments, decisions, capability records)"` → `"The loop reads the record ledger (index entries, frozen-legacy claims, experiments, decisions, capability records)"` and `"verified library claim"` → `"verified library surface (index entry or frozen-legacy claim)"`

### problem-classification.md (4 references)

8. **Line 9**: `"which claim dimension is blocked"` → `"which index-entry dimension (or frozen-legacy claim dimension) is blocked"`
9. **Line 19**: `"A claim dimension that was previously \`verified\` now fails on re-check."` → `"An index-entry dimension (or frozen-legacy claim dimension) that was previously \`active\` (or \`verified\`) now fails on re-check."`
10. **Line 69**: `"Create a new Claim for every bug | Use Experiment \`rejects\` against existing Claim | Claims are assertions to verify"` → `"Create a new index entry for every bug | Use Experiment \`rejects\` against existing index entry | Index entries are assertions to verify"`
11. **Line 76**: `"cite evidence and affected claim refs"` → `"cite evidence and affected index-entry or claim refs"`

### red-team-review.md (7 references — nuanced)

12. **Line 9**: `"A claim with a weak experiment"` — verb/idiom (assertion under challenge). **Preserve.**
13. **Line 21**: `"Before updating a claim dimension"` — record-type reference. → `"Before updating a frozen-legacy claim dimension or index-entry dimension"`
14. **Line 24**: `"Do the \`record_ref\` claims cover the required dimensions?"` — record-type reference. → `"Do the \`record_ref\` index entries (or frozen-legacy claims) cover the required dimensions?"`
15. **Line 34**: `"does the cited evidence actually support the claim"` — verb/idiom. **Preserve.**
16. **Line 43**: `"\`claim_refs\`"` — field name. **Preserve.**
17. **Line 44**: `"evidence → claim → experiment → decision chain"` — provenance chain. → `"evidence → index entry → experiment → decision chain (frozen-legacy: evidence → claim → experiment → decision)"`
18. **Line 79**: `"relying on a claim"` — verb/idiom. **Preserve.**
19. **Line 88**: `"A claim's strongest dimension is promoted"` — record-type reference. → `"A frozen-legacy claim's strongest dimension is promoted (or an index entry's status shifts to \`active\`)"`
20. **Line 105**: `"which claim, experiment, decision"` — record-type reference in review output section. → `"which index entry (or frozen-legacy claim), experiment, decision"`

### vendor-vnstock-installer.md (2 references)

21. **Line 14**: `"records/claims/claim-vnstock-runtime-403-root-cause.yaml"` — historical file reference. Add frozen-legacy qualifier: `"frozen-legacy records/claims/claim-vnstock-runtime-403-root-cause.yaml"`
22. **Line 26**: Same file reference, same treatment: add `"frozen-legacy"` qualifier before the path.

## Success Criteria

- [ ] charter.md: both claim references now include "frozen-legacy" and "index entries"
- [ ] record-system-architecture.md: all 5 live references converted
- [ ] problem-classification.md: all 4 references converted to index-first
- [ ] red-team-review.md: record-type references converted; verb/idiom and field-name uses preserved
- [ ] vendor-vnstock-installer.md: both file references qualified as frozen-legacy
- [ ] `pnpm check` passes

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Over-converting verb/idiom "claim" in red-team-review.md loses adversarial tone | Medium | Medium | Explicitly preserve verb/idiom uses; only convert record-type references. The classification table above distinguishes each case. |
| Adding "frozen-legacy" qualifier to vendor-vnstock-installer.md makes historical references harder to read | Low | Low | The qualifier is a single word prefix; the path remains intact for grep/searchability. |
| record-system-architecture.md line 19 "claims" in capability record context — "index entries or frozen-legacy claims" is verbose | Low | Low | Acceptable — the capability record's `maps[]` may reference either, so disjunction is accurate. |
