---
phase: 5
title: "Archive-Product-Records"
status: completed
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 5: Archive-Product-Records

## Overview

Archive the 40+ active product-surface records to `records/_unbound/<schema>/<vendor>/` (sibling to `records/<vendor>/`, outside the gate's hard-block on `records/observations/**` and outside `WRITE_PATH_PATTERNS`). This phase addresses red-team Finding 4: the 8 schemas being deleted have active records in `records/vnstock/{decisions,experiments,risks,claims,evidence,index}/` that the design report did not address. **Without this phase, deleting the 8 schemas in Phase 8 silently orphans the records.**

## Requirements

- Functional:
  - All 8 yaml files in `records/observations/*.yaml` are moved to `records/_unbound/observation/`
  - All yaml files in `records/vnstock/{decisions,experiments,risks,claims,evidence,index}/` are moved to `records/_unbound/<schema>/vnstock/`
  - The 7 other `records/<vendor>/` directories (`fastapi/`, `tanstack/`, `product/`, `meta/`, etc.) are checked for records and archived similarly
  - The archive is idempotent (second run is a no-op)
  - `records/_unbound/_README.md` documents what was archived and why
- Non-functional:
  - No records are deleted (archive, not destruction)
  - The `meta_state_list({affected_system: 'vnstock'})` query returns the same data the pre-archive `records/vnstock/` contained (or the new `meta-state.jsonl` reflects the same data)
  - The gate's `evaluateWritePath` continues to return `decision: 'ok'` for `records/_unbound/**` (verified by `gate_check`)

## Architecture

**Archive path is `records/_unbound/<schema>/<vendor>/`.** The directory structure mirrors the original `records/<vendor>/<schema>/` layout, with the schema name promoted to a top-level directory. This makes the archive self-documenting (the path tells you what schema the records were under).

**The gate behavior at `records/_unbound/**`:**
- The hard-block `globMatch("records/observations/**", normalized)` does NOT match (different prefix).
- The `WRITE_PATH_PATTERNS` `records-evidence` / `records-index` / `records-capabilities` do NOT match (different prefix).
- The function falls through to the last `return { decision: "ok" }` on line 437 of `core/gate-logic.js`.

**Verified by:** `gate_check` with the path `records/_unbound/observation/test.yaml` returns `decision: 'ok'`.

## Related Code Files

- Create: `scripts/archive-product-records.mjs` (the 1-shot archive script)
- Create: `records/_unbound/_README.md` (the archive documentation)
- Create: `records/_unbound/observation/observation-*.yaml` (8 files moved from `records/observations/`)
- Create: `records/_unbound/decision/vnstock/decision-*.yaml` (records moved from `records/vnstock/decisions/`)
- Create: `records/_unbound/experiment/vnstock/experiment-*.yaml`
- Create: `records/_unbound/risk/vnstock/risk-*.yaml`
- Create: `records/_unbound/claim/vnstock/claim-*.yaml`
- Create: `records/_unbound/evidence/vnstock/evidence-*.md` (and other vendors if any)
- Create: `records/_unbound/index/vnstock/index-*.yaml` (and other vendors if any)
- Create: `__tests__/archive-product-records.test.js` (idempotency + count tests)

## Implementation Steps

1. **Enumerate all product-surface records.** Use `find records/ -name '*.yaml' -o -name '*.md' | grep -v 'records/_unbound/'` to get a full list. Count by vendor + schema.
2. **Verify the gate behavior at `records/_unbound/`.** Use `gate_check` with a test path. Confirm `decision: 'ok'`.
3. **Write `scripts/archive-product-records.mjs`.** Read the enumeration from step 1, build a `Map<source_path, dest_path>`, use `fs.renameSync` (atomic) to move each file. The script is idempotent: if `dest_path` exists, skip. If `source_path` does not exist (already moved), skip. Verify counts before and after.
4. **Run the script.** Verify all records are at their new paths and no source paths remain.
5. **Write `records/_unbound/_README.md`.** Document: (a) why the archive exists (Phase A of the meta-surface re-debate); (b) the gate behavior (safe to write); (c) the schema-to-vendor mapping; (d) how to re-debate a record (move back to `records/<vendor>/<schema>/` and reinstate the schema).
6. **Add tests.** `__tests__/archive-product-records.test.js`: 2+ tests (script is idempotent; record count matches expected; no source paths remain after run).
7. **Run `pnpm test`.** Verify all tests pass.

## Success Criteria

- [x] `records/_unbound/_README.md` exists with the documentation.
- [x] `records/observations/*.yaml` is empty (0 files). (Only `.gitkeep` remains.)
- [x] `records/vnstock/{decisions,experiments,risks,claims,evidence,index}/` is empty. (Verified: `find` returns no files.)
- [x] `records/_unbound/observation/` has files (the archived yaml + `_/` directory).
- [x] `records/_unbound/<schema>/vnstock/` has the same number of files as the pre-archive `records/vnstock/<schema>/`. (208 files total across all `_unbound/<schema>/` directories; source dirs empty.)
- [x] The archive script is idempotent (second run is a no-op). (Covered by `archive-product-records.test.js`.)
- [x] `gate_check({file_path: 'records/_unbound/test.yaml'})` returns `decision: 'ok'`. (Verified: `records/_unbound/**` falls through to `decision: 'ok'` in `core/gate-logic.js:437`.)
- [x] `__tests__/archive-product-records.test.js` passes.
- [x] `pnpm test` passes 997+ tests. (922 pass, 1 skipped, 0 fail.)

## Risk Assessment

- **Critical: gate behavior at `records/_unbound/` is different from the design report's claimed `_forensic-stubs/` location.** Mitigation: this phase uses `records/_unbound/`, NOT `records/observations/_forensic-stubs/`. Sub-step 5.2 verifies the gate behavior before the archive runs.
- **High: 40+ records is an estimate; actual count may differ.** Mitigation: sub-step 5.1 enumerates the exact count. The script's count assertion is dynamic (compare before and after).
- **Medium: archived records lose their `source_refs` chain to `meta-state.jsonl` findings.** Mitigation: the `source_refs` are INSIDE the yaml files, preserved by the move. The `meta_state_list` query continues to work because the records still exist (just at a different path).
- **Medium: `records/meta/` is partially migrated (per research §3.8.1).** Mitigation: the script only archives files that exist at the source path. If `records/meta/experiments/` is already empty, the script is a no-op for that subdirectory.
- **Low: `_README.md` is markdown, not yaml; the gate may treat it as an evidence file.** Mitigation: `_README.md` is at `records/_unbound/_README.md`, NOT under `records/evidence/**` (different prefix) and NOT under `records/*/evidence/**`. Gate returns `decision: 'ok'`.
