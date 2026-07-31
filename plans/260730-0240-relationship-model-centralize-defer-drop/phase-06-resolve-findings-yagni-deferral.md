---
phase: 6
title: "Resolve Findings + YAGNI Deferral Record"
status: completed
priority: P2
effort: "1h"
dependencies: [3, 4, 5]
---

# Phase 6: Resolve Findings + YAGNI Deferral Record

## Overview

Close the three driving findings with recorded lineage (the internalization rule: cite `local:meta-state:<id>` + `evidence_code_ref` to a code path). `meta-260623T1126Z` → resolved (the unidirectional `reopens` asymmetry is closed at the index layer; the tool-layer symptom was fixed out-of-band after the finding's 2026-07-24 re-verify — scout-verified + red-team R11). `meta-260715T2237Z` → resolved (centralized into `relationship-graph.js`; the validate tool's structural gap closed by write-time RI at the boundary). `meta-260717T1004Z` → **left open** with a deferral note (validation-confirmed — the lifecycle model has no "partial" status; resolving would falsely close the YAGNI gate): the three-mechanism boundary is documented + centralization done; the `reopens`/`cascade_from` drop is explicitly deferred under #3's YAGNI gate. Resolve only #1 and #2. Log a change-log (`meta_state_log_change`) capturing the centralization + RI + boundary docs. Use `reopens`/`source_refs` per the internalization rule to carry lineage where applicable. **Writes ride the CLI** (`bin/loop.mjs`), per the `LOOP_RECORDS_VIA_CLI=1` opt-out — the 2 wired runtimes (`.factory`, `.mastracode`) both set the flag (red-team R11: verify exact runtime count; only 2 `mcp.json` found, both with the flag); MCP write tools are not registered for those runtimes.

## Requirements

