---
phase: 2
title: "Seed 2 Install Sandbox Migration"
status: complete
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Seed 2 Install Sandbox Migration

## Overview

Migrate `claim-vnstock-install-sandbox` into atomic extracted assertions. This seed is intentionally fuzzier than Seed 1 — the claim touches install, runtime, and product dimensions with medium confidence and many limitations. It stress-tests whether the one-file-one-dimension rule holds and whether cross-dimension bullets are caught by the extraction tool.

## Requirements

- Functional: Atomic assertions extracted from evidence files that currently lack `## Findings`.
- Non-functional: Multi-dimensional assertions properly separated into per-dimension evidence files. Cross-dimension bullets caught before extraction.

## Architecture

`claim-vnstock-install-sandbox.yaml` bundles assertions across four verification dimensions. The claim's `verification` block and `limitations` list contain the raw assertions to extract.

Key assertions to extract:

| Assertion | Dimension | Source |
|-----------|-----------|--------|
| Vendor one-liner completes with requests pre-installed and free device slot. | install | claim.verification.install.reason |
| Bootstrap script idempotency confirmed in product. | install | claim.verification.install.reason |
| Installer unconditionally creates venv at `$HOME/.venv`. | install | claim.limitations |
| vnai does NOT need pre-install in substrate; installer handles it. | install | claim.limitations |
| Direct pip install from vendor index is not viable. | install | claim.limitations |
| Device IDs are not deterministic across container instances. | install | claim.limitations |
| Vendor installer falsely claims "Golden package, 2 devices"; actual tier is Bronze with 1-device limit. | install | claim.limitations |
| 6 API surfaces (Reference, Market, Fundamental, Insights, Macro) executed live with metadata-only capture. | runtime | claim.verification.runtime.reason |
| Product scoped Reference slice approved by decision record. | product | claim.verification.product |

The product-dimension assertion (Reference slice approval) is a decision-record concern per item 5 of the brainstorm. It does **not** belong in the index — agents route product queries to `records/decisions/` instead.

## Related Code Files

- Modify: `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md` — add `## Findings` (if frontmatter missing, backfill)
- Modify: `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md` — add `## Findings`
- Modify: `records/evidence/vnstock-data/experiment-install-20260509T071800Z-sandbox-1.md` — add `## Findings`
- Modify: `records/evidence/vnstock-data/experiment-install-full-20260514T140811Z.md` — add `## Findings`
- Modify: `records/evidence/vnstock-data/experiment-install-bootstrap-substrate-20260513T182621Z.md` — add `## Findings`
- Create (maybe): companion files for assertions that don't fit the source evidence's declared dimension
- Read for context: `records/claims/claim-vnstock-install-sandbox.yaml`
- Read for context: `records/evidence/vnstock-data/capability-runtime-output.md`

## Implementation Steps

1. **Audit existing evidence files for frontmatter completeness.**
   Read each evidence file cited by the claim. Check for `capability`, `dimension`, `scope`, `validation_status`. If missing, backfill using sibling files in `records/evidence/vnstock-data/` as inference source.

2. **Write `## Findings` into install-dimension evidence files.**
   Target files with `dimension: install` (or backfill to install):
   - `experiment-install-20260508T101723Z.md` — one-liner install path
   - `experiment-install-20260508T171112Z.md` — sandbox install verification
   - `experiment-install-20260509T071800Z-sandbox-1.md` — bootstrap script idempotency
   - `experiment-install-full-20260514T140811Z.md` — full install with device registration
   - `experiment-install-bootstrap-substrate-20260513T182621Z.md` — substrate preparation

   Each `## Findings` bullet must carry a `[topic-tag]` and be atomic. Example for idempotency:
   ```markdown
   ## Findings

   - [bootstrap-idempotent] The `product/api/scripts/install-vnstock.sh` bootstrap script is idempotent: it skips installation when vnstock_data is already importable.
     - Context: Verified in product/api sandbox venv on 2026-05-09.
   ```

3. **Write `## Findings` into runtime-dimension evidence files.**
   Target: `capability-runtime-output.md` (if it has `dimension: runtime` frontmatter or gets backfilled).
   Extract the runtime assertion about 6 live API surfaces.

4. **Handle product-dimension assertion.**
   The product assertion ("Reference slice approved") lives in decision records, not index. Verify `records/decisions/decision-20260511T003000Z-product-approval-vnstock-reference-slice.yaml` exists and is readable. Do **not** write a `## Findings` bullet for it.

5. **Preemptively split cross-dimension bullets.**
   Any evidence file that contains assertions of a different dimension than its frontmatter declares must be split into a companion file before extraction. Example: if an install-dimension file mentions runtime behavior, extract that bullet into a runtime-dimension companion.

6. **Run extraction tool.**
   ```bash
   pnpm extract:index
   ```
   Tool may hard-stop on drift detection between new assertions and frozen claim. Resolve per Mechanism 2 Scope A.

## Success Criteria

- [ ] All install-dimension evidence files that support the claim have `## Findings` with atomic tagged bullets.
- [ ] Runtime-dimension evidence has `## Findings` for the live API surface assertion.
- [ ] Product-dimension assertion is verified to exist in decisions, not extracted into index.
- [ ] No cross-dimension bullets remain in single-dimension evidence files (tool does not error on them).
- [ ] `pnpm extract:index` produces index entries for all install and runtime assertions.
- [ ] `pnpm check` passes (all index entries + unchanged files validate).

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Claim bundles too many assertions; evidence files proliferate | Acceptable — each assertion gets one file; the old claim was the bundle problem |
| Cross-dimension bullets missed during manual split | Extraction tool errors and refuses; fix by splitting into companion file |
| Evidence files lack frontmatter; tool skips them | Audit step 1 catches this; backfill before writing `## Findings` |
| Product-dimension assertion accidentally extracted | Explicitly route to decisions in step 4; verify decision record exists |

## Next Steps

After this phase completes and `pnpm check` passes, proceed to Phase 3 (validation and parity check).