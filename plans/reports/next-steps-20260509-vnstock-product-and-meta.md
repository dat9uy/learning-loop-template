---
title: Next Steps — vnstock Product-Level and Meta-Level Work
date: 2026-05-09
source: `ck:problem-solving` follow-up on `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md`
status: recommendation report
inputs:
  - `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md`
  - `plans/260509-1353-vnstock-device-limit-investigation/plan.md`
  - `records/claims/claim-vnstock-install-sandbox.yaml`
  - `records/claims/claim-vnstock-device-limit-mechanism.yaml`
  - `knowledge-packs/vnstock-data/manifest.yaml`
---

# Next Steps: vnstock Product-Level and Meta-Level Work

## Executive Summary

The vnstock record-layer recovery and device-limit investigation are complete. The next work should split into two independent tracks:

1. **Product-level:** decide what the project is allowed to do with the verified vnstock install knowledge now that sandbox install is verified and the device-limit mechanism is understood.
2. **Meta-level:** author the self-improvement plan deferred by the review report's Step 10, so future experiments do not repeat the same record-layer drift.

Do not combine these tracks into one plan. They have different approval surfaces. Product work can touch knowledge-pack publication, vendor account state, subscription/device limits, and possibly future runtime use. Meta work should touch conventions, templates, docs, and validation posture.

## Problem-Solving Lens

The useful simplification is:

> Product-level asks, "What can we safely use or ship from this verified vnstock knowledge?"
>
> Meta-level asks, "What rule would have prevented the confusion, and when is that rule mature enough to codify?"

That split removes several false choices. The device-limit fact does not need to become a meta-rule. The experiment-result convention does not need to block product use. The knowledge-pack publication question does not need to carry all future record-schema improvements.

## Current State

Completed:

- Predecessor resume plan closed at the plan lifecycle layer.
- Record-layer migration completed: per-run experiment YAMLs now exist for run 1, run 2, sandbox 1, and sandbox 2.
- `claim-vnstock-install-sandbox` has `verification.install.status: verified`, proven by sandbox 1.
- `claim-vnstock-device-limit-mechanism` has static and install dimensions verified for the observed Linux Docker sandbox case.
- O14 branch 7b is confirmed: the vendor enforces account-and-OS-global device metering for Linux under the observed `bronze` account state, with `1` Linux device slot.

Still unresolved:

- `knowledge-packs/vnstock-data/` remains draft and empty.
- The fact/capability publication model is intentionally unresolved per R-Q5.
- Durable-fact extraction from the install/device-limit findings is not done.
- Meta Step 10 is not implemented: O7, O8, O10, and O15 still need a self-improvement plan.
- The run-1 experiment YAML still carries the pre-R-Q4 `result: does-not-support` value. This should be accepted as historical drift unless an explicit migration is approved.
- The older brainstorm report mentions a Golden-tier `2 devices/OS` framing, while verified sandbox evidence observed `bronze` and `1 device per OS`.

## Product-Level Next Steps

### P1. Decide the product target before editing the pack

Pick one target:

| Option | Meaning | Recommendation |
|--------|---------|----------------|
| Install-only pack | Publish only sandbox install/import capability and limitations. No live provider calls. | Best next product step if the pack is meant to help future agents install vnstock safely. |
| Facts-only note | Extract durable observations but keep `knowledge-packs/vnstock-data/` draft until fact/capability scope is settled. | Best if the operator wants to preserve R-Q5 deferral strictly. |
| Runtime/product adoption | Approve a new runtime experiment or product use of vnstock data. | Do not start without a separate product decision and risk review. |

Lean: **Install-only pack**, but only if the operator accepts that "install capability" is a product-facing capability distinct from data/runtime capability. If that distinction is not accepted, use Facts-only note and leave the pack draft.

### P2. If Install-only pack is chosen, make publication narrow

Update `knowledge-packs/vnstock-data/` only with claims supported by existing records:

- Capability: install/import `vnstock_data` in sandbox after operator-provided `VNSTOCK_API_KEY` and vendor registration.
- Limitation: on the observed `bronze` Linux account state, only one Linux device slot is available.
- Operational requirement: future clean-fingerprint reruns require operator-performed device clearance or a subscription/device-slot change.
- Prohibitions: no credential capture, no agent-performed vendor account clearance, no live provider calls, no raw data export.

Do not claim production usability, stable vendor policy, cross-OS behavior, or live data access.

### P3. If Facts-only note is chosen, keep it out of the pack for now

Create a vnstock-scoped evidence note or claim update that captures:

- Env-var-driven installer path worked in sandbox 1.
- Account-and-OS-global Linux device metering was observed.
- Observed tier/cap was `bronze` / `1 Linux device`, not Golden / `2 devices/OS`.
- Disposable Docker was sufficient substrate for the mechanism investigation.

Then leave pack publication blocked until the fact/capability layer decision from R-Q5 is made.

### P4. Patch the archival tier/cap mismatch

Add a one-line correction to `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md` near the Golden-tier mention:

