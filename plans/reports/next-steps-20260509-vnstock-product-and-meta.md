---
title: Next Steps — vnstock Product-Level and Meta-Level Work
date: 2026-05-09
source: `ck:problem-solving` follow-up on `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md`
status: superseded 2026-05-09 evening
superseded_by: `plans/reports/next-steps-20260509-r-q5-fact-capability-scope-split.md`
inputs:
  - `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md`
  - `plans/260509-1353-vnstock-device-limit-investigation/plan.md`
  - `plans/260509-1924-meta-self-improvement/plan.md`
  - `records/claims/claim-vnstock-install-sandbox.yaml`
  - `records/claims/claim-vnstock-device-limit-mechanism.yaml`
  - `records/decisions/decision-20260509T192448Z-experiment-result-convention.yaml`
  - `records/decisions/decision-20260509T192449Z-prospective-convention-application.yaml`
  - `knowledge-packs/vnstock-data/manifest.yaml`
---

> **Superseded by:** `plans/reports/next-steps-20260509-r-q5-fact-capability-scope-split.md` (2026-05-09 evening). The operator proposed a concrete R-Q5 resolution (facts in learning-loop layer, capabilities in product scope), invalidating this report's deferred-R-Q5 framing for product-track recommendations. Meta-track closeout summary, P4 sweep no-op finding, and authoritative tier/cap statement are inherited into the superseding report's "Inherited from the Superseded Report" section. This report is retained for forensic context.

# Next Steps: vnstock Product-Level and Meta-Level Work

## Executive Summary

The vnstock record-layer recovery and device-limit investigation are complete. The next work should split into two independent tracks:

1. **Product-level:** decide what the project is allowed to do with the verified vnstock install knowledge now that sandbox install is verified and the device-limit mechanism is understood.
2. **Meta-level:** author the self-improvement plan deferred by the review report's Step 10, so future experiments do not repeat the same record-layer drift.

Do not combine these tracks into one plan. They have different approval surfaces. Product work can touch knowledge-pack publication, vendor account state, subscription/device limits, and possibly future runtime use. Meta work should touch conventions, templates, docs, and validation posture.

## Status Update (2026-05-09 evening)

**Meta track: closed.** Plan `plans/260509-1924-meta-self-improvement` shipped four phases on 2026-05-09:

- M6 (Phase 1) — `experiment.result` convention + paired decisions in `docs/operator-guide.md` and `records/decisions/decision-20260509T192448Z-experiment-result-convention.yaml`, `records/decisions/decision-20260509T192449Z-prospective-convention-application.yaml`.
- M2 (Phase 2) — Evidence-MD to Experiment-YAML Conversion section landed in `docs/operator-guide.md` (Migration / Structuring modes).
- M3 (Phase 3) — `learning-loop` skill helper updates: `SKILL.md`, `references/prompt-blueprints.md`, `references/meta-evidence-self-improvement.md`.
- M5 (Phase 4) — Phase Success Criteria template in `docs/operator-guide.md`.
- M4 — deferred per N=1 (re-open trigger: a second operator-side mutation between reruns).
- M7 — absorbed into Phase 1 decision YAML's `blocked_actions` clause; no separate work.

`pnpm validate:records` and `pnpm check` passed on the closing run.

**Product track: untouched.** P1–P5 still pending. P1 still requires an operator decision on product target.

