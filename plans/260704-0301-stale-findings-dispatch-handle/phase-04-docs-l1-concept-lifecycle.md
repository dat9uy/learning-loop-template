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

**P2 F5 — Execution-order decomposition:** Phase 4's steps (numbered 1-10 in the implementation section below) are NOT all dependent on [1, 2, 3]:
- **Steps 1-4, 8** (docs edits to `docs/loop-engine.md` + `docs/meta-state-lifecycle.md` verification) are implementation-agnostic and could ship with Phase 1 alone.
- **Step 7** (cross-check: mechanism mapping matches shipped tools) requires Phase 2's `meta_state_dispatch_finding` to exist.
- **Steps 9-10** (source-report closeout, `tools/learning-loop-mastra/docs/schemas.md:35` verification) require Phase 1's category-enum removal.

For shipping: Phase 4 keeps its declared `dependencies: [1, 2, 3]` (it ships as the closure phase), but the **execution order within the phase** is: steps 1-4, 8 → step 7 (cross-check) → steps 9-10 (closeout). The split is documented here rather than creating Phase 4a/4b files (KISS — single closure phase with ordered steps).

**INC-3 + INC-9 — Step numbering corrected.** Implementation section steps are 1-10 (not 1-12 as in earlier drafts). Cross-check is step 7; closeout is step 9.

## Requirements
- Functional: `docs/loop-engine.md` carries the deferred-decision statement and the explicit-exits set including `dispatch` and `supersede`. The concept surface states `dispatch` is a routing action, not a terminal status.
- Non-functional: docs match the shipped code (Phase 1 removed `stale-ref` from the category enum at `core/meta-state.js` + `tools/learning-loop-mastra/docs/schemas.md`; Phase 4 reflects this in the concept surface, not by re-listing categories). **INC-6 fix:** references use the full path.

## Architecture
The L1 doc (`docs/loop-engine.md`) is implementation-agnostic. The finding role today sits in the "Concept vocabulary" block (L22-32) and the four-kinds sentence (L55). The deferred-decision framing + explicit-exits set are additions to the finding role, not a status-lifecycle change. `docs/meta-state-lifecycle.md` is a status-lifecycle doc (6-state `reported|active|stale|resolved|superseded|auto-resolved` at L30-52); `stale-ref` is NOT in it (it is a category, not a status — scout confirmed via grep), so no edit is needed there. The category enum lives in `docs/schemas.md:35` (updated in Phase 1).

