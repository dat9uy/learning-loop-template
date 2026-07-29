---
phase: 5
title: "Re-ground, Resolve Finding, Log Change"
status: completed
priority: P2
effort: "1h"
dependencies: [3, 4]
---

# Phase 5: Re-ground, Resolve Finding, Log Change

## Overview

The meta-state lifecycle closure. Repoint the finding's drifted `evidence_code_ref` to the new unified primitive, re-ground it via the shared fingerprint index, and resolve `meta-260616T0222Z` citing a change-log entry that records the unification (and honestly notes that the finding's "duplicates the semantics" premise was imprecise — the two checks were intentionally different policies that only coincided on single-row surfaces; the deeper fix deduped the projection so they genuinely share one mechanism). No runtime gate logic here — cleanup + lifecycle only.

## Requirements

- Functional: `meta-260616T0222Z` `evidence_code_ref` repointed from `hooks/universal/inbound-gate.js#findStaleObservations` (drifted — symbol not in that file) to `core/observation-staleness.js#findObservationsStaleByAge` (the unified primitive).
- Functional: `meta_state_refresh_file_index` run on each refactored path so the shared fingerprint index re-grounds the new/changed code hashes.
- Functional: `meta_state_derive_status` returns a non-`active-uncertain` recommendation after re-grounding; `meta_state_resolve` closes the finding citing the change-log entry.
- Functional: the change-log entry records the deeper fix (projection dedup + primitive unification + dropped sidecar reduce) and that the inbound gate moved from conservative-per-row to precise-per-surface-latest.
- Non-functional: no new code paths; meta-state lifecycle only.

## Architecture

```
meta-state lifecycle (CLI transport, LOOP_SURFACE set):
  1. meta_state_refresh_file_index for each refactored path:
       core/observation-staleness.js, core/file-readers.js, core/gate-logic.js,
       core/inbound-state.js, core/evaluate-inbound-gate.js, tools/handlers/notify-artifact-tool.js
  2. meta_state_patch({ id, entry_kind:"finding",
       patch:{ evidence_code_ref:"tools/learning-loop-mastra/core/observation-staleness.js#findObservationsStaleByAge" } })
  3. meta_state_derive_status({ id })   ← confirm recommendation no longer "investigate"/active-uncertain
  4. meta_state_re_verify({ id, refresh:true })   ← stamps last_verified_at against the repointed, refreshed ref
  5. meta_state_log_change({ change_dimension:"mechanism",
       change_target:"observation-staleness (inbound + bash gates) + readRuntimeObservations projection",
       change_diff, reason })
  6. meta_state_resolve({ id, resolution, source_refs:["local:meta-state:<change-log-id>"] })
```

Per the `designs-no-code` / `internalization-rule` hints: design choices log a change-log entry, cite its id in `source_refs`.

## Related Code Files

- Meta-state: `meta-state.jsonl` + `change-log.jsonl` (via CLI write tools — never direct file writes)

## Implementation Steps

### Re-ground the finding

1. Run `meta_state_refresh_file_index` on each of the six refactored paths (Phases 1–4). This re-grounds the path hashes so the repointed `evidence_code_ref` resolves.
2. `meta_state_patch` the finding: `evidence_code_ref` → `tools/learning-loop-mastra/core/observation-staleness.js#findObservationsStaleByAge`. (The current ref `inbound-gate.js#findStaleObservations` is drifted — the symbol was in `gate-logic.js`, now in `observation-staleness.js`.)
3. `meta_state_derive_status({ id })` → confirm `code_ref_exists: true` against the repointed path and the recommendation is no longer `investigate`/`active-uncertain`.
4. `meta_state_re_verify({ id, refresh: true })` → stamps `last_verified_at` against the repointed, refreshed ref.

### Resolve the finding

5. `meta_state_log_change`:
   - `change_dimension`: `"mechanism"`
   - `change_target`: `"observation-staleness (inbound + bash gates) + readRuntimeObservations projection"`
   - `change_diff`: deduped `readRuntimeObservations` to latest-per-surface via kind-before-collapse (filter budget-state, then `collapseLatestById`, mirroring `readBudgetTrackingState`) so `obs.updated_at` is authoritative; collapsed the inbound age-TTL and bash marker-relative checks onto one shared primitive (`core/observation-staleness.js` + `OBSERVATION_STALENESS_WINDOW_MS` + `observationReferenceTimeMs`); both predicates stale-on-null; dropped the meta/non-meta branch + sidecar `reduce(latest)` (no-op post-dedup); inbound gate moved conservative-per-row → precise-per-surface-latest for canonical-id rows; F1 invariant preserved.
   - `reason`: resolves `meta-260616T0222Z`. Notes the finding's "duplicates the semantics" premise was imprecise — the two checks were intentionally different policies on multi-row budget-state surfaces; the deeper fix made them genuinely share one mechanism via projection dedup.
6. `meta_state_resolve({ id, resolution, source_refs: ["local:meta-state:<change-log-id>"] })`. If the resolver rejects (e.g. grounding drift), surface the rejection per documentation-management — do not force.

### Verification

7. `meta_state_list({ id: ["meta-260616T0222Z..."] })` → status `resolved`, `last_verified_at` current, `evidence_code_ref` repointed, `source_refs` cites the change-log id.
8. Full `pnpm test` → green.

## Success Criteria

- [x] Finding `evidence_code_ref` repointed to `observation-staleness.js#findObservationsStaleByAge`
- [x] `meta_state_derive_status` no longer `active-uncertain` / `investigate` — verified `recommendation: "no_action"`, `drift: false` (no re-investigation triggered). Note: the `derived_status` field still reads `active-uncertain` — that is the pre-existing terminal-finding sub-signal quirk tracked by the separate resolved finding `meta-260728T2029Z`, not introduced by this plan; the actionable verdict (`no_action`) is correct.
- [x] `meta-260616T0222Z` status `resolved`, citing a change-log entry id
- [x] Change-log entry honestly records the imprecise-premise correction + the deeper fix
- [x] `file-index.jsonl` refreshed for all six refactored paths — verified via `meta_state_check_grounding`: `code_ref_exists: true` with current hash `sha256:ed18e9…` on the repointed primary ref; the file-index is the gitignored pretest-seed regen artifact rebuilt on `pnpm test`
- [x] Full test suite green

## Risk Assessment

**Low.** Meta-state lifecycle only. The `evidence_code_ref` repoint depends on Phases 1–4's `file-index` refresh landing first; ordering refresh-before-patch-then-derive guards the grounding check. The change-log entry's honesty about the imprecise premise matters for future re-verification — it prevents a future agent from re-flagging the (now-genuine) unification as a duplicate. If `meta_state_resolve` is rejected, surface rather than force.