**P4 sweep: no live targets.** Re-grepped on 2026-05-09 evening. The brainstorm `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md` does not actually contain a `Golden` / `2 devices/OS` *assertion* — it is a meta-process Q1–Q5 brainstorm and never asserted tier/cap (verified by `grep -i golden|tier|2 device` returning zero hits in the file's only commit `e87ffa2`). The only literal `Golden = 2 devices/OS` text lives in `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md` line 72 as a forensic capture of vendor output ("Gói Golden của bạn chỉ cho phép 2 thiết bị mỗi hệ điều hành") and in `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md` as recall/contrast (G7 context, lines 49/108/296/306). Per P4's own rule ("Historical discussions that *recall* the prior hypothesis ... are not stale; only artifacts that *assert* the wrong tier/cap need superseding"), neither qualifies. **The supersede sweep is currently a no-op.** P4 step 3 (optional evidence note capturing the operator's vendor-website confirmation) remains available if the operator wants a distinct observation point, but it is not record hygiene; it is new evidence capture.

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

- `knowledge-packs/vnstock-data/` remains draft and empty (`facts: []`, `capabilities: []`).
- The fact/capability publication model is intentionally unresolved per R-Q5.
- Durable-fact extraction from the install/device-limit findings is not done.
- ~~Meta Step 10 is not implemented: O7, O8, O10, and O15 still need a self-improvement plan.~~ **Resolved 2026-05-09:** plan `260509-1924-meta-self-improvement` shipped M2/M3/M5/M6; M4 deferred (N=1); M7 absorbed.
- The run-1 experiment YAML still carries the pre-R-Q4 `result: does-not-support` value. This is now formally accepted as historical drift per `record:decision-20260509T192449Z-prospective-convention-application` (no migration approved).
- Authoritative tier/cap: operator confirmed via `vnstocks.com/account?section=devices` on 2026-05-09 that the active subscription is `bronze` with `1 Linux device` cap. Sandbox-1 evidence corroborates. Conflicting artifacts (e.g., the older brainstorm report's Golden-tier / `2 devices/OS` framing) must be superseded (see P4) — but per the Status Update above, no live assertion-level targets currently exist.

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

### P4. Supersede artifacts that contradict the bronze / 1 Linux device fact

Authoritative state (2026-05-09): operator confirmed via `vnstocks.com/account?section=devices` that the active subscription is `bronze` with `1 Linux device` cap. Sandbox-1 evidence corroborates.

Treat any artifact that asserts a different tier or cap as stale and apply a supersede operation (record-hygiene patterned on the loop's `## Supersedes` mechanism, but applied to reports as a callout):

1. Insert a `**Superseded by:**` callout at each stale section pointing to (a) the operator's vendor-website confirmation and (b) sandbox-1 evidence.
2. Repeat for any future record audit that surfaces additional artifacts contradicting the authoritative state.
3. Optionally author a short evidence note in `records/evidence/vnstock-data/` capturing the operator's website confirmation as a distinct observation point (separate from the sandbox install evidence).

Known stale artifact at this update:

- `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md` — Golden-tier / `2 devices/OS` reference.

Historical discussions that *recall* the prior hypothesis (e.g., the review report's G7 context) are not stale; only artifacts that *assert* the wrong tier/cap need superseding.

This is product-record hygiene, not a new claim. Stands independent of the P1 product-target decision; can run before that decision lands.

### P5. Defer recurring-clearance machinery until there is a concrete rerun

Branch 7b means every future Linux clean-fingerprint rerun consumes the single observed slot. Still, do not design a full vendor-state tracker yet. Re-open only when a concrete rerun or subscription change is planned.

## Meta-Level Next Steps

> **Track status (2026-05-09 evening): closed.** All meta items below are resolved or formally deferred. See "Status Update" near the top for the closeout summary. Items kept in this section as reference/history; do not re-open without a new trigger event.

### M1. Author the Step 10 self-improvement plan now [DONE]

Create a new plan scoped only to the deferred meta work from the review report:

- O7: Evidence-MD to experiment-YAML conversion workflow, plus a migration helper in the local `learning-loop` skill.
- O8: External Operator Actions Between Reruns documentation.
- O10: Phase success criteria split between process completion and experimental outcome.
- O15: `experiment.result` convention: `supports` | `does-not-support` | `inconclusive` plus `result_reason`.

This plan should not rerun vnstock experiments and should not publish the knowledge pack.

Note: M1 is the act of calling `ck:plan` with the spec below; M2–M7 are the actual phases of the resulting plan. See "Meta Plan Scoping" for ordering, output paths, decision-record output, and explicit out-of-scope items.

### M2. Codify conversion as one workflow with two modes [DONE]

Document the evidence-MD to experiment-YAML sweep as one workflow:

- **Migration:** original evidence had a hypothesis and success metrics; structured YAML copies them without reinterpretation.
- **Structuring:** original evidence did not have a clean hypothesis; YAML marks reconstructed fields as post-hoc and stays draft until operator review.

This prevents future agents from treating every evidence-MD as either permanently unstructured or freely convertible.

### M3. Add a non-mutating migration helper to the learning-loop skill [DONE]

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

### M4. Document operator-side external actions [DEFERRED]

Add an operator-guide subsection for actions like vendor device clearance:

- Agent records the decision and blocked action.
- Operator performs the external mutation outside agent control.
- Operator confirms completion in-band.
- Follow-up experiment records the observed effect.

N count check: the device-clearance decision is N=1 of "External Operator Actions Between Reruns"; the sandbox falsification observed the *effect* of that single action, not a second instance of the action class. Whether that counts as N=2 (one action + one verified pattern) or N=1 is a judgment call.

Lean: defer M4 until a second concrete operator-action-between-reruns case lands (e.g., a future vendor-side change like a subscription upgrade or a repeated clearance). The pattern is not load-bearing for any current blocker; one decision YAML already captures the sole instance. Re-open trigger: a second operator-side mutation between reruns is recorded.

### M5. Fix phase success criteria semantics [DONE]

Update phase templates/docs so a phase can show:

- Process steps completed.
- Experiment outcome: `supports`, `does-not-support`, or `inconclusive`.
- Blocker/result reason.

This avoids the misleading "mostly checked off" phase when the experimental result is still blocked or inconclusive.

Edit target: phase templates live in `~/.claude/rules/documentation-management.md` (global, out-of-repo). Lean: land this convention as a project-local subsection in `docs/operator-guide.md` rather than editing the global rules file. The plan may instead create a dedicated `docs/phase-template.md` if the operator prefers; pick one in planning.

### M6. Adopt R-Q4 prospectively [DONE]

Add the `experiment.result` convention to `docs/operator-guide.md` before adding schema enforcement:

- `supports`
- `does-not-support`
- `inconclusive`
- sibling `result_reason`

Also codify: **new conventions apply prospectively unless an explicit migration is approved**. That resolves the run-1 YAML drift without mutating a frozen historical experiment just for cosmetic alignment.

### M7. Defer validator/schema hardening [DONE — absorbed]

Do not add a schema enum for `experiment.result` yet. Promote the convention to validation only after at least three distinct experiments use it without semantic strain.

## Meta Plan Scoping

This section pins the structure of the meta plan so `ck:plan` does not have to invent it.

### Phases (M1 is recursive; not a phase)

Internal ordering with rationale:

1. **M6 — operator-guide convention** (`docs/operator-guide.md`)
   - Lands `experiment.result: supports | does-not-support | inconclusive` plus sibling `result_reason`.
   - Lands the prospective-application rule: new conventions apply forward unless an explicit migration is approved.
   - Output: docs edit + paired decision YAMLs (see "Decision-record output" below).
2. **M2 — conversion workflow doc** (`docs/operator-guide.md`)
   - One workflow with two named modes: Migration (verbatim) / Structuring (post-hoc, `status: draft` until operator review).
   - Output: docs edit.
3. **M3 — learning-loop skill helper** (`.claude/skills/learning-loop/`)
   - Touches `SKILL.md`, `references/prompt-blueprints.md`, `references/meta-evidence-self-improvement.md`.
   - Non-mutating: produces a prompt/checklist only; references M2's workflow.
   - Output: skill edits.
4. **M5 — phase success-criteria template** (`docs/operator-guide.md`)
   - Splits process completion from experiment outcome.
   - Output: docs edit (project-local subsection; do not touch global rules file).
5. **M4 — external operator actions doc** (`docs/operator-guide.md`) — *conditional*
   - Land only if planning judges the device-clearance case + falsification verification as N=2; otherwise defer per the unset-scope rule with explicit re-open trigger.
   - Output: docs edit (conditional).
6. **M7 — validator/schema deferral** (no-op)
   - No file change. Sustains convention-first-then-schema rule. Re-open after N≥3 distinct experiments use M6's convention without strain.

Dependency notes:

- M6 must land before M5, since the success-criteria template references `inconclusive` semantics from M6.
- M2 must land before M3, since the helper references the workflow modes.
- M4 is independent but conditional.
- M7 is a no-op enforcement; it follows M6 logically but requires no separate action.

### Decision-record output (YES)

Author decision YAMLs under `records/decisions/`, paired with the M6 docs edit (not separate phases):

- `decision-<UTC>-experiment-result-convention.yaml` — codifies the `experiment.result` enum (convention, not schema enforcement) plus `result_reason` sibling. Cites R-Q4 and the M6 operator-guide section.
- `decision-<UTC>-prospective-convention-application.yaml` — codifies the rule that new conventions apply prospectively unless an explicit migration is approved. Cites the run-1 YAML drift as the precipitating case.

If M4 lands (not deferred), pair it with `decision-<UTC>-external-operator-actions.yaml` citing the device-clearance case.

### Approval surfaces (declared upfront)

- `docs/operator-guide.md` — M2, M4 (conditional), M5, M6.
- `.claude/skills/learning-loop/` — M3.
- `records/decisions/` — M6 paired decisions; M4 paired decision if M4 lands.
- No edits to: `records/claims/`, `records/evidence/`, `records/experiments/`, `knowledge-packs/`, `tools/`, validators, schemas.

### Out of scope (explicit; do not re-open inside this plan)

- O9 (durable-fact extraction + pack promotion queue) — gated on R-Q5 scope decision.
- O11 (abandoned/parked status pathway) — only fires if a future rerun also fails.
- P1–P5 (all product track work) — separate plan.
- Item D (recurring-clearance vs subscription class) — only fires when a concrete rerun is scheduled.
- Item E (container-substrate dependency record class) — only fires at N≥2 or scope decision.
- Item F / P4 (brainstorm tier/cap supersede) — product-record hygiene; separate from meta plan.
- R-Q5 (knowledge-pack publication preconditions and grade split) — foundational scope decision still unset.

### Validation

`pnpm validate:records` and `pnpm check` run after any record edit (relevant only for M6 paired decision YAMLs and an M4 paired decision if M4 lands). Docs and skill edits do not trigger validators; rely on operator sanity-read.

## Recommended Sequence

> **Step 1 done; Step 2 found to be a no-op; Steps 3–5 still open.**

1. ~~Call `ck:plan` with the "Meta Plan Scoping" spec above to author the meta self-improvement plan covering M2–M7.~~ **Done 2026-05-09:** plan `260509-1924-meta-self-improvement` shipped and validated.
2. ~~Run the supersede sweep for artifacts that contradict the bronze / 1 Linux device authoritative state (per P4).~~ **No-op 2026-05-09:** see Status Update; no live assertion-level targets exist. P4 step 3 (optional vendor-website evidence note) remains available but is new evidence capture, not record hygiene.
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

Resolved during this update (2026-05-09):

- **Decision-record output for the meta plan: yes.** The plan authors decision YAMLs paired with the M6 docs edit (`decision-<UTC>-experiment-result-convention.yaml` and `decision-<UTC>-prospective-convention-application.yaml`); pair an M4 decision YAML if M4 lands. See "Meta Plan Scoping" → "Decision-record output (YES)".
- **Authoritative tier/cap for the vnstocks account:** `bronze`, `1 Linux device`, operator-confirmed via vendor website on 2026-05-09. Conflicting artifacts must be superseded (see P4).

Resolved during the 2026-05-09 evening update (post meta-plan close):

- **Decision 2 (meta scope) is now moot.** The meta plan landed as docs/skill/decision-YAML only with no validation/reporting changes — i.e., the operator's "lean" answer was followed.
- **P4 sweep has no live assertion-level targets.** Only forensic vendor-output captures and recall references exist. Optional new evidence note (P4 step 3) is the only remaining product-record action and is itself optional, not required.
- **Product-target decision (P1) is still required and is the only blocker for any product-track work.**
