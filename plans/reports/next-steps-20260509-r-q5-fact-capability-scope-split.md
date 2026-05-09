---
title: Next Steps — R-Q5 Resolution Discussion (Fact / Capability Scope Split)
date: 2026-05-09
source: `ck:problem-solving` follow-up after meta self-improvement plan close (`plans/260509-1924-meta-self-improvement`)
status: resolved (Q1/Q2/Q3 settled 2026-05-09 evening); supersedes the prior next-steps report
supersedes: `plans/reports/next-steps-20260509-vnstock-product-and-meta.md`
inputs:
  - `plans/reports/next-steps-20260509-vnstock-product-and-meta.md` (superseded; product-track context inherited)
  - `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md` (R-Q5 origin and re-open trigger)
  - `plans/260509-1924-meta-self-improvement/plan.md` (meta track closeout)
  - `records/claims/claim-vnstock-install-sandbox.yaml`
  - `records/claims/claim-vnstock-device-limit-mechanism.yaml`
  - `records/decisions/decision-20260509T192448Z-experiment-result-convention.yaml`
  - `records/decisions/decision-20260509T192449Z-prospective-convention-application.yaml`
  - `knowledge-packs/vnstock-data/manifest.yaml`
  - `docs/operator-guide.md`
---

# Next Steps: R-Q5 Resolution Discussion (Fact / Capability Scope Split)

## Why This Report Exists

R-Q5 (knowledge-pack publication preconditions and grade split) was deferred in `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md` because the foundational scope decision — whether "facts" and "capabilities" belong to the learning-loop layer or to a separate product layer — had not been made.

The operator has now proposed a concrete resolution. This report captures that proposal, the reasoning that supports it, and the three implementation questions still to settle before any product-track plan is authored. It supersedes `plans/reports/next-steps-20260509-vnstock-product-and-meta.md`, which assumed R-Q5 stayed deferred and therefore couldn't recommend a clear product path.

The old report's product-track P1–P5 framing remains as historical context (forensic, not stale). New product-track shape will live in a follow-up plan once these three questions are settled.

## Resolution Summary (2026-05-09 Evening)

The three implementation questions below have been settled. The pack-abstraction layer is deferred entirely until a concrete external consumer appears. Detailed reasoning is preserved inline at each question.

### Settled Answers

| Question | Settled answer | Effect |
|----------|----------------|--------|
| **Q1** (gating location) | Skip the pack abstraction; facts stay in `records/`. | The fact/capability split is moot until a consumer needs the pack form. Pack-manifest split (A) and entry-level gating (B) both deferred. |
| **Q2** (durable vendor properties) | Combined evidence-only + corroboration approach (lean 2+3). The bronze/1-device fact already lives in `claim-vnstock-device-limit-mechanism.limitations`; the historical Golden capture stays in `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md` as forensic. | No new fact authoring needed. Existing claim limitations carry the current observed state. |
| **Q3** (plan shape) | Cascade-simplified to a single short codification, not a meta+product bundle. The meta+product bundle was justified only as N=1 validation of the pack-fact convention; with Q1 settled, there is no convention to validate. | A small operator-guide note + optional decision YAML, not a plan. |

### Operational Changes Applied

- `knowledge-packs/vnstock-data/facts.yaml` — deleted (was empty `facts: []`).
- `knowledge-packs/vnstock-data/capabilities.yaml` — deleted (was empty `capabilities: []`).
- `knowledge-packs/vnstock-data/manifest.yaml` — `files:` reduced to `[manifest.yaml]`; `summary` rewritten to "Placeholder. Pack is not a publication target; facts live in records/, capabilities deferred to a future product-build experiment."
- `pnpm check` passes (12 records validated).

### Why The Pack Abstraction Was Skipped

The pack form exists to publish curated facts and capabilities to an *external consumer*. No such consumer exists for vnstock today: the records/ layer (claims, experiments, decisions) already encodes the verified knowledge in a queryable form, and there is no downstream agent or product reading from `knowledge-packs/`. Building the pack-fact split now would be speculative structure with no consumer to validate it. The "defer on unset scope" rule applies — when a concrete consumer lands (a product-build experiment, an external publication target), the pack form gets designed against that consumer's actual needs rather than a guess.

The pack folder is retained as a placeholder so the directory anchor and `manifest.yaml` are not lost if a future consumer revives it.

### What Remains Open

