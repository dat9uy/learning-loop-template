---
phase: 4
title: "Docs — L1 Concept + Lifecycle"
status: pending
priority: P3
dependencies: [1, 2, 3]
---

# Phase 4: Docs — L1 Concept + Lifecycle

## Overview
Add the L1 concept statement ("a finding is a deferred decision, not a thing to be removed") and the explicit-exits set (`promote | resolve | re-verify | supersede | dispatch`) to `docs/loop-engine.md`, then close out the source report. The `dispatch` exit + its cross-check against `meta_state_dispatch_finding` (Phase 2) require Phase 2; the source-report closeout marks Rec 10 (Phase 3) [DONE], requiring Phase 3 — hence `dependencies: [1, 2, 3]` (validation P4-W5 + this add). Phase 4 is the plan's closure phase: it ships last, after the implementing phases. `dispatch` is a non-terminal routing action, not a 4th terminal status.

## Requirements
- Functional: `docs/loop-engine.md` carries the deferred-decision statement and the explicit-exits set including `dispatch` and `supersede`. The concept surface states `dispatch` is a routing action, not a terminal status.
- Non-functional: docs match the shipped code (Phase 1 removed `stale-ref` from the category enum at `core/meta-state.js` + `docs/schemas.md`; Phase 4 reflects this in the concept surface, not by re-listing categories).

## Architecture
The L1 doc (`docs/loop-engine.md`) is implementation-agnostic. The finding role today sits in the "Concept vocabulary" block (L22-32) and the four-kinds sentence (L55). The deferred-decision framing + explicit-exits set are additions to the finding role, not a status-lifecycle change. `docs/meta-state-lifecycle.md` is a status-lifecycle doc (6-state `reported|active|stale|resolved|superseded|auto-resolved` at L30-52); `stale-ref` is NOT in it (it is a category, not a status — scout confirmed via grep), so no edit is needed there. The category enum lives in `docs/schemas.md:35` (updated in Phase 1).

## Related Code Files
- Modify: `docs/loop-engine.md` — add the deferred-decision statement + explicit-exits set to the finding role (Concept vocabulary block L22-32 / four-kinds sentence L55); add `dispatch` as a non-terminal routing action.
- Modify: `plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md` — mark Rec 8, Rec 10, Rec 11 `[DONE]` (resolved by this plan's Phases 1 and 3); note Rec 12 half-solved (scoped dispatch-close case shipped in Phase 3; general trigger rule deferred); leave Rec 9 open (no consult-gate built); update the addendum `**Status**` line from "brainstormed and design agreed" to "shipped → see `plans/260704-0301-stale-findings-dispatch-handle/`".
- Read-only check: `docs/meta-state-lifecycle.md` (confirm no `stale-ref` reference; no edit needed — scout confirmed absent).
- Read-only check: `tools/learning-loop-mastra/docs/schemas.md:35` (Phase 1 already removed `stale-ref` from the category enum here).

## Implementation Steps
1. Read `docs/loop-engine.md` L22-32 (Concept vocabulary) and L55 (four-kinds sentence).
2. Add to the finding role: "A finding is a **deferred decision**, not a thing to be removed. Every finding has explicit exits — **promote** (recurs → rule), **resolve** (fixed / no longer relevant), **re-verify** (resume the deferral), **supersede** (consolidated into a change-log, lineage preserved), **dispatch** (route to parallel-fix work via an external coordination substrate). No mechanism silently closes a finding; the close is always an explicit human/agent exit with a recorded reason."
3. Add a note: "`dispatch` is a **non-terminal routing action**, not a terminal status. The finding stays in its current state while work happens; it resolves when the fix ships."
4. Verify `docs/meta-state-lifecycle.md` does not reference `stale-ref` (grep) — no edit needed.
5. Verify `docs/schemas.md:35` no longer lists `stale-ref` (Phase 1).
6. Cross-check: the explicit-exits set in the doc matches the tools that exist (`meta_state_promote_rule`, `meta_state_resolve`, `meta_state_re_verify`, `meta_state_supersede`, `meta_state_dispatch_finding`).
7. **Close out the source report** (`plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md`):
   - Mark **Rec 8** (collapse `stale-ref` to derived view) `[DONE]` — resolved by Phase 1.
   - Mark **Rec 10** (wire stale queue into session-start) `[DONE]` — resolved by Phase 3.
   - Mark **Rec 11** (re-tighten cap-test threshold) `[DONE]` — resolved by Phase 1 (threshold 25 → 12; 10 + 2 headroom, slightly above Rec 11's ~10 to absorb organic drift).
   - Note **Rec 12** (change-log trigger rule) stays **half-solved**: the scoped dispatch-close case ships in Phase 3; the general trigger rule is deferred to the lifecycle-redesign plan (unchanged from addendum 2's status).
   - Leave **Rec 9** (encode triage workflow as a consult-gate/skill) open — this plan builds the Rec 10 surfacing + close flow, not a consult-gate.
   - Update the addendum's `**Status**` line from "brainstormed and design agreed → see `plans/reports/brainstorm-260704-...`" to "shipped → see `plans/260704-0301-stale-findings-dispatch-handle/`".

## Success Criteria
- [ ] `docs/loop-engine.md` carries the "deferred decision" statement and the explicit-exits set including `dispatch` and `supersede`.
- [ ] `docs/loop-engine.md` states `dispatch` is a non-terminal routing action, not a terminal status.
- [ ] `docs/meta-state-lifecycle.md` has no `stale-ref` reference (grep clean); no edit needed.
- [ ] `docs/schemas.md:35` no longer lists `stale-ref` (Phase 1).
- [ ] The explicit-exits set matches the shipped tools.
- [ ] `plans/reports/from-ck-predict-to-operator-260704-0105-...report.md` marks Rec 8, Rec 10, Rec 11 as `[DONE]` (resolved by this plan's Phases 1 and 3); Rec 12 noted half-solved (scoped dispatch-close case shipped, general trigger rule deferred); Rec 9 left open (no consult-gate built); addendum `**Status**` line updated to "shipped → see `plans/260704-0301-stale-findings-dispatch-handle/`".

## Risk Assessment
- **Low — L1 "explicit exits" set omits an exit.** Mitigation: the set includes `supersede` (used in Phase 1) and `dispatch` (Phase 2); cross-check against the tool list in step 6.
- **Low — doc/code drift.** Mitigation: Phase 4 ships after Phase 1 (which removes `stale-ref` from `docs/schemas.md`); the L1 statement is implementation-agnostic and does not list categories.
