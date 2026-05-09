---
phase: 1
title: "Record-layer migration"
status: completed
priority: P1
effort: "45m"
dependencies: []
---

# Phase 1: Record-layer migration

## Overview

Create per-run experiment YAMLs for the two existing evidence MDs (run-1 101723Z, run-2 171112Z), rename the existing single experiment YAML to a timestamped form scoped to run-1, and update the claim's top-level `evidence_refs` to include run-2. Per D1 (immutability), the existing YAML becomes run-1's frozen artifact; run-2 gets its own.

## Requirements

- Functional: two per-run experiment YAMLs exist with correct `source_refs`, `result: inconclusive`, `result_reason` disambiguated
- Non-functional: no in-place edits to the original `experiment-vnstock-install-sandbox.yaml`; rename + create new files only

## Architecture

```
records/evidence/vnstock-data/experiment-install-20260508T101723Z.md
  └──→ records/experiments/experiment-vnstock-install-20260508T101723Z.yaml
        (renamed from existing, scoped to run-1)

records/evidence/vnstock-data/experiment-install-20260508T171112Z.md
  └──→ records/experiments/experiment-vnstock-install-20260508T171112Z.yaml
        (new, R-Q3 Structuring mode: post-hoc hypothesis/success_metrics)

records/claims/claim-vnstock-install-sandbox.yaml
  └──→ evidence_refs: [run-1, run-2]
  └──→ notes: forward pointer to decision (if Phase 2 decision already exists)
```

## Related Code Files

- **Create:** `records/experiments/experiment-vnstock-install-20260508T101723Z.yaml` (from existing, renamed)
- **Create:** `records/experiments/experiment-vnstock-install-20260508T171112Z.yaml` (new, from run-2 evidence)
- **Modify:** `records/claims/claim-vnstock-install-sandbox.yaml` (`evidence_refs` + `notes`)
- **Rename:** `records/experiments/experiment-vnstock-install-sandbox.yaml` → `experiment-vnstock-install-20260508T101723Z.yaml`

## Implementation Steps

1. Read `records/experiments/experiment-vnstock-install-sandbox.yaml` and `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md`
2. Rename existing experiment YAML to `experiment-vnstock-install-20260508T101723Z.yaml`; update `id` and scope `source_refs` to run-1 only
3. Read `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md`
4. Create `experiment-vnstock-install-20260508T171112Z.yaml` with `result: inconclusive`, `result_reason: "blocked-by-vendor-device-limit"`, `source_refs` pointing to run-2 evidence
5. Update `claim-vnstock-install-sandbox.yaml`: append run-2 evidence to `evidence_refs`; if Phase 2 decision exists, add forward pointer in `notes`

## Success Criteria

- [x] `records/experiments/experiment-vnstock-install-20260508T101723Z.yaml` exists with run-1-scoped `id` and `source_refs`
- [x] `records/experiments/experiment-vnstock-install-20260508T171112Z.yaml` exists with run-2 evidence and `result: inconclusive`
- [x] Claim `evidence_refs` includes both run-1 and run-2 evidence
- [x] No in-place edits to the original `experiment-vnstock-install-sandbox.yaml` (renamed, not mutated)

## Completion Notes

- Completed 2026-05-09.
- Validation: `pnpm check` passed.

## Risk Assessment

Low risk. Mechanical migration with clear source material. Schema is permissive (unconstrained `result` field per R-Q4).
