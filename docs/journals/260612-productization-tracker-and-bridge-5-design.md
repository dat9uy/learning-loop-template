# Brainstorm + Design: productization master tracker + Bridge 5 design proposal

## Summary

Two new reports written to anchor the meta-surface atomic front work as canonical, queryable artifacts:

1. **`plans/reports/productization-260612-1530-master-tracker.md`** — canonical productization tracker. 6 phases (Phase A re-debate / Phase B Bridge 5 / Phase C Mastra 0-1 / Phase D Mastra 2-3 / Phase E Mastra 4-5 / Phase F Bridge 7), 30 sub-phases total, GitHub-flavored checkboxes, update protocol that calls this report canonical and `meta-state.jsonl` the audit trail.

2. **`plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md`** — Bridge 5 design proposal. Tied to the existing `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` entry. 4 sub-phases (~6h), 11 acceptance criteria, deletes the `unwrapItemWrap` helper, reverts 4 ad-hoc reader patches.

## Why these reports

The Mastra research report (§3.8, operator-approved contract 2026-06-12) gives a 7-step implementation order. The consistency report validates 9 findings are resolved. **Neither is a tracker** — they tell you *what* to do, not *where you are right now*. The two new reports split the gap:

- The **tracker** is canonical for *phase state*. One file to read at session start. Phase state legend (`[ ]` / `[x]` / `[~]` / `[!]`) makes diffs trivial.
- The **Bridge 5 design** is the proposal text for the existing loop-design entry. The 2026-06-10 entry has been sitting `active` with empty `proposed_design_for` and `addresses`; this design populates both on operator approval.

## Phase A — product-surface re-debate (the real work)

The user pushed back on whether Phase A (re-debate product-surface) was already done by the consistency report + AGENTS.md rewrite. Honest answer: **the contract is locked but the act is not done.**

What the 2026-06-12 reframe *did*: collapsed Bridge 5+6 into the meta-surface, voided Bridges 1-4, rewrote `AGENTS.md` §1 + §10 from scratch, promoted the §3.10 reframe to operator-approved contract. **The reframe is the *decision* that the re-debate must happen; it is not the re-debate itself.**

What the re-debate *must do*: use the meta-surface as substrate to decide whether the 8 product-surface schemas (capability, claim, decision, experiment, index-entry, observation, resource-budget, risk) are the right shape, or whether some should be deleted, or whether the meta-surface's 4-kind union should be extended. Q8 (observations) is the only question explicitly reopened in the locked contract. The other 4 sub-phases (Q-index, Q-capability, Q-evidence+resource-budget, Q-bridge-5-instance) are *inferred* from F3 of the consistency report and §3.10 "What the 2026-06-12 reframe eliminates" — each tagged `[inferred]` in the tracker so the next session can defend or re-debate them.

## Mutations applied

All mutations went through MCP tools; zero direct file I/O to `meta-state.jsonl` or to `records/**`.

1. `meta_state_log_change` — registry anchor for the report pair
   - ID: `meta-260612T1508Z-plans-reports-productization-260612-1530-master-tracker-md-p`
   - Target: `plans/reports/productization-260612-1530-master-tracker.md + plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md`
   - Dimension: `semantic`
   - `applies_to.surfaces`: `["plans/reports", "meta-state"]`
   - `applies_to.schemas`: `[both report paths]`

No `meta_state_propose_design` / `meta_state_patch` was called on `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` — the Bridge 5 design report's §8 makes the populate call an explicit operator decision on approval, not an automatic side-effect.

## Why Option β over Option α

The user picked Option β (full Q8 re-debate as Phase A) over Option α (just "adopt the locked contract"). The deciding factor was the user's intuition that "apart from observation, we have a lot of things to clear as well." The tracker reflects that with 5 Phase A sub-phases, 4 of them `[inferred]` (not in the locked contract but open by construction). The tracker now explicitly notes Phase A is a parallel track, not a blocker for Phase B-E.

## YAGNI / KISS / DRY check

- **YAGNI:** the tracker is 6 phases, not 12. The Bridge 5 design is 4 sub-phases, not 8. Compression over granularity. Phase A's 9-sub-phase initial draft was cut to 5 per the user's call.
- **KISS:** the tracker is one markdown file with checkboxes. The Bridge 5 design is one markdown file with a proposal section + a 4-phase implementation plan. No new tools, no new schemas, no new registry surfaces.
- **DRY:** the tracker links to the existing research + consistency reports. The Bridge 5 design links to the existing loop-design entry + the existing next-up finding. No content duplication; the new reports are pure navigation + state.

## What's next (next session)

Per the user's "let's write both reports then continue the debate":

1. **Debate Phase A.** The 5 sub-phases (A1-A5) are the open questions. The next session should pick the highest-leverage one (likely A1 Q8 since it has an explicit re-debate in the contract) and either pick A/B/C/D or commit to deferral with rationale.
2. **Decide on the Bridge 5 design proposal.** Run `meta_state_propose_design` (or `meta_state_patch`) to populate `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from` with the proposed `proposed_design_for` + `addresses` from the design's §8. Then resolve the 2 active next-up findings.
3. **Open the first Bridge 5 plan.** When the design is approved, the next step is `plans/<date>-bridge-5-schema-as-source-of-truth/` with a Phase 0/1/2/3 layout matching the design's §4. The plan inherits the design's acceptance criteria and risk analysis.

## Cross-references

- **Tracker:** `plans/reports/productization-260612-1530-master-tracker.md`
- **Bridge 5 design:** `plans/reports/brainstorm-260612-1530-bridge-5-schema-as-source-of-truth.md`
- **Registry anchor:** `meta-260612T1508Z-plans-reports-productization-260612-1530-master-tracker-md-p` (change-log)
- **Mastra research report (contract):** `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.8, §3.10
- **Consistency report:** `plans/reports/consistency-260612-1300-mastra-research-report.md` (F1-F9 all resolved)
- **AGENTS.md (the reframe):** §1 "The Meta-Surface (the only bound surface)" + §10 "Where This Project Is Heading"
- **Active loop-design (target of the Bridge 5 design):** `loop-design-schema-as-source-of-truth-bridge-5-derive-tool-schemas-from`
- **Active next-up finding (target of the Bridge 5 design):** `meta-260612T1131Z-next-up-adopt-loop-design-schema-as-source-of-truth-bridge-5`
- **Wire-format quirk finding (the structural blocker):** `meta-260612T0058Z-next-up-wire-format-quirk-on-meta-state-patch-proposed-desig`
