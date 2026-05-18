# 260518 — Learning Loop Scout Test: Meta-Process Reflection

## Context

After completing Phase-04 capability revalidation, the user proposed a litmus test: scout all verified claims and try to answer every unresolved question in `docs/vendor-vnstock-installer.md` without asking the user. The goal was to measure whether the learning loop's record system actually works for a cleared-context agent.

## Test Design

The doc has 7 unresolved questions (Q1–Q7). The user wanted to know: can a fresh agent, given only the records directory and the doc, answer them all?

## Results

| Question | Answerable from records? | Source | Gap |
|----------|-------------------------|--------|-----|
| Q1 (config path siblings) | Yes (strikethrough in doc + claim-vnstock-home-config-path) | Static source-read | None |
| Q2 (version drift) | Partially (claim-vnstock-version-requirements) | Install experiments | Root cause never captured |
| Q3 (403 → Device-Id) | Yes but stale | claim-vnstock-runtime-403-root-cause | Doc doesn't reflect SUPERSEDED status |
| Q4 (SHA determinism) | Yes, but buried | 6 evidence files across 4 experiments | Not surfaced in any claim or the doc |
| Q5 (phone-home) | No | Nothing captured | User inferred from indirect evidence |
| Q6 (slot accounting) | Partially | Two claims (mechanism + ui-inconsistency) | "Race or bug" still open |
| Q7 (runtime dirs self-materialise) | Yes, but not explicit | Two experiments (rewrite-validation + revalidation) | Not stated as resolved in the doc |

**Score: 4/7 answerable, 1 partially, 2 gaps.**

## What Worked

**1. Records are findable.** A `find` on `records/claims/*vnstock*` returns 6 files. A `find` on `records/experiments/*vnstock*` returns 15. The naming convention (`claim-vnstock-*`, `experiment-vnstock-*`) makes grep/scout viable without knowing file contents.

**2. Cross-references are real.** Claims point to experiments via `proof_refs`, experiments point to evidence via `source_refs`, decisions point to claims via `affected_refs`. A scout agent can walk the graph: doc question → claim → experiment → evidence file.

**3. The YAML schema is consistent.** Every claim has `status`, `verification.{static,install,runtime,product}`, `evidence_refs`, and `limitations`. A parser or agent knows where to look.

**4. Supersession is recorded.** The `claim-vnstock-runtime-403-root-cause` notes field says "SUPERSEDED by experiment-vnstock-vendor-compat-removal-20260518T014500Z". An agent that reads the claim can detect it's stale.

## What Didn't Work

**1. The doc is stale.** `vendor-vnstock-installer.md` still presents C' (Device-Id) as the active runtime blocker. The records say SUPERSEDED. The doc and records are two separate truth sources that diverged. No mechanism forces the doc to update when a claim's status changes.

**2. Q4 had the answer but nobody wrote it down as a finding.** Six evidence files document the SHA change from `1982f7f9...` to `fad4bb7b...`. But no claim says "the .run file is not deterministic." The data exists; the conclusion was never formalized. An agent has to read multiple files and synthesize — the loop didn't do that work.

**3. Q5 was never captured at all.** The user knew `import vnstock_data` phones home (because it restores soft-deleted devices). This was observed during experiments but never written as a claim or observation. The evidence was there (the device reappearing in the portal after import), but the inference was left in the user's head.

**4. Supersession doesn't propagate to the doc.** When `claim-vnstock-runtime-403-root-cause` was marked SUPERSEDED, nothing updated `vendor-vnstock-installer.md`. The decision record (`decision-20260518T092116Z`) affected the claim and the code, but not the reference doc.

**5. Answers require multi-file synthesis.** Q7's answer lives across two experiment YAML files and is never stated as a single resolved fact. An agent has to read both experiments, notice both succeeded, and infer "yes, runtime dirs self-materialise." The loop archived the data but didn't close the loop.

## Root Causes

**The loop archives actions, not conclusions.** Experiments record what was done and observed. Claims record what was asserted. But the step from "experiment succeeded" to "therefore question X is resolved" is left to the agent. The loop has no mechanism to auto-resolve doc questions when evidence arrives.

**Doc ↔ record sync is manual.** The doc is a reference document. The records are the source of truth. But nothing links them. When a record supersedes a claim, the doc doesn't know.

**Low-confidence observations stay in the user's head.** Q5 (phone-home) was inferred from indirect evidence (device reappearing after import). The user knew it but didn't write it as a claim because it wasn't "verified." The loop's verification gate is too strict for soft observations.

## Recommendations

1. **Add a `resolved_by` field to doc questions.** When a claim or experiment resolves a question, link it. A scout agent can then follow the pointer instead of synthesizing.

2. **Write soft observations as `observation` records.** Q5 (phone-home) could be an `observation-vnstock-import-phone-home` with `confidence: medium` and `evidence_refs` pointing to the device-reactivation experiment. Doesn't need to be a verified claim.

3. **Auto-flag stale docs.** When a claim's status changes to `superseded`, any doc referencing it should be flagged for review. A CI check or hook could do this.

4. **Formalize SHA drift as a claim.** The data exists across 6 files. A `claim-vnstock-installer-sha-nondeterministic` with `confidence: high` would save future agents from re-discovering this.

5. **Close Q7 explicitly.** Add a strikethrough entry in the doc: "~~After env-var fix, do id/, data/, config/ still self-materialise?~~ **Resolved**: yes, confirmed by experiment-vnstock-installer-rewrite-validation and experiment-vnstock-capability-revalidation."

## Meta-Observation

The learning loop is good at archiving **what happened** and mediocre at archiving **what it means**. The gap between "experiment record exists" and "doc question is resolved" is where agent context goes to die. A cleared-context agent can find the data but has to re-derive the conclusion every time.

The user's test exposed this precisely: the agent found 4/7 answers, the user filled in 2 more from memory, and the agent then found confirming evidence for 1 of those. The loop captured the evidence for all 7 but only formalized conclusions for 4.

## Unresolved Questions

1. Should the loop have a "conclusion record" type that bridges experiments → doc questions?
2. Is the verification gate too strict, causing soft observations to never get recorded?
