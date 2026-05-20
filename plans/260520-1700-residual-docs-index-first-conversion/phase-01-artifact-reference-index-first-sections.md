---
phase: 1
title: "Artifact-Reference Index-First Sections"
status: completed
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Artifact-Reference Index-First Sections

## Overview

Add index-first parallel sections to `docs/artifact-reference.md` for the three sections explicitly deferred at line 392: Dimension Overview, Experiment Proof mapping, and Product Decision routing. These parallel the existing claim-centric sections, making the document usable without mental translation from claim to index terminology.

## Requirements

- Functional: Three new sections that mirror the claim-centric Dimension Overview (line 9–16), Experiment Proof (line 49–65), and Product Decisions (line 67–79) sections, but describe the index-entry model instead.
- Non-functional: Each parallel section must explicitly cross-reference its frozen-legacy claim counterpart to avoid ambiguity.

## Architecture

The existing document structure is:
1. Deprecation banner (line 3) — already index-first
2. Dimension Overview (line 7–16) — claim-only
3. Claim Fields (line 18–47) — claim-only, keep as frozen-legacy reference
4. Experiment Proof (line 49–65) — claim-only
5. Product Decisions (line 67–79) — claim-only
6. Index Entry schema table (line 147–173) — already index-first

New sections insert **after** each claim-centric section, before the next claim-only section. This keeps the document's existing flow intact while adding the index-first view inline.

## Related Code Files

- Modify: `docs/artifact-reference.md`

## Implementation Steps

1. **After line 16 (Dimension Overview table)**, insert `### Dimension Overview — Index Entries`:
   - Table columns: Dimension | Status values | Extra fields | Proof authority
   - Rows mirror the claim table but use index-entry semantics:
     - `static` → `active` / `superseded` / `pending_approval`; no extra fields; derived from evidence `validation_status`
     - `install` → same statuses; `scope` field; experiment must match dimension+scope
     - `runtime` → same statuses; `scope`, `output` fields; experiment must match dimension+scope+output
     - `product` → `active` / `pending_approval` (no `approved` — index entries use `pending_approval`); decision must reference affected assertion
   - Note: "`claimed` does not exist for index entries. Unverified assertions surface as `pending_approval` when `evidence.validation_status: pending`, or are not extracted at all when `validation_status: failed`."
   - Cross-ref: "Frozen-legacy claim counterpart: [Dimension Overview](#dimension-overview) above."

2. **After line 65 (Experiment Proof section)**, insert `### Experiment Proof — Index Entries`:
   - Explain that experiments prove index-entry dimensions via `experiment_refs` on the index entry.
   - Example YAML showing an index entry's `experiment_refs` pointing to an experiment that proves `runtime` dimension.
   - Clarify that the experiment's `verification.proves` still references `claim_refs` (frozen-legacy ledger) — the index entry is a derived view, not a replacement for the experiment's own proof declaration.
   - Cross-ref: "Frozen-legacy claim counterpart: [Experiment Proof](#experiment-proof) above."

3. **After line 79 (Product Decisions section)**, insert `### Product Decisions — Index Entries`:
   - Explain that product approval for an index entry comes from a decision whose `decision_effect.affected_refs` includes the assertion's experiment or the evidence file.
   - Note that index entries do not have a `product` dimension status in the same way claims do — instead, a `pending_approval` status on an index entry with `dimension: product` signals that a decision is needed.
   - Cross-ref: "Frozen-legacy claim counterpart: [Product Decisions](#product-decisions) above."

4. **Remove the deferral note at line 392** — it is now satisfied by the new sections.

5. **Update the deprecation banner (line 3)** to remove "predominantly" — the document now has full index-first parallels for its three claim-centric operational sections.

## Success Criteria

- [ ] `docs/artifact-reference.md` has three new index-first sections after Dimension Overview, Experiment Proof, and Product Decisions
- [ ] Each section cross-references its frozen-legacy claim counterpart
- [ ] Line 392 deferral note removed
- [ ] Deprecation banner no longer says "predominantly"
- [ ] `pnpm check` passes (no schema or validation changes; doc-only)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Index-first Dimension Overview contradicts claim version | Low | Medium | Index-entry statuses (`active`/`superseded`/`pending_approval`) are explicitly different from claim statuses (`claimed`/`verified`/`rejected`/`approved`) — state the mapping, not the identity |
| Experiment-proof section confuses `experiment_refs` with `verification.proves` | Medium | Low | Explicitly state that `experiment_refs` is the index entry's pointer; `verification.proves` is the experiment's declaration — they are different directions of the same relationship |
