---
phase: 4
title: "Phase Success Criteria Template"
status: completed
priority: P2
effort: "1h"
dependencies: ["phase-01"]
---

# Phase 4: Phase Success Criteria Template

## Overview

Document the dual-axis phase success-criteria template (process steps vs experiment outcome) so future plans do not produce the misleading "mostly checked off" failure mode where process boxes appear complete despite a blocked or inconclusive experimental result. This phase implements M5 from the next-steps report.

## Context Links

- `plans/reports/next-steps-20260509-vnstock-product-and-meta.md` (Meta Plan Scoping > Phases > M5).
- `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md` (G8, O10, D9).
- The vnstock resume plan that motivated this rule:
  - `plans/260508-2030-vnstock-install-resume/phase-03-experiment-rerun.md` (showed 90% checked when experiment was blocked at vendor gate).
- Depends on Phase 1's `experiment.result` convention.

## Requirements

- Functional: `docs/operator-guide.md` has a new section documenting the dual-axis pattern, the convention's three values (`supports`, `does-not-support`, `inconclusive`), the optional blocker/result-reason line, and the rule that plan-level lifecycle status is orthogonal to experiment outcome.
- Non-functional: No edits to global rules at `~/.claude/rules/`. No new template file is created at `docs/phase-template.md` unless the operator prefers that placement (defer this choice to in-phase planning if it surfaces). No edits to records, schemas, or validators.

## Architecture

The new section lives in `docs/operator-guide.md` as a project-local convention. Placement: after Phase 2's "Evidence-MD to Experiment-YAML Conversion" section. The section references Phase 1's "Experiment Result Convention" by name for the three result values.

The section explicitly invokes D9 from the review report: plan-level lifecycle status (`pending` / `in-progress` / `completed`) is orthogonal to experiment outcome. A phase can be process-complete with a blocked experiment.

## Related Code Files

- Modify: `docs/operator-guide.md`

## Implementation Steps

1. Confirm Phase 1 has landed (operator-guide has the "Experiment Result Convention" section). Phase 4 depends on it.
2. Add a new H2 section to `docs/operator-guide.md` titled `## Phase Success Criteria`, placed immediately after `## Evidence-MD to Experiment-YAML Conversion` (or at the equivalent insertion point), with body:
   ```
   A plan phase has two orthogonal axes that must be tracked separately to avoid the "mostly checked off" failure mode where process boxes appear complete despite a blocked or inconclusive experimental result.

   ### Process Steps

   A list of agent actions required to perform the phase: read inputs, author records, run validation, etc. Each step is a checkbox. `[x]` means the step was performed and reviewed. Process completion is independent of experimental outcome.

   ### Experiment Outcome

   The phase's experimental result, using the convention from "Experiment Result Convention":

   - `supports`
   - `does-not-support`
   - `inconclusive`

   Plus a `Blocker / result reason` line if the outcome is `does-not-support` or `inconclusive`.

   ### Reporting

   A phase summary must state both axes explicitly. Examples:

   - "Process: 9/9 steps complete. Experiment: `inconclusive` (vendor device-limit gate)."
   - "Process: 6/6 steps complete. Experiment: `supports` (sandbox-1 reached `from vnstock_data import Reference`)."

   ### Lifecycle Status Orthogonality

   Plan-level lifecycle status (`pending`, `in-progress`, `completed`) follows project-management conventions and tracks process. Experiment outcome lives in evidence/experiment records. The two are orthogonal: a plan can be `completed` while its underlying experiment is `blocked` or `inconclusive`. Do not block plan close-out on an external gate that prevents experimental verification.
   ```
3. Verify the new section flows with surrounding text. Cross-references to Phase 1's section title must be exact.
4. Operator sanity-read; no validator gate fires.
5. Stop. Report process and outcome.

## Todo List

- [x] Confirm Phase 1 has landed.
- [x] Add "Phase Success Criteria" section with Process Steps, Experiment Outcome, Reporting, Lifecycle Status Orthogonality subsections.
- [x] Verify cross-references to "Experiment Result Convention" (Phase 1).
- [x] Operator sanity-read.
- [x] Report process completion.

## Success Criteria

- [x] `docs/operator-guide.md` contains the "Phase Success Criteria" section with all four subsections.
- [x] The section references "Experiment Result Convention" by exact title.
- [x] The section invokes the orthogonality rule (D9) for plan lifecycle vs experiment outcome.
- [x] No edits to global rules.
- [x] No new template file unless operator explicitly prefers it (defer in-phase if surfaced).

## Risk Assessment

- **Risk:** Section drift if Phase 1's section title changes after Phase 4 lands.
  - **Mitigation:** Use exact title `## Experiment Result Convention` from Phase 1; if Phase 1 deviates, Phase 4 must update its cross-reference.
- **Risk:** Operator prefers a separate `docs/phase-template.md` rather than a subsection.
  - **Mitigation:** This phase begins by confirming the placement choice. If operator requests a separate file, the phase splits into (a) author `docs/phase-template.md` and (b) cross-reference from operator-guide.
- **Risk:** Future plan generators (templates, scaffolding) ignore the dual-axis pattern.
  - **Mitigation:** The pattern lives in operator-guide where agents read on intake. Tooling enforcement is deferred until the convention has at least three plans using it.

## Security Considerations

- Docs edit only; no code, runtime, secrets, or external calls.

## Next Steps

- This phase has no downstream phases inside this plan.
- Future trigger: at least three plans use the dual-axis pattern -> evaluate adding a generator helper or template file.
