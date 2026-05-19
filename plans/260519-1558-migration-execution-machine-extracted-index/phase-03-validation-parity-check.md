---
phase: 3
title: "Validation Parity Check"
status: complete
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Validation Parity Check

## Overview

Verify that the new `records/index/` entries answer the same state queries the frozen claims used to answer. This is the critical correctness gate for the migration: if the index is incomplete or wrong, downstream agents will give incorrect answers when queried about system state.

## Requirements

- Functional: Every doc question previously answered by `claim-vnstock-runtime-403-root-cause` and `claim-vnstock-install-sandbox` must be answerable from `records/index/` alone.
- Non-functional: `pnpm check` passes; no validation errors; no stale index entries.

## Architecture

Parity check compares old answer paths (read claim YAML, reconcile verification blocks and SUPERSEDED notes) against new answer paths (grep `records/index/` by `capability`, `dimension`, `topic_tag`).

### Seed 1 Parity Table

| Doc Question | Old Answer Path | New Answer Path |
|---|---|---|
| "Does vnstock_data require Device-Id injection?" | Read claim verification + notes; reconcile original vs SUPERSEDED. | Grep `topic_tag: device-id-injection-*` in `records/index/` → active entry is `device-id-injection-not-required`. |
| "What's the install-dimension state of vnstock-data in sandbox?" | Read `claim.verification.install.{status, reason}`. | Grep `capability: vnstock-data AND dimension: install AND status: active` → `wrapper-config-path-root` + `vendor-compat-archived`. |
| "Is vendor_compat still needed?" | Read `claim.notes` "vendor_compat is archived". | Read `assertion-vnstock-data-install-vendor-compat-archived` → status: active, assertion text. |
| "What HOME setting does vnstock_data need at import time?" | Not directly in claim (only in `verification.install.reason` as SUPERSEDED note). | Direct entry `assertion-vnstock-data-runtime-home-env-for-api-key` → answered self-contained. |
| "What's the FastAPI Reference product-dimension status?" | `claim.verification.product.status = claimed`. | **Not covered by index** — product dimension is a decision-record concern. Agent reads `records/decisions/` instead. |

Last row is the intended gap: product-dimension state intentionally lives in decisions, not in the index. The agent learns to route product queries to decisions.

### Seed 2 Parity Table

| Doc Question | Old Answer Path | New Answer Path |
|---|---|---|
| "Can vnstock_data be installed in sandbox?" | Read `claim.verification.install.status = verified`. | Grep `capability: vnstock-data AND dimension: install AND status: active` → read active install assertions. |
| "Is the bootstrap script idempotent?" | Read `claim.limitations` (buried in a list). | Direct grep `topic_tag: bootstrap-idempotent` in `records/index/`. |
| "Does the installer create its own venv?" | Read `claim.limitations` (buried). | Direct grep `topic_tag: installer-venv-creation` or similar. |
| "Are device IDs deterministic across containers?" | Read `claim.limitations`. | Direct grep `topic_tag: device-id-determinism` or similar. |
| "What is the actual vendor device tier/limit?" | Read `claim.limitations` (RETROSPECTIVE note). | Direct grep `topic_tag: device-tier-bronze-one-limit` or similar. |
| "Can I do a direct pip install from the vendor index?" | Read `claim.limitations`. | Direct grep `topic_tag: direct-pip-not-viable` or similar. |

## Related Code Files

- Read: `records/claims/claim-vnstock-runtime-403-root-cause.yaml`
- Read: `records/claims/claim-vnstock-install-sandbox.yaml`
- Read: `records/index/*.yaml` (newly created)
- Read: `records/decisions/decision-20260511T003000Z-product-approval-vnstock-reference-slice.yaml`

## Implementation Steps

1. **Validate all index entries against schema.**
   ```bash
   pnpm validate:records
   ```
   Every file in `records/index/` must pass `index-entry.schema.json`.

2. **Verify Seed 1 supersession pair.**
   - Read `records/index/assertion-vnstock-data-runtime-device-id-injection-required.yaml`
     - Confirm `status: superseded`
     - Confirm `superseded_by: assertion-vnstock-data-runtime-device-id-injection-not-required`
   - Read `records/index/assertion-vnstock-data-runtime-device-id-injection-not-required.yaml`
     - Confirm `status: active`
     - Confirm `supersedes` array includes the old assertion id
   - Confirm `n_count: 1` on both entries (or whatever the tool computed from merged source refs)

3. **Run Seed 1 doc-question parity check.**
   For each row in the Seed 1 parity table above, perform the "New Answer Path" grep/read and confirm the answer matches the expected result. Record any mismatch.

4. **Run Seed 2 doc-question parity check.**
   For each row in the Seed 2 parity table, grep `records/index/` by `capability: vnstock-data` + relevant `topic_tag` and confirm the assertion text answers the question. If a topic_tag is missing or unclear, note it as a coverage gap.

5. **Verify Mechanism 2 Scope A (frozen claim vs index).**
   Confirm that no new extracted assertion contradicts a frozen claim without being accounted for. If a contradiction exists and was not caught by the tool's hard-stop, flag it manually.

6. **Check evidence-to-extraction fidelity (Mechanism 2 Scope B).**
   For each source evidence file, verify the `evidence_immutable_hash` in its corresponding index entry matches the current file hash. If not, the evidence was edited post-extraction and must be re-extracted.
   ```bash
   pnpm extract:index
   ```

## Success Criteria

- [ ] `pnpm validate:records` passes with zero errors on `records/index/` files.
- [ ] Seed 1 supersession pair: old → `superseded`, new → `active`, cross-references correct.
- [ ] Seed 1 parity table: all 5 doc questions answerable from index (or correctly routed to decisions).
- [ ] Seed 2 parity table: all install/runtime assertions answerable from index via grep.
- [ ] Product-dimension query correctly routes to decisions, not index.
- [ ] No unaccounted contradictions between frozen claims and new index entries.
- [ ] All `evidence_immutable_hash` values match current source files.

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Parity check reveals missing assertions | Add `## Findings` to the relevant evidence file, re-extract, re-check |
| Evidence hash mismatch after edits | Re-run `pnpm extract:index` to regenerate entries with updated hashes |
| Frozen claim has assertion not covered by any evidence | Lazy migration — note gap, defer until that topic is next touched |

## Next Steps

After this phase completes, proceed to Phase 4 (commit and review).