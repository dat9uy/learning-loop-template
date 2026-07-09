---
phase: 2
title: "Resolve confirmed-shipped Group R findings"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Resolve confirmed-shipped Group R findings

## Overview
Apply `meta_state_resolve` to each finding Phase 1 classified RESOLVE (≤3 candidates: vnstock, SP2, handoff-md), with a resolution note citing the shipped mechanism + PR/commit. Sequential calls — `meta_state_batch` has no `resolve` op (ops: write/update/delete/archive). Each resolve is individually verified by re-query, which also catches the silent-persistence-fail class (`meta_state_resolve` returns `resolved:true` without a visibility re-read).

## Requirements
- Functional: every Phase-1 RESOLVE row becomes `status: resolved` with a cited mechanism.
- Non-functional: resolve notes cite this plan + the shipping PR/commit/script; consult-gate `rule-no-orphaned-evidence` satisfied (file exists, mechanism confirmed in Phase 1).
- A resolve that returns `patched:false`/rejection (e.g. consult-gate block, version mismatch) is **not retried blindly** — diagnose and record, do not override rules.

## Architecture
```
for id in Phase1.RESOLVE_rows (sequential):
  meta_state_resolve({id, resolution: "<mechanism>; plan 260710-0104-drift-driven-registry-closeout; verified <date>"})
  meta_state_list({id, compact:true, include_archived:true})  → confirm status transitioned
  record id → resolved|failed in phase report
```
`meta_state_resolve` is append-only (status flip + `resolved_at` + `resolved_by` + `resolution`); low blast radius. No batch.

## Related Code Files
- None modified. Reads: re-query via `meta_state_list` to confirm each transition.

## Resolve list (input from Phase 1 — execute only confirmed rows)

Group R is **3 candidates** (report-overwrite and taskUpdate-noop moved to KEEP-OPEN after red-team — see plan.md map). Execute only rows Phase 1 confirms:

| full id | expected resolution note (mechanism) | status now |
|---|---|---|
| …-vnstock-device-slot-ledger-converted | sidecar conversion script `scripts/convert-ledger-to-sidecar.mjs` shipped + converted the ledger | RESOLVE-candidate |
| …-post-migration-sp2-grounding-marker-… | zod-native migration (plan 260618-0029) + SP2 grounding re-established via file-index.jsonl (plan 260702-1933) | RESOLVE-candidate |
| …-handoff-md-…stale-code-sect | stale-code section archived (`docs/_archive-260703/…`) | RESOLVE-candidate |

**Removed from the resolve list (KEEP-OPEN):** `…-report-mcp-tool-silently-overwrites-…` (LIVE — `:14-28` ignores caller id) and `…-plan-1b-phase-2-…task-update` (symptom-shaped `manifest.json` evidence + likely upstream). **If Phase 1 moves any of the 3 candidates to KEEP-OPEN, do not resolve it.** Expected resolve count: 1–3.

## Verification matrix (per-resolve)

| finding | resolve call | confirm-transition query | on failure |
|---|---|---|---|
| each RESOLVE row | `meta_state_resolve({id, resolution})` | `meta_state_list({id, include_archived:true})` shows `status: resolved` | see failure taxonomy below |

## Failure taxonomy (do not retry blindly)
- **`reason: consult-gate` / `version_mismatch` / `not_found`** — read the `reason`; do not override a gate. If `rule-no-orphaned-evidence` blocks (global fingerprint invariant — see plan.md), it names a `blocking_id` (a *different* drifted finding), not the resolve candidate; surface it and stop — do not re-ground to force the resolve. If `version_mismatch`, re-query and retry with the fresh version.
- **`resolved:true` but re-query shows `status: open`** — **silent-persistence-fail** (the same live class as `meta-260619T2233Z`/`meta-260626T1419Z`: `meta_state_resolve` calls `updateEntry` then returns `resolved:true` with no visibility re-read). Do NOT retry blindly. Re-file with `_expected_version` from the re-query; if it still fails, leave the finding open with a note and link `meta-260619T2233Z`.

## MCP-tool / interface checklist
- [ ] `meta_state_resolve({id, resolution})` per confirmed RESOLVE row — **sequential**, one tool call each.
- [ ] `meta_state_list({id, compact:true, include_archived:true})` after each, to confirm `status: resolved` (this re-query is what catches a silent-persistence-fail).
- [ ] If a resolve is blocked by `rule-no-orphaned-evidence` → it's a global invariant, not per-resolve; the `blocking_id` is a drifted *other* finding. Surface + stop; do not re-ground to force-close.
- [ ] **No** `meta_state_batch` for resolves (no resolve op). **No** rule overrides to force-close.

## Dependency map
- Depends on: Phase 1 (RESOLVE rows frozen).
- Blocks: Phase 4 (needs the resolved count).
- External: none.

## Implementation Steps
1. Pull the RESOLVE list from the Phase 1 report (≤3 rows).
2. For each id (sequential): `meta_state_resolve({id, resolution: "<mechanism>; verified <date>; plan 260710-0104-drift-driven-registry-closeout"})`.
3. Immediately `meta_state_list({id, compact:true, include_archived:true})`; confirm `status: resolved`.
4. On rejection OR `resolved:true`-but-still-open: apply the failure taxonomy; never override a gate, never retry a silent-persistence-fail blindly.
5. Record resolved/failed per id in the phase report; Phase 4 uses the count.

## Success Criteria
- [ ] Every Phase-1 RESOLVE row is either `resolved` (confirmed by re-query) or recorded as failed-with-reason (incl. silent-persistence-fail).
- [ ] No resolve was forced past a consult-gate or justified by `derive_status` alone.
- [ ] Resolution notes cite this plan + the shipping mechanism.
- [ ] Resolved count reported for Phase 4.

## Risk Assessment
- **False resolve (HIGH)** — resolving a finding whose mechanism didn't actually ship silences a real bug (report-overwrite nearly shipped as a false resolve during planning). Mitigation: Phase 1 is the gate; here we only execute confirmed rows (≤3). Bias: a single doubt → defer to KEEP-OPEN.
- **Resolve silent-persistence-fail (MEDIUM)** — `meta_state_resolve` returns `resolved:true` without a visibility re-read; a non-persisting resolve is only caught by the post-call `meta_state_list` re-query. Mitigation: the re-query is mandatory; on `resolved:true`-but-still-open, apply the failure taxonomy (re-file with fresh version, else keep-open + link `meta-260619T2233Z`), never retry blindly.
- **Consult-gate block (LOW→MEDIUM if drift)** — `rule-no-orphaned-evidence` is a global fingerprint invariant; today it passes (no drift). If a parallel PR drifts any open grounded finding's cited file mid-closeout, the gate blocks **all** resolves with a `blocking_id` naming the *other* finding. Mitigation: surface + stop; do not re-ground to force-close (conflicts with the no-re-ground constraint).
- **Version mismatch (LOW)** — another writer touched the entry between Phase 1 and 2. Mitigation: `meta_state_resolve` auto-captures version if `_expected_version` omitted; re-query and retry.
- **Sequential-only latency (LOW)** — no batch resolve; N sequential calls. Acceptable: N≈1–3.
