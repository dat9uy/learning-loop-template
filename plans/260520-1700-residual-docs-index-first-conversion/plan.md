---
title: "Residual Docs Index-First Conversion (G4 + G5 + G7)"
description: "Close three documentation gaps from the machine-extracted-index brainstorm: (G4) artifact-reference.md half-converted to index-first, (G5) five docs still reference claims as live, (G7) vendor-doc snapshot mislabelled as evidence. All editorial — no runtime behavior changes."
status: completed
priority: P2
branch: "main"
tags: [machine-extracted-index, docs, index-first, editorial]
blockedBy: ["260519-2326-docs-canonicalization-machine-extracted-index"]
blocks: []
created: "2026-05-20T08:40:01.949Z"
createdBy: "ck:plan"
source: skill
---

# Residual Docs Index-First Conversion (G4 + G5 + G7)

## Overview

Three editorial gaps left after Plans 1–5 of the machine-extracted-index brainstorm:

- **G4** — `docs/artifact-reference.md` is still predominantly claim-centric. The deprecation banner and index-entry schema table exist, but the Dimension Overview, Experiment Proof, and Product Decisions sections have no index-first parallels. The note at line 392 explicitly defers them as "a future documentation enhancement." This plan delivers that enhancement.
- **G5** — Five docs still reference claims as live artifacts without the frozen-legacy qualifier: `charter.md` (2), `record-system-architecture.md` (5 live refs out of 12 total), `problem-classification.md` (4), `red-team-review.md` (7), `vendor-vnstock-installer.md` (2 file refs). Each must be evaluated: rewrite to index-first, qualify as frozen-legacy, or preserve as verb/idiom.
- **G7** — `records/evidence/vnstock-data/unified-ui-snapshot/` is a vendor-doc snapshot, not human-authored findings. Add a `_KIND.md` marker. No territory restructure.

All changes are documentation-only. No runtime behavior, schema, or code changes.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Artifact-Reference Index-First Sections](./phase-01-artifact-reference-index-first-sections.md) | Completed |
| 2 | [Ledger Docs Claim-To-Index Conversion](./phase-02-ledger-docs-claim-to-index-conversion.md) | Completed |
| 3 | [Vendor Snapshot Kind Marker](./phase-03-vendor-snapshot-kind-marker.md) | Completed |
| 4 | [Acceptance Validation](./phase-04-acceptance-validation.md) | Completed |

## Dependencies

- **Blocked by:** `260519-2326-docs-canonicalization-machine-extracted-index` (Plan 4 — philosophy + operator-guide + artifact-reference partially converted). Status: **completed**.
- Plan 5 not required (enforcement gaps are code-level; this plan is editorial-only).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Index-first parallel sections in artifact-reference.md duplicate or contradict claim sections | Low | Medium | Parallel sections explicitly reference "frozen-legacy claim counterpart" where applicable |
| Claim-to-index word replacements in red-team-review.md lose adversarial-review intent | Medium | Medium | Preserve "claim" where it means "assertion under challenge" (verb/idiom); only replace where "claim" means the record type |
| Vendor snapshot _KIND.md gets missed by future extraction tool | Low | Low | Extraction tool already ignores files without `## Findings`; marker is conceptual documentation, not mechanical enforcement |

## Acceptance Criteria

1. No doc outside `records/claims/` and deprecation-banner contexts says claims are the primary state store.
2. `records/evidence/vnstock-data/unified-ui-snapshot/_KIND.md` exists and names the subtree's true class.
3. `pnpm check` passes.
4. Cross-document references between philosophy, operator-guide, artifact-reference, and record-system-architecture remain consistent on the index-first routing rule.
