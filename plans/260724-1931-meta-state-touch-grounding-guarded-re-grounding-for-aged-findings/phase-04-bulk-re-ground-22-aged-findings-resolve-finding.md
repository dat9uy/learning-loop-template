---
phase: 4
title: "Bulk re-ground 22 aged findings + resolve finding"
status: completed
priority: P1
effort: "1h"
dependencies: [2, 3]
---

# Phase 4: Bulk re-ground 22 aged findings + resolve finding

## Overview

Use the shipped tool to re-ground the 22 age-stale findings (each currently grounded or grounding-skipped), verify the cold-tier stale count drops below the existing cap without bumping it, then close the parent finding through the canonical citation flow.

## Requirements

- Functional: all 22 ids touched (or individually triaged if grounding now fails); parent finding resolved
- Non-functional: every mutation rides `meta_state_touch` / `meta_state_resolve` via CLI — no direct registry edits

## Architecture

Operator runbook, not code. Recompute the aged-no-steps list at execution time (do not hardcode the 22 ids — registry ages daily): iterate open findings where `isStaleView` age-fires and `verification.steps` is empty, call `meta_state_touch({id})` per id, collect per-id results. Ids that now reject with `drifted`/`missing` are real signal — file them as new findings with `reopens` unset (they are drift, not age), do not force-touch.

## Implementation Steps

1. Recompute the list (same Python derivation used in the debug session: open findings, `age >= 7d` from `last_verified_at || created_at`, empty `verification.steps`).
2. Per id: `LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs meta_state_touch '{"id":"..."}'` — record touched/rejected per id.
3. For any `drifted`/`missing` rejections: report via `meta_state_report` (severity warning, category `evidence-drift`) instead of touching.
4. Run `meta_state_sweep` / cold-tier regression test → age-stale count ≤ cap (19) with no cap change.
5. Log the change: `meta_state_log_change` (change_dimension `tooling`, target `meta_state_touch`, diff summary, reason citing the parent finding).
6. Resolve: `meta_state_derive_status` on the parent finding, then `meta_state_resolve({ id: "meta-260724T1913Z-aged-findings-no-verification-steps-cannot-be-re-grounded-by", resolution, source_refs: ["local:meta-state:<change-log-id>"] })` per internalization rule (hint #5: design-only/tooling choices cite the change-log id).
7. Cold-tier cap: leave at 19 — count should now be well under it.

## Success Criteria

- [x] Age-stale-no-steps count = 0 (or only drift-rejected ids, each re-filed) — 19 touched, 2 drift-rejected re-filed as new evidence-drift findings
- [x] `cold-tier-regression.test.js` green without cap bump
- [x] Parent finding status `resolved` with change-log citation — `meta-260724T1913Z-aged-findings-no-verification-steps-cannot-be-re-grounded-by` resolved (v1, status:resolved) citing `meta-260724T2026Z-meta-state-touch` change-log
- [x] Gate log shows one `meta_state_touch` breadcrumb per touched id (audit trail) — 19 touched + 2 rejected, all logged

## Risk Assessment

- Risk: between plan and execution more findings cross the 7d window → the recompute-in-step-1 instruction absorbs this; never reuse the static list.
- Risk: touching a finding whose evidence silently drifted — prevented by the tool's `drifted`/`missing` rejection; those become new findings, which is the loop working as designed.
