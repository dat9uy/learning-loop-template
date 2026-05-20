---
title: "Re-ground Capability Records + Rename Runtime Probe"
description: "Update capability records to cite live index entries instead of frozen claims. Rename capability script to runtime probe across docs and READMEs. Editorial only — no schema or code changes."
status: completed
priority: P2
branch: "main"
tags: [capability, index-first, editorial, naming]
blockedBy: []
blocks: []
created: "2026-05-20T09:47:32.811Z"
createdBy: "ck:plan"
source: skill
---

# Re-ground Capability Records + Rename Runtime Probe

## Overview

This plan implements Workstreams A+B from the three-layer capability model brainstorm (`plans/reports/brainstorm-20260520-three-layer-capability-model.md`).

- **Workstream A** — Re-ground two capability records on live index entries, restoring the broken agent-orientation chain from assertion → product surface.
- **Workstream B** — Rename "capability script" to "runtime probe" across docs to eliminate ontological collision with "capability record."

Both are editorial. No schema changes. No code changes. No file moves.

## Context

- **Brainstorm report:** `plans/reports/brainstorm-20260520-three-layer-capability-model.md`
- **Frozen claim (fastapi):** `records/claims/claim-product-fastapi-reference.yaml`
- **Frozen claim (tanstack):** `records/claims/claim-product-tanstack-reference-view.yaml`
- **Live index entry:** `records/index/assertion-vnstock-data-runtime-live-api-surfaces-verified.yaml`
- **Capability records:** `records/capabilities/capability-fastapi-reference-rest.yaml`, `records/capabilities/capability-tanstack-reference-render.yaml`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Re-ground capability records on index entries](./phase-01-re-ground-capability-records-on-index-entries.md) | Completed |
| 2 | [Rename capability script to runtime probe in docs](./phase-02-rename-capability-script-to-runtime-probe-in-docs.md) | Completed |

## Dependencies

- Phase 2 (docs rename) may proceed in parallel with Phase 1 (record re-grounding) — no cross-dependency.
- Neither phase depends on the pending `260520-0157-coordination-model-collapse` plan (different doc sections).

## Validation Log

### Verification Results
- Claims checked: 10
- Verified: 10 | Failed: 0 | Unverified: 0
- Tier: Light

### Validation Session 1 — 2026-05-20
| # | Question | Decision | Impact |
|---|----------|----------|--------|
| 1 | Tanstack capability grounding | Same assertion as FastAPI (`assertion-vnstock-data-runtime-live-api-surfaces-verified`) | Confirms Phase 1 design; no plan change |
| 2 | "Capability Runtime Experiment" heading | Rename to **"Runtime Probe Experiment"** | Expands Phase 2 scope: operator-guide.md section heading also renamed |
| 3 | Skill reference files | **Include** `.claude/skills/learning-loop/references/*.md` in rename | Expands Phase 2 scope: 2 additional files |

### Whole-Plan Consistency Sweep
- No unresolved contradictions. All decisions propagated to Phase 2.

## Success Criteria (Whole Plan)

- [x] Both capability records cite `record:assertion-vnstock-data-runtime-live-api-surfaces-verified` as their first `source_ref`.
- [x] No capability record cites a frozen claim in `source_refs`.
- [x] No active doc, README, or skill reference contains the string "capability script" (journals and historical plans exempt).
- [x] `pnpm validate:records` passes after changes.
- [x] Agent-orientation flow (brainstorm steps 1–3) works end-to-end when traced manually.