- **Capability publication** — deferred entirely. No vnstock capability YAML, no product-build plan. Re-open trigger: operator approves a concrete vnstock product-build experiment.
- **Optional decision YAML** for "facts live in records/, capabilities deferred to product-build, knowledge-packs deferred until external consumer". Not authored yet; operator can request it if the resolution should be record-cited rather than report-cited.
- **Optional operator-guide section** "Fact vs Capability Scope" for cross-pack guidance. Not authored yet; can wait until a second pack candidate appears (avoiding speculative generalization from N=1).

### Plan Decision (2026-05-09 Evening)

No follow-up plan is authored. The three open items above are sub-plan-sized: each is a single file edit, none are sequenced, none have cross-cutting validation. They become direct edits when (and if) the operator decides to record-cite the resolution. The meta plan precedent (4 phases × 1–2h, paired decisions, skill changes) sets the bar — R-Q5 codification is below it.

The larger candidates that *would* warrant a plan (vnstock product-build experiment, second-pack onboarding, schema enum hardening at N≥3) all lack their triggers. Per the "defer on unset scope" rule, no speculative plan is opened.

Re-open triggers for `ck:plan` from this resolution:

1. A concrete external consumer of the pack form lands (e.g., a product-build experiment is approved; an external publication target appears).
2. A second pack candidate appears, providing N=2 corroboration for the fact/capability split before generalizing it.
3. Operator explicitly requests record-cited codification of the R-Q5 resolution as a small-but-tracked plan rather than ad-hoc edits.

Until then, this report is the durable record of the resolution.

## Operator's Proposal (R-Q5 Resolution)

> **Facts stay in the learning-loop layer. Capabilities move to the product scope.**

Operationally:

- `knowledge-packs/<pack>/facts.yaml` is gated on existing claim-verification machinery (e.g., install-verified at minimum, no separate product approval).
- `knowledge-packs/<pack>/capabilities.yaml` is gated on a product-scope decision in addition to whatever claim assurance is required.
- The `learning-loop-vs-product` foundational scope decision that R-Q5 cited is therefore: facts are loop concerns; capabilities are product concerns.

This sets R-Q5's foundation; the deferral rule no longer applies. The "defer on unset scope" memory rule is honored — the foundation is now being set, not assumed.

## Why This Works

### Inversion check

Reverse the proposal: facts in product, capabilities in loop. Both layers break.

- Facts include observations like "vnstocks.com enforces account-and-OS-global Linux device metering at the bronze tier" — purely descriptive, high-volume, often verbatim from approved evidence. Routing every observation through product approval makes the loop useless for capturing knowledge.
- Capabilities tell consumers what they may design, generate, run, call, store, deploy. They are *agent action permissions*. Letting them publish through the loop without product review escapes the very gate product approval exists to police.

The inverse fails decisively. The operator's direction is the principled one.

### Simplification cascade

The split closes parts of three pre-existing open items at once:

| Item | Pre-split state | Post-split closure |
|------|-----------------|---------------------|
| **G9** ("pack has no exit if install never verifies") | Pack stays draft forever; no abandonment path. | Facts get an exit through claim verification. Capabilities legitimately stay parked pending product decision — which is now a documented state, not a stuck state. |
| **O9** (durable-fact extraction queue) | Required separate promotion queue logic. | Promotion is the existing claim-assurance machinery. Fact files cite `claim_ref`; no extra queue. |
| **O11** (parked status pathway) | "Abandoned/parked" was an undefined status class. | Capabilities have a natural "parked-pending-product-decision" state. Facts use existing claim status. |

This is real simplification, not a false economy: the same primitives (claim verification, product decisions) carry both responsibilities; the split only routes them.

### Meta-pattern recognition

The split mirrors well-established separations:

- Wikipedia: encyclopedic facts vs editorial guidelines — different review surfaces, different cadences.
- IRS: tax facts (rates, brackets) vs taxpayer permissions (filing actions) — facts published broadly; permissions gated case-by-case.
- API design: data schema vs RBAC — *what is* vs *what an actor may do*.

Facts and capabilities are similarly orthogonal axes. The proposal names a real distinction; it does not invent one.

## Open Questions Before Authoring a Plan

Three implementation choices remain. Each carries a lean recommendation; none is settled.

### Q1. Where does the gating live: pack-manifest level or entry level?

**Settled:** Neither. The pack abstraction is skipped entirely. Facts stay in `records/`. The framing below is preserved for the day a concrete external consumer revives the pack form.

