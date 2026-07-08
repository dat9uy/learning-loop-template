---
phase: 5
title: "SessionEnd un-block documentation"
status: pending
priority: P2
dependencies: [4]
---

# Phase 5: SessionEnd un-block documentation

## Overview

Close the docs loop: state in `docs/loop-engine.md` that the (b)+(c) closed loop is the named un-block for the deferred SessionEnd/pre-commit hook (skill-layer prerequisite UQ5), and that the hook is the *promotion* of a recurring gap into enforcement — downstream, not shipped here. Record the `loop-engine.md` edit via `meta_state_log_change`. Docs-only + one change-log; no code.

## Requirements

- Functional:
  - `docs/loop-engine.md` carries a SessionEnd un-block statement: the change-log gap detection + session-start gap surfacing (this plan) is the named un-block for the deferred SessionEnd/pre-commit hook; the hook promotes a *recurring* gap (drift rate above threshold) into enforcement; (b)+(c) are advisory detection/surfacing, not a gate.
  - `meta_state_log_change` records the `loop-engine.md` edit (the change-log trigger fires on its own bound artifact — Q11 symmetry: operator/agent edits recorded alike).
- Non-functional: docs-only diff (no `tools/**`/`core/**` source change in this phase); the edit goes through the gated path if `docs/**` is gated by then (it is NOT gated today — `docs/**` is ungated per the prerequisite scope boundary; direct Edit is fine).

## Architecture

The statement extends the Rec 12 trigger section (`docs/loop-engine.md:88-91`, shipped by Plan 3) with the closed-loop + un-block framing. It names: (1) the detection surface (this plan's `CHANGE_LOG_BOUND_PATHS` + git-diff + `buildChangeLogGapHints`), (2) the session-start surfacing (the `change_log_gap_hints` key), (3) the downstream SessionEnd hook as the promotion of recurrence into enforcement, (4) the explicit "advisory, not a gate" threat-model boundary, and (5) **recurrence ownership (red-team H3):** (b)+(c) derive the gap set per session and intentionally leave no persisted state; the deferred SessionEnd hook owns its own recurrence persistence — it re-runs the detection at session end and keeps a per-(branch,path) gap counter in `runtime-state.jsonl`, promoting to enforcement only when the drift rate exceeds threshold. The "closed loop" closes at the hook, not at (b)+(c); (b)+(c) are the detection the hook calls.

This is the honest-framing pointer Plan 3 repointed at "Plan 4 (rec12-closed-loop)" (`meta-260708T1204Z` change-log: "Honest-framing gap-detector pointer repointed from broadened Rec 12 plan to Plan 4"). Phase 5 makes that pointer concrete.

## Related Code Files

- Modify: `docs/loop-engine.md` — add the closed-loop + SessionEnd un-block statement to the Rec 12 trigger section.
- Modify (registry): `meta-state.jsonl` via `meta_state_log_change` MCP tool — record the edit.

## Implementation Steps

1. Read the current Rec 12 trigger section in `docs/loop-engine.md` (~L88-91) to anchor the addition.
2. Add a concise statement (3–5 sentences) covering the five points in the Architecture above. Keep it docs-grade (no plan IDs, no phase numbers — per `review-audit-self-decision.md` "Stable Code Artifacts"; the plan tracker is the place for plan IDs).
3. Call `meta_state_log_change({ change_dimension: "semantic", change_target: "docs/loop-engine.md", change_diff: {added:[<the added sentences>],removed:[],changed:[<the Rec 12 trigger section, extended>]}, reason: "Ship Rec 12 (b)+(c) closed-loop statement: gap detection + session-start surfacing; name the SessionEnd/pre-commit hook as the downstream promotion that owns recurrence. Un-blocks UQ5.", applies_to: {schemas:["docs/loop-engine.md"], surfaces:["meta"]} })`. **Fill the `added`/`changed` arrays with the actual sentence text at cook time (red-team L2) — not placeholders.**
4. **Record the enforcement followup as a `loop-design` (Validation Q1).** Call `meta_state_propose_design({ title: "Change-log trigger consult-gate enforcement", description: "<≥20 chars: deferred enforcement of the Rec 12 change-log trigger — a consult-gate/skill that blocks/gates edits to tools/**/core/** that skip the trigger, sitting on Plan 4's detection. Ship after observing the drift rate (b)+(c) surface.>", proposed_design_for: ["rule-change-log-trigger-enforcement", "consult-gate-change-log-trigger"], addresses: [], affected_system: "meta", severity_hint: "medium" })`. This makes the deferral a tracked, discoverable artifact the cold tier surfaces (`loop_describe({tier:"cold"})` lists `loop_designs`), so a future plan can pick it up — not a lost deferral. (The 4-kind union: loop-designs defer; this is the canonical entry for a deferred design.)
5. Update the tracker row (`plans/reports/from-problem-solving-to-plan-split-260707-0812-rec12-lifecycle-pr-tracker-report.md` Plan 4 row): fill branch/PR, flip status `PLAN_CUT → COOKING` on cook-start (separate step at cook time, not here).

## Success Criteria

- [ ] `docs/loop-engine.md` Rec 12 section carries the closed-loop + SessionEnd un-block statement (detection + surfacing + downstream promotion + advisory-not-a-gate + recurrence-ownership-by-the-hook).
- [ ] `meta_state_log_change` entry recorded for the `loop-engine.md` edit.
- [ ] `meta_state_propose_design` entry recorded for the deferred consult-gate enforcement (loop-design, status=active) — the enforcement followup is a tracked, discoverable artifact.
- [ ] No `tools/**`/`core/**` source changed in this phase (docs + registry only).
- [ ] Statement contains no plan IDs / phase numbers / audit labels (stable-docs invariant).

## Risk Assessment

Low — docs-only + one change-log. The only risk is over-stating enforcement that does not exist yet; mitigated by the explicit "advisory, not a gate" + "downstream promotion" framing. The change-log trigger firing on its own bound artifact (`loop-engine.md`) is the Q11 symmetry proof (operator/agent edits recorded alike) — a positive, not a risk.