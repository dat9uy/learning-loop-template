---
title: Review — vnstock Resume Plan Record-Layer Gaps
date: 2026-05-09
source: `/problem-solving` + `/ck:predict` discussion of `plans/260508-2030-vnstock-install-resume/phase-03-experiment-rerun.md` blocked outcome
input: user observation that Phase 3 produced evidence MD only, not the "experiment YAML + evidence" pair expected
status: review v2 (post-discussion 2026-05-09); 6/6 questions resolved (Q5 by deferral); open items deferred to a follow-up plan
---

# Review: vnstock Resume Plan Record-Layer Gaps

## Cold-Start Reading Order (for next-session agent)

If you are starting a fresh-context session and have been pointed at this report:

1. Read this report end-to-end before any tool use. The G/D/O cross-references only make sense after a full pass.
2. Read `plans/260508-2030-vnstock-install-resume/plan.md` and its phase files. That is the *failing* plan referenced throughout this report. It must be closed out before any work in this report begins.
3. Read `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md`. Q1–Q6 from that brainstorm are already decided; do not re-debate.
4. Read `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md` (run #1) and `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md` (run #2). Per D1, these are the two evidence files the per-run YAML migration covers.
5. Read `docs/operator-guide.md` Agent Intake Flow + Runtime Validation Request Protocol. The flow has not changed; do not re-derive it.
6. Read the "Anti-Patterns" section below before drafting any tool call.
7. Only then start step 1 of "Recommended Next Steps".

## ID Conventions

- **G1–G11** — Gaps surfaced during this review. Each is a known deficiency in the loop's current state.
- **D1–D9** — Decisions reached during the discussion. Agreements about *intent*. NOT yet reflected in repo state (see "State of the Repo at Report Authorship").
- **O1–O15** — Open items deferred from this review to a follow-up plan. Tagged `[blocking]` or `[non-blocking]` for sequencing. `[resolved]` means the item was closed during post-review continuation.
- **4a/4b/4c**, **7a/7b/7c** — Branchable outcomes for sequenced steps. Consult the relevant section to disambiguate.

## Origin

User flagged: Phase 3 of the resume plan ran exactly as written. Output was `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md` only. No new or updated experiment YAML. User asked: intentional, or gap?

Investigation found: agent followed plan exactly. Plan never instructs touching `records/experiments/`. The predecessor plan (`260508-1545-vnstock-install-knowledge-encoding/`) split this work into two phases (phase-02 evidence, phase-03 experiment YAML + claim verification). The resume plan dropped that split. Phase-3 absorbed the experiment-execution work; phase-4 covered claim/pack non-promotion. The experiment-YAML-creation step exists in neither phase.

Discussion expanded into model-choice debate (per-run vs per-claim YAML), folder-structure concern (mixed granularity), and disposition of the device-limit blocker observation. Each surfaced a fresh gap.

---

## Operator Claim — Device-Limit Mechanism Hypothesis

Added by operator after initial review.

**Claim:** The device-limit gate fired on run #2 because the operator installed the vnstock library on this same machine in the past, prior to the loop's existence. The prior install is occupying one of the two per-OS device slots; run #2 was the second attempt and pushed against the cap, while a fresh install in a clean OS fingerprint would not.

**Why this matters for the report:**

- It re-frames G7. The two facts entangled there were (a) durable property of vnstocks.com (Golden = 2 devices/OS) and (b) transient state of operator's account. The claim now adds (c) a third interpretation: machine-fingerprint history — independent of account-level state. Prior on-disk install lineage on this OS may be the slot-consumer, not anything the operator did inside the loop.
- It re-frames D6 / O2. The decision YAML for vendor-side device clearance was framed as the operator's mitigation between reruns. If this claim is supported, clearance may not be required — running rerun #3 from a clean OS fingerprint (fresh container, fresh VM, different host) would bypass the gate without touching the vendor's web UI.
- It is falsifiable cheaply. Two clean sandboxes (different OS fingerprints, no prior vnstock history on either) running the same install would expose the mechanism: if both pass, the gate is fingerprint-driven and prior history was the cause; if both fail at attempt #2 from the same account, the gate is account-global and clearance is needed regardless of machine.

**Experiment sketch (becomes a real plan; not executed inside this review):**

Sequencing constraints (from operator):

- Run only AFTER the current resume plan is closed out (terminal blocked state committed; no in-flight work). This investigation lives in a new plan, not bolted onto the failing one.
- Run only AFTER operator-confirmed external clearance of the prior on-host device on `vnstocks.com/account?section=devices`. The clearance decision YAML (O2) is a hard prerequisite, not a contingent fallback.
- Sandboxes 1 and 2 run **back-to-back** — no other vnstock activity between them, no temporal spacing — so the only varying factor between the two runs is whether a slot has just been consumed by the prior sandbox.

Design:

- Sandbox 1: fresh container/VM with a clean OS fingerprint never used to install vnstock. Run the env-var-driven installer end-to-end. Capture evidence MD + per-run experiment YAML.
- Sandbox 2: a second fresh container/VM, again clean fingerprint. Run immediately after sandbox 1 finishes. Same install. Same envelope.

Outcomes (post-clearance interpretation):

- Both succeed back-to-back → mechanism is per-fingerprint metered against the cap; with the prior on-host device cleared, two distinct fingerprints can both occupy slots up to the cap. Rerun #3 can run from a clean fingerprint without further clearance.
- Sandbox 1 succeeds, sandbox 2 hits the gate → limit is account+OS-global at 2. Clearance frees exactly one slot per use; each install consumes one. Rerun #3 needs its own clearance cycle. Routine reruns become a recurring operator-action loop.
- Sandbox 1 hits the gate immediately → clearance did not propagate. Either operator removed the wrong device, vendor enforcement is asynchronous/cached, or the gate consults state beyond the operator's account-devices list. Do not run sandbox 2. Investigation pivots.

This experiment is also the first natural N=2 case for the install dimension. It would feed `install-experiment-template-gap.md`'s N=2 trigger and let the next loop iteration draft a real install-experiment template.

**Follow-up obligation:** capture the claim as `records/claims/claim-vnstock-device-limit-mechanism.yaml` (or similar) with `verification: claimed` until the 2-sandbox experiment runs. Do not let the hypothesis live only in this report.

---

## Gaps Surfaced

### G1. Plan does not specify the experiment-YAML output for a rerun

Phase-3 `Related Code Files` lists only the evidence MD. Phase-4 references claim and pack files only. The existing `experiment-vnstock-install-sandbox.yaml` (created during the predecessor plan) is now stale: `updated_at` predates the rerun, `source_refs` excludes the run-2 evidence, `observations` lists run-1 findings, and `result: does-not-support` is correct by accident (run-2 also failed but for a different reason — vendor device-limit, not flag-contract).

### G2. Convention silent on per-run vs per-claim YAML granularity

Schema permits either model. Validators do not enforce either. Operator-guide does not pick one. Two reruns and asymmetric YAML output is process drift, not stable convention.

### G3. Folder mixed-granularity risk

Naive fix (per-claim manifest in `records/experiments/` alongside per-run YAMLs) creates two granularities in one folder. Future agents would not know which is canonical. Resolution adopted: claim YAML is the integrator; `records/experiments/` stays per-run only.

### G4. `attempt_refs` field missing from claim verification block

Claim verification block has `proof_refs` ("things that prove dimension X verified"). No field for "things tried for dimension X regardless of outcome". Failed runs have nowhere clean to surface from the claim. Either extend the claim schema with `attempt_refs`, or accept a semantic stretch and stuff failed runs into `proof_refs` while keeping the dimension status `claimed`.

Resolved-interim (R-Q1): use the claim's existing top-level `evidence_refs` for failed/blocked runs. Per-dimension `proof_refs` stays `[]` while `status: claimed`. The `attempt_refs` schema extension is still the right long-run shape but defers to the next schema-touch event.

### G5. Evidence-MD as fallback vs experiment-YAML as target — transition path undefined

Evidence-MD is the correct degraded-mode log when the agent does not know which structured slot the data belongs in. Logging into MD is preferable to dropping the observation. But evidence-MDs that *should* have been experiment-YAMLs accumulate as silent debt. There is no documented sweep, trigger, or rule converting them. Ad-hoc conversion bypasses the loop's own self-improvement discipline. A meta-process must own this conversion; this resume plan must not.

### G6. External operator action between reruns has no documented record-type pattern

Removing a device on `vnstocks.com/account?section=devices` is an operator-side mutation of the vendor's account state. Decision records can carry it, but `docs/operator-guide.md` has no "External Operator Actions Between Reruns" subsection prescribing the pattern. At N=1, capture as a single decision file is enough. Formalize at N=2.

### G7. Device-limit-as-fact promotion path undefined

The vendor-device-limit observation is two facts conflated: (a) durable property of vnstocks.com (Golden tier = 2 devices/OS), (b) transient state of operator's account (currently at the limit). No rule separates them. Pack publication is gated on `install: verified`, so any premature promotion would be doubly wrong. But there is no future trigger telling a later agent "now is the moment to extract (a) into a vnstock-scoped fact and reference it from the pack".

### G8. Phase 3 success criteria conflate process steps with experimental outcome

Phase-3 success criteria checklist: most boxes marked `[x]` even though the experiment did not pass. Only the `from vnstock_data import Reference` checkbox is `[ ]`. The template does not separate "process steps performed correctly" from "hypothesis confirmed". A blocked phase shows up as 90%-complete, which understates the real status.

### G9. Pack work has no exit path if install never verifies

Phase-4 blocks pack promotion correctly. But the resume plan, the predecessor plan, and the operator-guide all assume install will eventually verify. If the vendor permanently blocks (subscription expires, vendor policy change, sustained device-limit lockout), the pack remains draft forever. No documented "abandon" or "park" status exists for that case.

### G10. Q5 R2 trigger discoverability for the new decision file

If a `decision-<UTC>-vnstock-vendor-device-limit-clearance.yaml` is authored, future cleared-context agents need to find it before rerun #3. Q5 R2 prescribes `## Trigger` sections on meta-evidence files; whether the same convention applies to decision YAMLs is undefined.

### G11. Device-limit mechanism is unobserved; clearance-aware interpretations remain

Run #2's evidence captures the *symptom* (vendor returned the device-limit error message). It does not isolate the *mechanism*. The operator's claim narrowed one interpretation: prior on-host install lineage is the likely slot-consumer that pushed run #2 over the cap. Falsification requires post-clearance verification with two clean back-to-back sandboxes. Two interpretations remain after clearance:

- per-fingerprint metering (clean fingerprints both fit up to the cap), or
- account+OS-global metering at exactly 2 (each install consumes one slot regardless of fingerprint).

Without the post-clearance experiment, the rerun-#3 strategy (one-time clearance vs recurring-clearance-per-run) is chosen on a guess.

---

## Decisions Reached (during discussion)

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Adopt model A (one experiment YAML per run, immutable, timestamped). | Mirrors evidence-MD layer convention. Append-only audit trail. Schema has no merge semantics for in-place updates. 4-of-5 ck:predict personas pick A. |
| D2 | No per-claim manifest YAML. Claim YAML is the integrator. | Avoids mixed-granularity inside `records/experiments/`. Reader-side hop saved by claim-as-entry-point. |
| D3 | `records/experiments/` stays per-run granularity only. | Single granularity per folder. Mirrors `records/evidence/`. |
| D4 | Do NOT promote device-limit observation to meta-evidence at N=1. | Q3 rule: capture-and-defer until N=2. |
| D5 | Do NOT promote device-limit observation to a knowledge-pack fact yet. | Two reasons: transient/durable confound (G7); pack publication gated on `install: verified`. |
| D6 | Record external device-clearance plan as a `decision` record, not as a fact and not as an MD note. | External vendor-account mutation needs decision-layer audit trail with explicit scope, agent-role, and blocked-action fields. |
| D7 | Evidence-MD-as-fallback is correct degraded-mode behavior. | Logging into MD beats dropping the observation. Convention should *discourage* not *forbid*. |
| D8 | Do NOT ad-hoc convert existing evidence-MDs to experiment-YAMLs in this resume plan. | Conversion is a meta-process. Building the meta-process inside this plan would itself be ad-hoc. Defer. |
| D9 | Plan-level lifecycle status (`pending`/`in_progress`/`completed`) follows `ck:project-management` conventions. Experiment-level outcome (`passed`/`failed`/`blocked`) follows learning-loop conventions. The two are orthogonal axes; a plan can be `completed` while its underlying experiment is `blocked`. | `plans/` folder is owned by `ck:project-management`, not by the learning-loop. Plan completion means "work was performed and reviewed". Experiment outcome lives in evidence/experiment records, not in plan frontmatter. Conflating them blocks plan close-out indefinitely whenever a vendor or external gate prevents experimental verification. |

---

## State of the Repo at Report Authorship (2026-05-09)

This report is design output, not execution log. Nothing in the repo has been created, modified, or removed as a result of the discussion that produced this report — except this file. In particular:

- Existing `records/experiments/experiment-vnstock-install-sandbox.yaml` has NOT been renamed or split.
- Per-run experiment YAMLs for runs 101723Z and 171112Z have NOT been authored.
- Operator claim (O13) has NOT been recorded as a `records/claims/` file.
- Device-clearance decision (O2) has NOT been recorded as a `records/decisions/` file.
- The current resume plan's phase files have NOT been patched to require per-run experiment YAML output.
- No external action has been taken on the vendor website.
- No 2-sandbox experiment (O14) has been run.
- No claim's `evidence_refs` has been updated to include run-2 evidence.

Do not assume any decision listed under "Decisions Reached" is reflected in repo state. Decisions are agreements about *intent*; converting them into repo state is the next plan's job.

---

## Open Items (deferred to follow-up plan)

Marked **[blocking]** if rerun #3 cannot proceed without it; **[non-blocking]** otherwise.

| ID | Item | Class |
|----|------|-------|
| O1 | Pick `attempt_refs` schema extension (clean) vs `proof_refs` semantic stretch (zero schema). Resolved (R-Q1): defer schema extension; use top-level `evidence_refs` for run-2 in the interim. | [non-blocking; activate at next schema-touch] |
| O2 | Author the device-clearance decision YAML. Operator-confirmed external clearance is a hard prerequisite for both O14 (the 2-sandbox experiment) and any rerun #3. Not contingent. When authored, also patch `claim-vnstock-install-sandbox.yaml`'s `notes` field with a forward pointer to the decision (R-Q2). | [blocking] |
| O3 | Patch resume-plan phase-3 to require "create per-run experiment YAML alongside evidence MD". | [blocking] for rerun #3 |
| O4 | Author per-run experiment YAMLs for the existing two evidence MDs (run-1 101723Z, run-2 171112Z). Per R-Q4, both YAMLs use `result: inconclusive` with a sibling free-text `result_reason` (run-1: "flag-contract-misframed"; run-2: "blocked-by-vendor-device-limit"). | [blocking] for D1/D2 to take effect |
| O5 | Rename existing `experiment-vnstock-install-sandbox.yaml` to `-20260508T101723Z` form, update `id`, scope `source_refs` to run-1 only. | [blocking] |
| O6 | Update claim's `evidence_refs` to include run-2 evidence MD. | [blocking] |
| O7 | Design meta-process for evidence-MD → experiment-YAML conversion sweeps. Per R-Q3, one workflow with two named modes: "Migration" (original capture had a hypothesis; verbatim copy) and "Structuring" (post-hoc; mark fields as such, pin `status: draft` until operator review). | [non-blocking] |
| O8 | Add "External Operator Actions Between Reruns" docs subsection. | [non-blocking; promote at N=2] |
| O9 | Trigger rule for "extract durable vendor-property facts at install-verified moment". | [non-blocking; activates only after install verifies] |
| O10 | Phase success-criteria template: split "process steps performed" from "hypothesis confirmed". | [non-blocking] |
| O11 | Add "abandoned" or "parked" status pathway for indefinitely-blocked claims/packs. | [non-blocking; activate if rerun #3 also fails] |
| O12 | Decide whether `## Trigger` convention extends to decision YAMLs (for the device-clearance decision specifically). Resolved (R-Q2): no. Decision records are pure YAML; use a one-line forward pointer in the claim's `notes` field instead (see O2). Generalized "claim → active decisions" link convention deferred to meta self-improvement plan. | [resolved] |
| O13 | Capture operator's device-limit-mechanism claim as `records/claims/claim-vnstock-device-limit-mechanism.yaml`. Status `claimed` until O14 runs. | [blocking] for O14 to have a target |
| O14 | Run the 2-sandbox falsification experiment back-to-back, *after* O2 clearance is confirmed and *after* the current resume plan is closed out. Clean fingerprints, no prior vnstock history, no inter-run temporal spacing. Produces two evidence MDs and two per-run experiment YAMLs (per D1). Outcome distinguishes per-fingerprint from account+OS-global metering. Also serves as the natural N=2 case for `install-experiment-template-gap.md`. Per R-Q6, run as a cascade: default = fresh Docker containers (cheapest); escalate sandbox-2 to a fresh VM only if container-level result is ambiguous; escalate to fresh hardware only if VM-level still ambiguous (operator decision). If sandbox-1 hits the gate at container level, abort the cascade — clearance did not propagate. | [blocking] for rerun #3 mechanism choice |
| O15 | Add convention to `docs/operator-guide.md` for `experiment.result`: use `supports` \| `does-not-support` \| `inconclusive`, with a sibling free-text `result_reason` for disambiguation. Per R-Q4, codify the convention before any schema enum constraint. Promote to schema enum only after N≥3 distinct experiments use the convention without strain. | [non-blocking; lands in meta self-improvement plan] |

---

## Anti-Patterns for the Next-Session Agent

Hard NOs derived from the decisions and gaps above. If tempted to do any of these, stop and re-read the cited section.

- Do NOT re-run phase 3 of `plans/260508-2030-vnstock-install-resume/`. That plan is in terminal blocked state. New work goes in a new plan (Recommended Next Step 2).
- Do NOT edit the existing `records/experiments/experiment-vnstock-install-sandbox.yaml` to add run-2 source_refs or observations in place. Per D1 (immutability), the existing YAML is run-1's frozen artifact. Migration is rename + split, not in-place append (O5).
- Do NOT promote the device-limit observation to a `records/evidence/meta/` class file. Per D4, N=1 stays informal until a second case confirms.
- Do NOT promote the device-limit observation to a `knowledge-packs/vnstock-data/` fact. Per D5, pack work is gated on `install: verified`.
- Do NOT convert the existing run-2 evidence MD (`experiment-install-20260508T171112Z.md`) into a structured experiment YAML ad-hoc. Per D7+D8, evidence-MD-as-fallback is correct degraded-mode logging; the conversion sweep is a meta-process not yet designed (O7). Authoring per-run experiment YAMLs from the existing evidence MDs is allowed only inside the new follow-up plan, with the conversion treated as one-time migration documented in that plan's phase notes.
- Do NOT perform the external device-clearance action on `vnstocks.com` from the agent. Per D6, this is operator-only; the decision YAML documents the operator's action, not the agent's.
- Do NOT begin O14 (the 2-sandbox experiment) before all three prerequisites are met: O2 (clearance decision authored), operator-confirmed clearance executed externally, and the resume plan closed out.
- Do NOT bundle O7, O8, O10, O15 into the next investigation plan. They belong in a separate self-improvement plan per Recommended Next Step 10. (O12 was resolved during post-review continuation; see R-Q2.)
- Do NOT broaden the operator's claim (O13) into a generalized vendor-quota meta-claim before O14 produces N=2 evidence. The claim stays vnstock-specific (per the user's explicit direction).
- Do NOT enum-constrain the `experiment.result` field in the upcoming follow-up plan. Per R-Q4, the convention (`supports` \| `does-not-support` \| `inconclusive`, with sibling `result_reason`) lives in operator-guide first; schema enum waits for N≥3.

---

## Recommended Next Steps (sequenced)

1. **Close out the current resume plan.** Per D9, set plan-level frontmatter to `status: completed` (ck:project-management lifecycle: work was performed and reviewed). Per-phase `status: blocked` fields stay as-is — they record experimental outcome, not plan lifecycle. Do not bolt new work onto this plan; commit the terminal state and move on. All open items below belong in a new plan.
2. Author a new follow-up plan. Scope: post-mortem record-layer fixes (O1 [non-blocking; include if cheap, else defer to meta self-improvement plan with O15], O3–O6) plus the device-limit investigation (O2, O13, O14). Keep small.
3. Author O13 (operator claim record) under `records/claims/`. Status `claimed`. The 2-sandbox experiment will verify, refine, or disprove it.
4. Author O2 (device-clearance decision YAML). Documents scope, agent role (none), blocked actions, and expected effect on the experiment that follows.
5. Operator performs external clearance on `vnstocks.com/account?section=devices`. Confirms in-band that the prior on-host device has been removed. Agent does not perform the action and does not observe credentials.
6. Run O14: 2-sandbox falsification, **back-to-back, post-clearance**. Two evidence MDs + two per-run experiment YAMLs.
7. Branch on O14 outcome:
   - 7a. Both sandboxes pass → per-fingerprint metering. Rerun #3 runs from a clean fingerprint without re-clearing. One clearance enables ongoing reruns up to whatever fingerprint capacity the vendor allows.
   - 7b. Sandbox 1 passes, sandbox 2 hits gate → account+OS-global at 2. Each rerun consumes one slot; clearance must repeat per run. Document this as a recurring-action class; consider whether to escalate to a subscription upgrade or sustain the operator-action loop.
   - 7c. Sandbox 1 hits gate immediately → clearance did not propagate. Do not run sandbox 2. Pivot to a vendor-mechanism evidence-gathering subplan before rerun #3 (wrong device removed, vendor cache lag, or hidden state).
8. If rerun #3 succeeds (any path that reaches it): claim install dimension flips to `verified`. *Then* trigger O9 to extract durable vnstock facts (per-OS device-limit property, installer URL class, env-var contract, clearance-required-or-not) into a vnstock-scoped evidence note and queue pack promotion.
9. If rerun #3 still fails for a new reason: capture as a new evidence MD, evaluate O11 (parking pathway), treat as fresh investigation.
10. O7, O8, O10, O15 land in a separate self-improvement plan with their own approval. Not bundled with the investigation plan. (O12 resolved post-review; see R-Q2.)

---

## Notes on Process

This review surfaced ~10 gaps from a single user observation ("the agent produced MD instead of YAML+MD"). That ratio is itself a signal: phase-level instructions in the resume plan under-specify the record-layer outputs because the operator-guide does not constrain them. Future plans should either (a) inherit a record-layer checklist from the operator-guide, or (b) explicitly state the record-layer outputs per phase. The resume plan did neither.

The discussion also confirmed the value of the `## Supersedes` mechanism (run-2 evidence already supersedes `installer-prior-notes.md` correctly) and the `## Trigger` mechanism (meta-evidence files with N≥2 thresholds did fire as predicted). The gap is below those mechanisms — at the level of "which structured record gets written when an experiment runs".

---

## Resolutions (post-review continuation, 2026-05-09)

After the initial review, the operator and assistant resolved the six unresolved questions in a follow-up discussion. Five received concrete answers (R-Q1 through R-Q4, R-Q6); Q5 was resolved as a deliberate deferral (R-Q5) because it depends on a foundational scope decision that has not yet been made.

### R-Q1. attempt_refs schema extension vs proof_refs semantic stretch

Resolved: neither, as originally framed. Use the claim's existing top-level `evidence_refs` field for failed/blocked runs in the interim. Per-dimension `proof_refs` stays `[]` while `status: claimed`. The per-dimension `attempt_refs` schema extension is still the right long-run shape but defers to the next schema-touch event.

Why: `claim.schema.json` already permits arbitrary refs at top-level `evidence_refs`. That field's semantic accommodates failed runs without abusing `proof_refs`'s "things that prove" meaning. Drops O1 from blocking to non-blocking; resolves G4 cleanly without schema thrash.

### R-Q2. ## Trigger section on the device-clearance decision YAML

Resolved: no. The `## Trigger` convention is for `records/evidence/meta/*.md` markdown files; decision records are pure YAML with no narrative sections. The discoverability concern is real but solved differently: when authoring the decision YAML, also patch `claim-vnstock-install-sandbox.yaml`'s `notes` field with a one-line forward pointer (`"Active operator decision: record:decision-<UTC>-vnstock-vendor-device-limit-clearance"`).

Why: Q4 E rule starts the future agent at the claim. The forward-traversal claim→decision gap is real, but extending the `## Trigger` markdown convention into YAML-land is the wrong fix. Existing `notes` field, used once per active decision, fires immediately for this case. A generalized "claim → active decisions" link convention belongs in the meta self-improvement plan, not bolted on now.

### R-Q3. Evidence-MD → experiment-YAML conversion: one process or two?

Resolved: one workflow with two named modes — "Migration" (original capture had a hypothesis; conversion is verbatim) and "Structuring" (original capture lacked hypothesis; post-hoc structure required). Mode is a single up-front check on the original evidence MD; both modes share the output schema and the audit linkage (`source_refs` → original MD); modes differ in whether `hypothesis` and `success_metrics` are reconstructed verbatim or marked post-hoc and pinned at `status: draft` until operator review.

Why: the two cases share file-touching machinery and audit shape. KISS prefers one workflow; honesty prefers a visible mode flag in the resulting YAML. Two separate workflows duplicate machinery without buying clarity.

### R-Q4. `result: blocked` enum value distinct from `does-not-support`?

Resolved: don't add a schema enum yet. `experiment.schema.json` line 20 leaves `result` as unconstrained `string`; the literal question presumes an enum that doesn't exist. Adopt a *convention* in operator-guide: `supports` | `does-not-support` | `inconclusive`, with a sibling free-text field `result_reason` for disambiguation. Promote to a schema enum only after N≥3 distinct experiments use the convention without strain.

Why: `inconclusive` covers the necessary semantic gap (blocked-by-gate, indeterminate-on-merits, ran-out-of-disk, operator-interrupted) without proliferating special-purpose values. Convention before schema avoids early ossification. Both run-1 and run-2 retroactively earn `result: inconclusive` with distinct `result_reason` values.

### R-Q5. Knowledge-pack publication preconditions and grade split

Resolved: defer. No pack-grade split (`capability-claims` vs `facts-only`) is introduced; no precondition rule (install-verified or otherwise) is codified; G9 stays as an open gap; O11 stays as-is.

Why: the question depends on a foundational scope decision that has not yet been made — whether "facts" and "capabilities" are concepts that belong to the learning-loop layer or to a separate product/scope layer (yet to be defined). With that scope decision not concrete, any pack-grade convention introduced now would be speculative structure that ossifies and needs unwinding later. The operator's instinct: avoid putting logic there until the underlying model is concrete.

Re-open trigger: the first time a concrete pack publication candidate forces a publish-or-not decision, AND the learning-loop-vs-product scope decision for "facts" / "capabilities" is on the table. Until both conditions are met, leave the pack layer untouched in this dimension.

Side-effects (deliberate non-actions): G9 ("Pack work has no exit path if install never verifies") stays as an open gap. O11 ("abandoned/parked status pathway") stays in its original `[non-blocking; activate if rerun #3 also fails]` class. Operator-guide gains no pack-grade convention.

### R-Q6. "Clean OS fingerprint" definition for the 2-sandbox experiment

Resolved: cascade, cheapest first. Default to fresh Docker containers (different host, different image hash, no prior vnstock layer). Define explicit escalation rules: if container-level results are ambiguous, re-run sandbox-2 in a fresh VM. If VM-level still ambiguous, escalate to fresh hardware (operator decision; effectively a question of whether the cascade is worth a second physical machine). If sandbox-1 hits the gate at container level, abort the cascade — clearance did not propagate.

Why: vendor mechanism is undocumented; brute-forcing every fingerprint level burns time and hardware. Container-level isolation defeats cookie/session/most-process-state vectors; if vendor enforces below that level, the cascade exposes it without burning hardware up front. Escalation rules belong in the O14 plan, not in this report.

---

## Unresolved Questions

(None after post-review continuation 2026-05-09. The original Q5 was resolved by deferral; see R-Q5 above for the re-open trigger.)