**Option A — Pack-manifest split.** Split `publication_gate` into `facts_gate` (claim-verified is enough) and `capabilities_gate` (adds `decisions.required_effect: approve` plus a `scope` field).

**Option B — Entry-level gating.** Keep one pack manifest. Each entry in `facts.yaml` carries `claim_ref` only. Each entry in `capabilities.yaml` carries a `decision_ref` field. Pack manifest stays small; gating moves closer to the data.

Lean: **B (entry-level)**. Scales better as packs grow; avoids touching the pack-publication-gate validator now; treats each capability as an independent product decision rather than bundling them under a single pack-level approval.

### Q2. Durable vendor properties (G7 branch (a))

**Settled:** Lean 2+3 holds, simplified by Q1. Since facts are not being lifted into a pack, the existing claim-record state already carries the current observed bronze/1-device fact in `claim-vnstock-device-limit-mechanism.limitations`, and the historical Golden vendor output stays in `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md` as forensic capture. No new fact authoring or promotion step is needed.

The Vietnamese vendor output `Gói Golden = 2 thiết bị mỗi hệ điều hành` (captured in `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md`) describes a vnstocks.com property, not a project assertion. Three ways to handle it:

1. Treat as a fact with `source: vendor-output` and confidence annotation.
2. Keep in evidence only (forensic capture); do not promote to a fact.
3. Promote only after independent corroboration; the operator's vendor-website confirmation already exists for the *current* bronze/1-device state, but the prior Golden tier observation is not corroborated for "now".

Lean: **2 + 3 combined**.

- Keep the historical Golden capture as evidence (forensic; do not promote).
- Promote only the *current corroborated* bronze/1-device observation as a fact, framed as a *current observed state* fact rather than a *durable vendor property* fact.
- Rationale: vendor tier policy is itself transient. Calling it durable is overclaiming. Calling it observed-state is honest and matches the evidence.

### Q3. Plan shape: meta+product bundle, or two plans?

**Settled:** Neither plan-shape was authored. With Q1 settled, the meta+product bundle's N=1-validation rationale collapses (no convention to validate, no facts to extract). The follow-up work, if any, is a single short codification step — an optional decision YAML and/or a short operator-guide note — not a plan. The bundle/two-plan framing below is preserved for the day a concrete pack consumer makes the convention worth codifying.

**Option A — Bundle.** One plan does both:
- Codify R-Q5 resolution as a decision YAML and an operator-guide section ("Fact vs Capability Scope").
- Extract initial vnstock facts into `knowledge-packs/vnstock-data/facts.yaml` as N=1 validation of the convention.

**Option B — Two plans.** Meta plan codifies R-Q5; product plan (blocked by meta) extracts vnstock facts.

Lean: **A (bundle)**. Vnstock is the *first* user of the convention, so validation-by-use is part of the codification. Splitting forces an empty product plan that just waits on the meta plan. After this first pass, future packs use the convention without re-running the meta codification — cleanly product-only from then on.

Trade-off acknowledged: this re-mixes meta and product approval surfaces, which the previous closure deliberately separated. The N=1 rationale is the justification; if it generalizes, the next pack uses the convention without re-bundling.

## Out of Scope (Do Not Decide Now)

> **Status (2026-05-09 evening):** Most items below are now stronger after Q1 settled — there is even less reason to touch them. Updated inline.

- **Schema enum / validator hardening for the split.** Defer per the convention-before-schema rule that M7 absorbed (`record:decision-20260509T192448Z-experiment-result-convention`). Promote to schema only at N≥3 packs using the split without strain. **Now stronger:** with no pack-fact convention in active use, schema work is even further deferred.
- **Vnstock capability publication.** Capabilities.yaml stays empty pending a separate product-build decision. This report does not approve or scope that decision. **Now updated:** capabilities.yaml has been deleted (was empty); capability publication remains deferred entirely until a product-build experiment is approved.
- **Other packs.** This proposal generalizes to all packs, but no other pack candidates exist yet. Re-evaluate at the second pack. **Still applicable.**
- **Migration of existing pack manifests.** ~~`knowledge-packs/vnstock-data/manifest.yaml` currently has a single `publication_gate`. If Q1 settles as A (manifest split), the manifest needs a small migration. If Q1 settles as B (entry-level), the manifest stays as-is and Q1 is purely additive at the entry level. Defer the manifest decision to Q1.~~ **Resolved:** manifest reduced to `files: [manifest.yaml]` and a placeholder summary; `publication_gate` retained for low-cost reversibility.