## Related Code Files
- Modify: `docs/loop-engine.md` — add the deferred-decision statement + explicit-exits set to the finding role (Concept vocabulary block L22-32 / four-kinds sentence L55); add `dispatch` as a non-terminal routing action.
- Modify: `plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md` — mark Rec 8, Rec 10, Rec 11 `[DONE]` (resolved by this plan's Phases 1 and 3); note Rec 12 half-solved (scoped dispatch-close case shipped in Phase 3; general trigger rule deferred); leave Rec 9 open (no consult-gate built); update the addendum `**Status**` line from "brainstormed and design agreed" to "shipped → see `plans/260704-0301-stale-findings-dispatch-handle/`".
- Read-only check: `docs/meta-state-lifecycle.md` (confirm no `stale-ref` reference; no edit needed — scout confirmed absent).
- Read-only check: `tools/learning-loop-mastra/docs/schemas.md:35` (Phase 1 already removed `stale-ref` from the category enum here).

## Implementation Steps
1. Read `docs/loop-engine.md` L22-32 (Concept vocabulary) and L55 (four-kinds sentence).
2. **P3 F11 fix — L1 role statement (NO mechanism names):** add to the finding role: "A finding is a **deferred decision**, not a thing to be removed. Every finding has explicit exits — **promote** (recurs → rule), **resolve** (fixed / no longer relevant), **re-verify** (resume the deferral), **supersede** (consolidated into a change-log, lineage preserved), **dispatch** (route to parallel-fix work via an external coordination substrate). No mechanism silently closes a finding; the close is always an explicit human/agent exit with a recorded reason." — written in **role names only**, no tool names (e.g. not `meta_state_promote_rule`, just `promote`). Honors `docs/loop-engine.md:5` ("implementation-agnostic: it names roles, not mechanisms"). **Q4 fix:** also rewrite any existing inline tool-name references in the same edit pass to role names (e.g. `meta_state_log_change` → `change-log role`; `meta_state_resolve` → `resolve`). This maintains the strict L1/L2 split across the doc.
3. Add a note: "`dispatch` is a **non-terminal routing action**, not a terminal status. The finding stays in its current state while work happens; it resolves when the fix ships."
4. Verify `tools/learning-loop-mastra/docs/meta-state-lifecycle.md` does not reference `stale-ref` (grep) — no edit needed. **INC-6 fix:** always use the full path `tools/learning-loop-mastra/docs/meta-state-lifecycle.md` (not `docs/meta-state-lifecycle.md`) in cross-references.
5. Verify `tools/learning-loop-mastra/docs/schemas.md:35` no longer lists `stale-ref` (Phase 1). **INC-6 fix:** always use the full path.
6. **P3 F11 fix — L2 mechanism cross-ref (in `docs/meta-state-lifecycle.md`, NOT `docs/loop-engine.md`):** add a small table mapping each L1 exit to its mechanism tool — `promote → meta_state_promote_rule`, `resolve → meta_state_resolve`, `re-verify → meta_state_re_verify`, `supersede → meta_state_supersede`, `dispatch → meta_state_dispatch_finding`. This belongs in the L2 doc (status lifecycle + mechanism surface), not the L1 doc (concept vocabulary). The L1 doc references "see L2 for mechanism mapping" but does not inline the mapping.
7. **Cross-check:** the mechanism mapping in step 6 matches the tools that exist after Phase 2 (the cross-check gates step 9 against actual shipped tools; if `meta_state_dispatch_finding` was renamed or split, the mapping must follow). **INC-9 fix:** this is the cross-check step (was mislabeled in earlier drafts).
8. **P2 F5 — Execution order note:** this step is the "doc edits" portion of Phase 4 (steps 1-4, 6, 8). Could ship with Phase 1 alone if needed; ships at end of plan as part of closure. **Move on to step 9 only after Phase 2 ships `meta_state_dispatch_finding`**, then step 9-10.
9. **Source-report closeout** (`plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md`):
   - Mark **Rec 8** (collapse `stale-ref` to derived view) `[DONE]` — resolved by Phase 1.
   - Mark **Rec 10** (wire stale queue into session-start) `[DONE]` — resolved by Phase 3.
   - Mark **Rec 11** (re-tighten cap-test threshold) `[DONE]` — resolved by Phase 1 (threshold 25 → 12; 10 + 2 headroom, slightly above Rec 11's ~10 to absorb organic drift). Note: Rec 11 is the recommendation at L172 of the source report; **Q11** (operator/agent symmetry, at L198 of addendum 2) is a separate open question in the unresolved-questions section — not addressed by this plan (the symmetry question needs Rec 12's general trigger rule first).
   - Note **Rec 12** (change-log trigger rule) stays **half-solved**: the scoped dispatch-close case ships in Phase 3; the general trigger rule is deferred to the lifecycle-redesign plan (unchanged from addendum 2's status).
   - Leave **Rec 9** (encode triage workflow as a consult-gate/skill) open — this plan builds the Rec 10 surfacing + close flow, not a consult-gate.
   - **INC-7 fix:** Update the **main-body Status line at L100** (NOT Addendum 2's Status line at L186) from "brainstormed and design agreed → see `plans/reports/brainstorm-260704-...`" to "shipped → see `plans/260704-0301-stale-findings-dispatch-handle/`".
10. **P2 F5 — final verification:** confirm `docs/loop-engine.md` does not name tool mechanisms (role names only — F11 satisfied); confirm `tools/learning-loop-mastra/docs/meta-state-lifecycle.md` has the mechanism mapping table; confirm source-report closeout markers are placed at L100 (not L186).

## Success Criteria
- [ ] `docs/loop-engine.md` carries the "deferred decision" statement and the explicit-exits set including `dispatch` and `supersede` — **role names only, no mechanism/tool names** (P3 F11).
- [ ] `docs/loop-engine.md` states `dispatch` is a non-terminal routing action, not a terminal status.
- [ ] `tools/learning-loop-mastra/docs/meta-state-lifecycle.md` has no `stale-ref` reference (grep clean); no edit needed.
- [ ] `tools/learning-loop-mastra/docs/schemas.md:35` no longer lists `stale-ref` (Phase 1).
- [ ] **P3 F11:** `tools/learning-loop-mastra/docs/meta-state-lifecycle.md` (L2) has the mechanism-mapping table; `docs/loop-engine.md` (L1) does NOT inline tool names — including rewrites of existing inline references (Q4 fix).
- [ ] **INC-6:** all cross-references to docs files use the full path (`tools/learning-loop-mastra/docs/...`) consistently — no mix of `docs/...` and `tools/learning-loop-mastra/docs/...` for the same file.
- [ ] The mechanism mapping matches the shipped tools (cross-checked in step 7).
- [ ] **INC-7:** source-report closeout updates the **main-body Status line at L100** (not Addendum 2's Status line at L186).
- [ ] `plans/reports/from-ck-predict-to-operator-260704-0105-...report.md` marks Rec 8, Rec 10, Rec 11 as `[DONE]` (resolved by this plan's Phases 1 and 3); Rec 12 noted half-solved (scoped dispatch-close case shipped, general trigger rule deferred); Rec 9 left open (no consult-gate built); Q11 (operator/agent symmetry) noted as separate open question in addendum 2 (unresolved); addendum main-body `**Status**` line (L100) updated to "shipped → see `plans/260704-0301-stale-findings-dispatch-handle/`".

## Risk Assessment
- **Low — L1 "explicit exits" set omits an exit.** Mitigation: the set includes `supersede` (used in Phase 1) and `dispatch` (Phase 2); cross-check against the tool list in step 7.
- **Low — doc/code drift.** Mitigation: Phase 4 ships after Phase 1 (which removes `stale-ref` from `docs/schemas.md`); the L1 statement is implementation-agnostic and does not list categories.
- **Low — L1 mechanism drift (P3 F11).** Mitigation: step 6 puts the mechanism mapping in L2 (`tools/learning-loop-mastra/docs/meta-state-lifecycle.md`), not L1 (`docs/loop-engine.md`); L1 references L2 for the mapping. Honors the two-surface split.
- **Low — closeout writes incorrect Rec numbers.** Mitigation: step 9 lists each Rec's content explicitly before writing its `[DONE]` marker; Q11 (separate open question in addendum 2) is noted separately, not as Rec 11.
- **Low — INC-8 wording drift.** The post-migration cap-test count is 10; the threshold is being set to 12 (10 + 2 headroom). Documentation should not say "threshold of 10 has zero headroom" — it should say "post-migration count of 10 has zero headroom against the original threshold of 3; re-tighten to 12 to absorb organic drift".
