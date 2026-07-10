---
phase: 4
title: "Ship and Registry Closeout"
status: pending
priority: P2
dependencies: [2, 3]
---

# Phase 4: Ship and Registry Closeout

## Overview

Ship both workstreams as **a single PR** (one branch bundling Phase 2 + Phase 3), resolve both source findings, file two in-PR change-logs (one per workstream), and re-ground the touched source-file fingerprints post-merge. Single-PR is the zero-conflict mitigation chosen because `meta-260709T1017Z-…-parallel-prs` is not yet fixed — sequential two-PR shipping would only move the `meta-state.jsonl` add/add collision to PR-B's rebase.

## Requirements

- Functional: both findings reach `resolved` in-registry; two change-logs filed (one per workstream); touched source fingerprints re-grounded. Zero "shipped-in-code-but-open" drift after merge.
- Non-functional: one PR, one merge — no cross-PR `meta-state.jsonl` EOF conflict. `pnpm test` + `pnpm fallow:gate` green before the merge.

## Architecture

One branch, one PR. Both change-log appends happen in the same branch before the single merge, so there is no cross-PR add/add collision. The two change-logs have distinct dimensions/targets (WS1 `semantic` / `derive-status.js#computeKind`; WS2 `surface` / the two handler files), so they are two `meta_state_log_change` calls, not one combined entry.

```
branch: fix/derive-status-fidelity-and-compact-tool-defaults   ← Phase 2 + Phase 3
  ├─ resolves meta-260710T0141Z (derive_status derivation-flaw)
  ├─ resolves meta-260704T1014Z (MCP verbose defaults)
  ├─ change-log (semantic): derive-status mechanism-shipped semantics tightened
  └─ change-log (surface):  meta_state_list + runtime_state_read compact-by-default
```

## Related Code Files

- Read/verify (no source edits this phase): the touched files from Phases 2-3 (`core/derive-status.js`, `tools/handlers/meta-state-list-tool.js`, `tools/handlers/runtime-state-read-tool.js`) + their tests.
- Mutate (registry only, via MCP tools — direct file writes blocked by gate): `meta-state.jsonl`, `file-index.jsonl`.

## Implementation Steps

1. **Cut one branch** from main: `fix/derive-status-fidelity-and-compact-tool-defaults`. Implement Phase 2 (WS1) changes, run `pnpm test` + `pnpm fallow:gate` → green. Then implement Phase 3 (WS2) changes, re-run → green. (Disjoint files; order within the branch is free, but run tests after each workstream to localize any failure.)
2. **In-PR change-log (WS1):** via `meta_state_log_change` (change_dimension: `semantic`, change_target: `tools/learning-loop-mastra/core/derive-status.js#computeKind`, change_diff listing the tightened `mechanism-shipped` semantics + `stripEvidenceAnchor` reuse + `code-only → investigate`).
3. **In-PR change-log (WS2):** via `meta_state_log_change` (change_dimension: `surface`, change_target: `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` + `runtime-state-read-tool.js`, change_diff: `compact` default flipped / added + `limit` default lowered). No `manifest.json` edit (OQ3 resolved — `server.js:46` loader rewrites the path).
   - Both appends land in the same branch before the single merge — no cross-PR EOF conflict. (This is exactly the class `meta-260709T1017Z-…-parallel-prs` describes; one PR sidesteps it. The `git merge-file --union` recipe is not needed here.)
4. **Open the PR.** Body carries the registry-deltas table: resolves `meta-260710T0141Z` + `meta-260704T1014Z`; 2 change-logs filed (semantic + surface). Merge to main.
5. **Post-merge closeout (main, after the merge).** Via MCP tools only:
   - `meta_state_resolve({ id: "meta-260710T0141Z", resolution: "computeKind now requires test_passed for mechanism-shipped; stripEvidenceAnchor reuse fixes :line-range/#anchor refs; code-only → investigate" })` — if not already resolved in-PR.
   - `meta_state_resolve({ id: "meta-260704T1014Z", resolution: "meta_state_list compact-by-default; runtime_state_read compact mode + limit:20 default; verbose opt-in" })`.
   - `meta_state_refresh_file_index` for each touched source path (`core/derive-status.js`, `tools/handlers/meta-state-list-tool.js`, `tools/handlers/runtime-state-read-tool.js`) to re-ground the path-keyed fingerprints. Pass `reason` documenting the legitimate change.
   - (Optional) re-derive the two escalate silent-persistence-fail findings (`meta-260619T2233Z`, `meta-260626T1419Z`) with `meta_state_derive_status` to confirm they now read `code-only`/`investigate` (not `code-missing`) — the live re-ground that justifies WS1. Do NOT auto-resolve them; their mechanism is still not shipped — they stay open with the corrected derivation.
6. **Sanity sweep:** `meta_state_query_drift` returns zero "shipped-in-code-but-open" entries for the two resolved findings (no repeat of the #48 closeout's drift).

## Success Criteria

- [ ] One PR merged; no `meta-state.jsonl` cross-PR EOF conflict (single-PR avoids the class entirely).
- [ ] `meta-260710T0141Z` and `meta-260704T1014Z` are `resolved` in-registry.
- [ ] Two in-PR change-logs filed (WS1 `semantic` + WS2 `surface`).
- [ ] Touched source-file fingerprints re-grounded via `meta_state_refresh_file_index`.
- [ ] `meta_state_query_drift` clean for the two resolved findings.
- [ ] `pnpm test` + `pnpm fallow:gate` green at the merge.

## Risk Assessment

- **Per-finding revert granularity lost:** a single PR cannot revert WS1 without WS2 (and vice versa). Trade-off accepted: both changes are low-risk, disjoint-file, and independently green; the two separate change-logs + two separate findings still allow each workstream to be *resolved* in the registry independently — only the *code* revert is coupled. Multi-PR-per-finding revert resumes once `meta-260709T1017Z-…-parallel-prs` is fixed (separate workstream).
- **Resolve-before-re-ground ordering:** `meta_state_resolve` on a finding whose `evidence_code_ref` changed must be paired with `meta_state_refresh_file_index` so the next `query_drift` doesn't re-flag it as drift. Step 5 orders resolve-then-refresh; if drift re-appears, refresh first, then the derived view clears.
- **Auto-resolve overreach:** do NOT resolve the two escalate silent-persistence-fail findings in Step 5 — WS1 only corrects their *derivation*, not their mechanism. Resolving them would be the same "file-exists = shipped" error WS1 just fixed. They stay open; the corrected derivation is the deliverable.