## Recommended Sequence

> **Status (2026-05-09 evening):** Q1/Q2/Q3 settled inline. The sequence below is preserved as the original recommendation. Actual outcome: pack abstraction skipped (Q1), no fact extraction or convention validation needed (Q2/Q3 collapse), pack folder reduced to placeholder. See "Resolution Summary" at the top of this report.

1. ~~Discuss and settle Q1, Q2, Q3 (this report sets the stage; the operator picks).~~ Done.
2. ~~Author a single plan implementing the settled answers (likely meta+product bundle per Q3 lean).~~ Not needed — Q3 collapsed when Q1 settled.
3. ~~Validate the convention with vnstock fact extraction.~~ Not needed — no convention to validate.
4. Hold capability publication for a separate product-build plan. (Still applicable; deferred entirely.)

## Inherited from the Superseded Report

The superseded report's still-applicable items, retained here for completeness:

- **Meta track is closed.** Plan `260509-1924-meta-self-improvement` shipped M2/M3/M5/M6 on 2026-05-09; M4 deferred (N=1 trigger), M7 absorbed. `pnpm validate:records` and `pnpm check` passed.
- **Authoritative tier/cap.** Bronze, 1 Linux device, operator-confirmed via `vnstocks.com/account?section=devices` on 2026-05-09. Sandbox-1 evidence corroborates.
- **P4 supersede sweep is a no-op at this update.** No live assertion-level targets exist (verified by re-grep). Optional new evidence note (capturing the operator's vendor-website confirmation as a distinct observation) remains available but is new evidence capture, not record hygiene.
- **The run-1 experiment YAML retains `result: does-not-support`** as historical drift per `record:decision-20260509T192449Z-prospective-convention-application` (no migration approved).
- **Non-goals carry over:** do not rerun the two-sandbox falsification; do not edit frozen experiment YAMLs for cosmetic alignment; do not let the agent perform vendor account clearance; do not add validator enum constraints before the result convention has more usage.

## Decision Points for Operator

> **Status (2026-05-09 evening):** All three points are settled. Recorded inline below for traceability.

1. ~~Which option for Q1 (gating location)?~~ **Settled:** Skip the pack abstraction entirely. Facts stay in `records/`. Pack folder retained as placeholder (manifest only).
2. ~~Which option for Q2 (durable vendor properties)?~~ **Settled:** Lean 2+3, simplified by Q1 — current bronze/1-device fact already lives in claim limitations; historical Golden capture stays as evidence.
3. ~~Which option for Q3 (plan shape)?~~ **Settled:** Neither plan-shape authored. Collapses to optional decision YAML + optional operator-guide note; not a plan.

~~Once these three land, the next plan can be authored.~~ All settled; no plan needed at this point. Re-open trigger: a concrete external consumer of the pack form (e.g., a vnstock product-build experiment) appears.

## Unresolved Questions

- ~~Does the entry-level approach (Q1 lean B) require a small change to `knowledge-packs/<pack>/facts.yaml` and `capabilities.yaml` schema (currently `facts: []` and `capabilities: []` arrays), or can it ride on existing list-of-objects shape with new optional fields? Resolved during plan authoring, not here.~~ Moot — Q1 settled to skip the pack abstraction.
- ~~If Q3 lean A (bundle) is taken, does the operator want the decision YAML and the operator-guide edit in one phase or split? Resolved during plan authoring.~~ Moot — Q3 collapsed.
- ~~Is the bronze/1-device fact authored against `claim-vnstock-install-sandbox` or `claim-vnstock-device-limit-mechanism` (or both)? Resolved during fact extraction phase.~~ Moot — fact already in `claim-vnstock-device-limit-mechanism.limitations`; no separate fact extraction.
- **(New)** Should a decision YAML codify "facts in records/, capabilities deferred, knowledge-packs deferred until external consumer" so the resolution is record-cited rather than report-cited? Operator call. Authoring is small (~1 file) but adds a maintenance surface.
- **(New)** Should `knowledge-packs/vnstock-data/manifest.yaml` retain its `publication_gate` block, or strip it to the bare minimum (id/domain/status/summary/files) since the gate is unreachable while the pack is a placeholder? Currently retained for low-cost reversibility.