> Later sandbox evidence on 2026-05-09 observed the active account as `bronze` with `1` Linux device slot; use the sandbox evidence as authoritative for this account state.

This is a product-record hygiene fix, not a new claim.

### P5. Defer recurring-clearance machinery until there is a concrete rerun

Branch 7b means every future Linux clean-fingerprint rerun consumes the single observed slot. Still, do not design a full vendor-state tracker yet. Re-open only when a concrete rerun or subscription change is planned.

## Meta-Level Next Steps

### M1. Author the Step 10 self-improvement plan now

Create a new plan scoped only to the deferred meta work from the review report:

- O7: Evidence-MD to experiment-YAML conversion workflow, plus a migration helper in the local `learning-loop` skill.
- O8: External Operator Actions Between Reruns documentation.
- O10: Phase success criteria split between process completion and experimental outcome.
- O15: `experiment.result` convention: `supports` | `does-not-support` | `inconclusive` plus `result_reason`.

This plan should not rerun vnstock experiments and should not publish the knowledge pack.

### M2. Codify conversion as one workflow with two modes

Document the evidence-MD to experiment-YAML sweep as one workflow:

- **Migration:** original evidence had a hypothesis and success metrics; structured YAML copies them without reinterpretation.
- **Structuring:** original evidence did not have a clean hypothesis; YAML marks reconstructed fields as post-hoc and stays draft until operator review.

This prevents future agents from treating every evidence-MD as either permanently unstructured or freely convertible.

### M3. Add a non-mutating migration helper to the learning-loop skill

Add a helper to `.claude/skills/learning-loop/` that lets future agents produce a safe migration prompt or checklist when an explicit migration is approved.

Recommended shape:

- Update `.claude/skills/learning-loop/SKILL.md` so the skill recognizes "evidence to experiment migration" as a self-improvement/helper task.
- Add a reusable blueprint to `.claude/skills/learning-loop/references/prompt-blueprints.md`.
- Add mode rules to `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`.

The helper should not mutate records automatically. It should generate a bounded prompt/checklist that asks the migration agent to:

- classify each source evidence file as `Migration`, `Structuring`, or `No migration`;
- preserve original evidence files unchanged;
- create or update experiment YAML only after explicit approval;
- link `source_refs` back to the original evidence MD;
- use `status: draft` for post-hoc structuring until operator review;
- preserve immutable historical records unless an explicit migration decision allows edits;
- run `pnpm validate:records` and `pnpm check` after approved changes.

Defer an executable script until repeated migrations prove the need. One helper prompt/checklist is enough for the current gap.

### M4. Document operator-side external actions

Add an operator-guide subsection for actions like vendor device clearance:

- Agent records the decision and blocked action.
- Operator performs the external mutation outside agent control.
- Operator confirms completion in-band.
- Follow-up experiment records the observed effect.

This is now N=2 enough to codify: the device-clearance decision plus the subsequent sandbox falsification exposed the pattern.

### M5. Fix phase success criteria semantics

Update phase templates/docs so a phase can show:

- Process steps completed.
- Experiment outcome: `supports`, `does-not-support`, or `inconclusive`.
- Blocker/result reason.

This avoids the misleading "mostly checked off" phase when the experimental result is still blocked or inconclusive.

### M6. Adopt R-Q4 prospectively

Add the `experiment.result` convention to `docs/operator-guide.md` before adding schema enforcement:

- `supports`
- `does-not-support`
- `inconclusive`
- sibling `result_reason`

Also codify: **new conventions apply prospectively unless an explicit migration is approved**. That resolves the run-1 YAML drift without mutating a frozen historical experiment just for cosmetic alignment.

### M7. Defer validator/schema hardening

Do not add a schema enum for `experiment.result` yet. Promote the convention to validation only after at least three distinct experiments use it without semantic strain.

## Recommended Sequence

1. Create the meta self-improvement plan for M1-M7.
2. Patch the archival tier/cap mismatch in the older brainstorm report.
3. Ask for a product decision: Install-only pack vs Facts-only note vs Runtime/product adoption.
4. Execute the chosen product path in a separate plan.
5. Re-open recurring-clearance machinery only when another vnstock rerun is scheduled.

## Non-Goals

- Do not rerun the two-sandbox falsification. It already produced a decisive 7b outcome.
- Do not edit the frozen run-1 experiment YAML just to match R-Q4.
- Do not let pack publication force a premature fact/capability model if the operator has not accepted the install-only distinction.
- Do not add validator enum constraints before the result convention has more usage.
- Do not let the agent perform vendor account clearance.

## Decision Points for Operator

Two decisions unblock all useful follow-up work:

1. Should the next product artifact be an **install-only knowledge pack** or a **facts-only record while the pack stays draft**?
2. Should the meta self-improvement plan patch docs only first, or include lightweight validation/reporting changes if they remain schema-neutral?

Lean answers:

- Product: install-only pack, if "install capability" is accepted as distinct from runtime/data capability.
- Meta: docs/templates first; defer validation until the conventions have at least three cases.