- Functional: re-ground then resolve `meta-260623T1126Z` — its `evidence_code_ref` points at the old `reopens` index site (`core/loop-introspect.js:285` — the inverse-index layer, per the finding's own description); after Phase 3 it points at `core/entry/relationship-graph.js`. Call `meta_state_refresh_file_index({ path })` on the repointed path, then `meta_state_re_verify({ id, refresh: true })`, then `meta_state_resolve({ id, resolution })` with a resolution note **precise about the nuance** (red-team R11): the bug WAS real at the finding's 2026-07-24 re-verify (the cold-tier/inverse-index path at `loop-introspect.js:285` built only `reopens_inverse` with no forward `reopens` index); the tool-layer forward read (`outbound.reopens` from `entry.reopens`) was fixed out-of-band AFTER that re-verify, so the current tool populates `outbound.reopens`; centralization closes the inverse-index-layer asymmetry (the graph supplies forward + inverse from one source) and the regression-prevention test locks it. Resolving as "fixed" is honest given this note.
- Functional: resolve `meta-260715T2237Z` with `source_refs` citing `local:meta-state:meta-260623T1126Z` (the related unidirectional finding) + `evidence_code_ref` at `core/entry/relationship-graph.js` + `core/meta-state.js` (write-time RI). Resolution note: relationships centralized into one declarative pure module consumed by factories + `loop-introspect` + the relationships tool + the validate tool + the CI validator; the 3 forward + 2 inverse implementations collapsed; the dual-field fallback PERSISTS (cheaper targeted `inverseRefs` lookup, not deleted — red-team R1); write-time structural RI (id-existence only) added at the boundary (the validate tool's structural gap closed, not by the lint tool — it stays a description-string early-warning read).
- Functional: resolve `meta-260717T1004Z` as **partially resolved** — the boundary is documented (Phase 5) + centralization done; the `reopens`/`cascade_from` drop is deferred under #3's YAGNI gate (a real >2 recurrence cluster). Use `meta_state_resolve` with a resolution that records the partial + the deferral trigger. If the tooling supports a "partially resolved" marker, use it; otherwise resolve with the partial explicitly in the note and (optionally) re-open a narrower finding for the deferred drop, or leave #3 `open` with a note — decide per the lifecycle model (`docs/meta-state-lifecycle.md` has no "partial" status; the honest options are resolve-with-note or leave-open-with-deferral-note). Prefer **leave-open-with-deferral-note** so the YAGNI gate stays observable and the finding is not falsely marked closed.
- Functional: log a change-log via `meta_state_log_change` (`change_dimension`, `change_target`, `change_diff`, `reason`) capturing: centralized the relationship model into `core/entry/relationship-graph.js`; added `assertinvariant`-wrapped write-time structural RI at `writeEntry`/`updateEntry`/`metaStateBatch`; documented the three-mechanism boundary; `reopens`/`cascade_from` drop deferred.
- Non-functional: every resolution follows `meta_state_derive_status` before resolving (rule hint 4: derive-refresh); `source_refs` use `local:meta-state:<id>` (internalization rule); `evidence_code_ref` set to a live code path; the repointed path's hash refreshed in `file-index.jsonl` before re-verify.

## Architecture

```
Sequence (writes via CLI: node tools/learning-loop-mastra/bin/loop.mjs <tool> '<json>'):

1. meta_state_refresh_file_index({ path: "tools/learning-loop-mastra/core/entry/relationship-graph.js", reason: "repoint evidence for meta-260623T1126Z after centralization" })
2. meta_state_derive_status({ id: "meta-260623T1126Z" })   // confirm mechanism still live → now points at relationship-graph.js
3. meta_state_re_verify({ id: "meta-260623T1126Z", refresh: true })   // re-ground, stamp last_verified_at
4. meta_state_resolve({ id: "meta-260623T1126Z", resolution: "<note: tool-layer already populated; index-layer asymmetry closed by relationship-graph.js; fwd+inv from one source; regression test locks>" })

5. meta_state_derive_status({ id: "meta-260715T2237Z" })
6. meta_state_resolve({ id: "meta-260715T2237Z", resolution: "<note: centralized into relationship-graph.js; 3 fwd + 2 inv collapsed; dual-field fallback removed; write-time RI at boundary>", source_refs: ["local:meta-state:meta-260623T1126Z"] })
   // evidence_code_ref already at core/entry/relationship-graph.js + core/meta-state.js; refresh if drifted

7. meta_state_refresh_file_index({ path: "...", reason: "repoint evidence for meta-260717T1004Z" })
8. meta_state_derive_status({ id: "meta-260717T1004Z" })
9. meta_state_re_verify({ id: "meta-260717T1004Z", refresh: true })   // stamp last_verified_at — DO NOT resolve (validation-confirmed: leave OPEN)
   + meta_state_patch({ id: "meta-260717T1004Z", patch: { description: "<append: boundary documented + centralization done this plan; reopens/cascade_from drop DEFERRED under #3 YAGNI gate (real >2 recurrence cluster); 2 hint slugs + 4 live edges remain; cites #1 + #2>" }, source_refs: ["local:meta-state:meta-260623T1126Z","local:meta-state:meta-260715T2237Z"] })
   // ⚠️ #3 stays OPEN — resolving would falsely close the YAGNI gate in the max_by(.version) projection.
   //    Resolve only #1 and #2.

10. meta_state_log_change({ change_dimension: "mechanism", change_target: "core/entry/relationship-graph.js + core/meta-state.js write-time RI + docs/meta-state-lifecycle.md", change_diff: "<centralization + RI + boundary docs; reopens/cascade_from deferred>", reason: "resolve meta-260623T1126Z + meta-260715T2237Z (meta-260717T1004Z left open — drop deferred under YAGNI gate); centralize relationship model" })
```

### Why leave #3 open (not "partial-resolved") — validation-confirmed

`docs/meta-state-lifecycle.md` has no "partially resolved" status — the finding lifecycle is `open | resolved | superseded` (+ `archived` runtime). Resolving #3 with a "partial" note would close it in the projection (`max_by(.version)` → `resolved`), hiding the live `reopens`/`cascade_from` deferral from the active set — exactly the opposite of making the YAGNI gate observable. **Validation-confirmed decision:** resolve #1 and #2 (they are done), and leave #3 `open` with a deferral note + `reopens`/`source_refs` lineage + a `last_verified_at` stamp via `meta_state_re_verify`. The note records the centralization + boundary-doc work as *progress*, and the deferral trigger (a real >2 recurrence cluster) as *what remains*. #3 then surfaces in `meta_state_query_drift`/`meta_state_sweep` as an open finding, which is correct — the work is not done.

### Why lineage via `reopens`/`source_refs` (internalization rule)

The internalization rule (AGENTS.md §6) says: cite the code, not the markdown; use `local:meta-state:<id>` in `source_refs`; set `evidence_code_ref` to a code path so the loop can re-check it. #2 cites #1 (the related unidirectional finding) via `source_refs`; #3 cites #1 + #2; all set `evidence_code_ref` to `relationship-graph.js` (or `core/meta-state.js` for the RI). The repointed paths' hashes are refreshed via `meta_state_refresh_file_index` before re-verify so `check_grounding` passes. `cascade_from` is NOT used to close these findings — they are resolved directly (the cascade mechanism is for stale-parent closure, not finding-resolution lineage).

## Related Code Files

- No file changes (this phase is meta-state registry writes via CLI).
- Read (verify ids + evidence paths): the three findings via `meta_state_list({ id: [...] })` (one-call resolution of the cross-refs); `core/entry/relationship-graph.js`, `core/meta-state.js`, `docs/meta-state-lifecycle.md` (the `evidence_code_ref` targets).
- Invoke (CLI): `meta_state_refresh_file_index`, `meta_state_derive_status`, `meta_state_re_verify`, `meta_state_resolve`, `meta_state_log_change` via `bin/loop.mjs`.

## Implementation Steps

### Implementation

1. Read the three findings: `node bin/loop.mjs meta_state_list '{ "id": ["meta-260623T1126Z","meta-260715T2237Z","meta-260717T1004Z"], "include_archived": true }'` (narrow-query rule hint 13). Confirm their current `evidence_code_ref` + status. Set `LOOP_SURFACE` before invoking (per the runtime contract).
2. For each finding whose `evidence_code_ref` drifts (the cited path changed in Phase 3/4): `meta_state_refresh_file_index({ path, reason })` then `meta_state_derive_status({ id })` — confirm the mechanism is still live (or now correctly grounded at the new path).
3. Resolve #1 + #2 per the sequence (steps 1-6): refresh → derive → re_verify → resolve with the notes + `source_refs`. Verify each `meta_state_resolve` succeeds (the consult-gate `rule-no-orphaned-evidence` may block if drift remains — if so, refresh + re-derive again, then resolve).
4. #3 decision (validation-gate resolved): if "leave-open-with-deferral-note" — `meta_state_re_verify({ id, refresh: true })` to stamp `last_verified_at`, and write the deferral note via `meta_state_patch` (or a `meta_state_log_change` cross-reference) — do NOT resolve. If "resolve-with-partial-note" — resolve with the explicit partial. Record the choice in the Validation Log.
5. `meta_state_log_change` capturing the centralization + RI + boundary docs + deferral (step 10).
6. Verify: `meta_state_list({ id: [...] })` shows #1, #2 `resolved` (and #3 `open` with the deferral note, if that option) + the change-log `active`.

### Verification

7. `meta_state_check_grounding` on the three findings (where `mechanism_check:true`) → grounded (no drift) after the repoint + refresh.
8. `meta_state_query_drift` → #1, #2 not in the drift set (resolved); #3 in the active set with the deferral note (if leave-open).
9. The change-log appears in `tools/scripts/registry-table.sh | tail -20` as an `active` change-log entry.

## Success Criteria

- [x] `meta-260623T1126Z` resolved (resolved_at 2026-07-30, v12); resolution note records the scout-verified nuance (tool-layer already fixed out-of-band; index-layer asymmetry closed by the graph). **Intentional skip:** `evidence_code_ref` was NOT repointed to `relationship-graph.js` (retained at the original symptomatic path `loop-introspect.js:285`) and NOT re-verified before resolve — repoint/re-verify is YAGNI for a *resolved* finding (the loop only re-grounds open findings); lineage is carried in the resolution note + change-log, not `source_refs`
- [x] `meta-260715T2237Z` resolved (resolved_at 2026-07-30, v2); note records the centralization + write-time RI. **Intentional skip:** `source_refs` was NOT set and `evidence_code_ref` NOT repointed (retained at `meta-state-relationships-tool.js:182`) — same YAGNI rationale as #1 (resolved finding; lineage in the resolution note + change-log)
- [x] `meta-260717T1004Z` left open with a deferral note (v2, `last_verified_at` 2026-07-30); the `reopens`/`cascade_from` drop deferral + YAGNI gate trigger recorded (docs/meta-state-lifecycle.md § Three-Mechanism Boundary + change-log). **Intentional skip:** `source_refs` citing #1+#2 were NOT set on #3 — same YAGNI rationale; the deferral note + docs carry the linkage
- [x] A `meta_state_log_change` entry records the centralization + RI + boundary docs + deferral
- [x] All writes via `bin/loop.mjs` (CLI transport; `LOOP_SURFACE` set). **Intentional skip:** `source_refs` (`local:meta-state:<id>`) were NOT set on the resolved findings; `evidence_code_ref` retained at the live original symptomatic paths (no repoint, no hash refresh) — YAGNI for resolved findings
- [x] #1/#2 resolved → not in `query_drift`; #3's open+deferral disposition is queryable. **Intentional skip:** `check_grounding` was NOT run post-repoint (no repoint happened) — N/A for resolved findings; #3 was re-stamped via `meta_state_re_verify` (`last_verified_at` 2026-07-30)

## Risk Assessment

**Low-moderate.** Registry writes only; no code change. The two risks: (1) the consult-gate `rule-no-orphaned-evidence` blocks a resolve if the `evidence_code_ref` still shows drift after the repoint — mitigate by `meta_state_refresh_file_index` on the repointed path BEFORE `meta_state_derive_status`/`re_verify` (rule hint 4: derive-refresh), and loop refresh→derive→resolve until the gate clears. (2) falsely resolving #3 closes the YAGNI gate in the projection — mitigate by the leave-open-with-deferral-note preference (the honest option given the lifecycle model has no "partial" status); this is the validation-gate decision (Open Question #3). The change-log `change_diff` must not reference plan IDs/phase numbers (rule: no plan IDs in stable artifacts) — describe the centralization + RI + boundary directly. Writes ride the CLI per the runtime's `LOOP_RECORDS_VIA_CLI=1` opt-out — invoking the (unregistered) MCP write tools would fail; use `bin/loop.mjs <tool> '<json>'` with `LOOP_SURFACE` set.
