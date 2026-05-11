---
phase: 1
title: "Gap 1 Artifacts"
status: pending
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Gap 1 Artifacts

## Context Links

- Brainstorm: `plans/reports/brainstorm-260512-0046-install-template-and-capability-schema-gap-revisit.md`
- Gap MD: `records/evidence/meta/install-experiment-template-gap.md`
- Evidence corpus (the 4 cases):
  - `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md`
  - `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md`
  - `records/evidence/vnstock-data/experiment-install-20260509T071800Z-sandbox-1.md`
  - `records/evidence/vnstock-data/experiment-install-20260509T071900Z-sandbox-2.md`
- Loop policy: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` "Gap Classification by Sample Count" + "Meta Governance Rule"

## Overview

Gap 1's trigger event (`N=2 install experiments`) is exceeded by the 4 vnstock install evidence MDs. Action when triggered = "compare envelope shapes. If repeated fields appear, draft template candidate." Phase produces:

1. Install experiment template candidate MD (under `records/evidence/meta/`)
2. Meta-experiment YAML to validate the candidate against the 4 existing cases
3. Update to Gap 1 MD with `## Resolution` section linking the artifacts

## Key Insights From Brainstorm

Convergence table (3-of-4 cases share these sections; legacy T101723Z is outlier and predates the convention):

| Section | Convergence |
|---|---|
| YAML frontmatter (record_type, capability, dimension, scope, validation_status, claim_support, secret_injection_class, installer_url_class, static_dimension_consistency, created, substrate) | 3/4 |
| `## Summary` | 4/4 |
| `## Substrate` | 4/4 (full detail in 3/4) |
| `## Steps Executed` (numbered) | 3/4 |
| `## Observations` (bulleted) | 3/4 |
| `## Sanitized Installer Output` (fenced code block) | 3/4 |
| `## Disproof / Confirmation Notes` | 4/4 |
| `## Source` | 3/4 |

Optional/case-specific sections to mark explicitly so authors include only when justified:
- `## Static Dimension Consistency` (when reference snapshot exists + runtime inspectable)
- `## Process-Side Findings` (when installer touches host state outside declared boundary)
- `## Supersedes` (when experiment empirically replaces prior note)
- `## Allowed Outputs Captured` + `## Blocked Outputs` (legacy section; current convention absorbs this into the paired experiment-YAML approval block)

## Requirements

### Functional
- Template candidate captures the canonical 7-section envelope.
- Template marks optional sections explicitly with inclusion guidance.
- Meta-experiment YAML records goal/hypothesis/success-metrics for validating the candidate against the 4 cases.
- Gap 1 MD gains a `## Resolution` section linking the candidate + meta-experiment; `## Trigger` reframed to "review after next non-vnstock install experiment lands".

### Non-Functional
- Template stays domain-neutral (no `vnstock` strings outside example snippets).
- Template stays free of credentials, raw logs, raw data per meta-evidence governance.
- Meta-experiment ID follows existing pattern: `experiment-meta-install-template-candidate-260512T0046Z`.

## Architecture

### Artifact locations

```
records/evidence/meta/
  install-experiment-template-gap.md                                   # UPDATE (add ## Resolution, reframe ## Trigger)
  install-experiment-template-candidate.md                             # CREATE (the template body)

records/experiments/
  experiment-meta-install-template-candidate-260512T0046Z.yaml         # CREATE (meta-experiment)
```

### Linking

- Candidate MD's first paragraph cites brainstorm + Gap 1 MD.
- Meta-experiment YAML's `source_refs` lists: candidate MD + 4 evidence MDs + Gap 1 MD + brainstorm report.
- Gap 1 MD's `## Resolution` section links candidate MD + meta-experiment YAML.

## Related Code Files

- Create: `records/evidence/meta/install-experiment-template-candidate.md`
- Create: `records/experiments/experiment-meta-install-template-candidate-260512T0046Z.yaml`
- Modify: `records/evidence/meta/install-experiment-template-gap.md`

## Implementation Steps

1. Re-read all 4 install evidence MDs to confirm convergence table (paranoia check; brainstorm already did this but a second pass catches drift).
2. Author `records/evidence/meta/install-experiment-template-candidate.md` with:
   - Header explaining: this is a candidate, pinned at draft until meta-experiment validates it.
   - Canonical YAML frontmatter block (placeholder values).
   - 7 required body sections with one-line inclusion guidance each.
   - Optional sections clearly labeled `### (Optional)` with trigger criteria for inclusion.
   - Closing note: file is meta-evidence, not domain evidence; no secrets/raw logs/raw data.
3. Author `records/experiments/experiment-meta-install-template-candidate-260512T0046Z.yaml` per `schemas/experiment.schema.json`:
   - `id`, `schema_version: "1.0"`, `type: experiment`, `status: draft`
   - `scope: meta`
   - `goal`: "Validate install experiment template candidate against the 4 existing vnstock install evidence MDs."
   - `hypothesis`: "The 7-section envelope captures all required structure across the 4 cases without forcing case-specific add-ons into the required set."
   - `method`: compare-template-to-existing-cases, identify-non-fits, mark-optional-vs-required
   - `success_metrics`: all-4-cases-fit-template-or-marked-as-pre-convention-legacy, no-required-section-is-empty-in-passing-cases, optional-section-list-stable
   - `source_refs`: candidate MD + Gap 1 MD + 4 evidence MDs + brainstorm
   - `claim_refs`: [] (no claim yet; promotion path is via decision later)
   - `output_capture.allowed_outputs`: template-fit-table, deviation-notes
   - `output_capture.blocked_outputs`: raw-installer-logs, credentials, raw-vendor-data
4. Update `records/evidence/meta/install-experiment-template-gap.md`:
   - Add `## Resolution` section pointing to candidate MD + meta-experiment YAML; state the trigger is now considered consumed.
   - Reframe `## Trigger` block: new event class = "next-non-vnstock-install-experiment"; threshold N=1 (one different domain); action = "compare envelope shape against template candidate; if fit, promote candidate via decision; if mismatch, revise candidate and re-experiment".
   - Preserve the original observation / evidence / proposed improvement / deferral note text (no rewrite of history).
5. Do not promote the candidate to canonical or copy it into `docs/` in this phase — that is the post-meta-decision step.

## Todo List

- [ ] Re-read 4 install evidence MDs (confirm convergence)
- [ ] Write `records/evidence/meta/install-experiment-template-candidate.md`
- [ ] Write `records/experiments/experiment-meta-install-template-candidate-260512T0046Z.yaml`
- [ ] Update `records/evidence/meta/install-experiment-template-gap.md` (add `## Resolution`, reframe `## Trigger`)

## Success Criteria

- [ ] Candidate MD exists and contains the canonical 7-section envelope plus the 4 optional sections with inclusion guidance
- [ ] Meta-experiment YAML exists, `status: draft`, `scope: meta`, links the candidate + 4 evidence MDs + Gap 1 MD + brainstorm in `source_refs`
- [ ] Gap 1 MD `## Resolution` section exists and links the new artifacts
- [ ] Gap 1 MD `## Trigger` reframed to next-non-vnstock-install-experiment / N=1
- [ ] No vnstock domain content leaks into the candidate template body (placeholders only)
- [ ] All files pass `pnpm validate:records` (deferred to Phase 3)

## Risk Assessment

- **Risk:** Candidate freezes the envelope before a non-vnstock install case lands.
  **Mitigation:** Candidate is explicitly draft; meta-experiment's success-metric set requires the next non-vnstock case to pass before promotion via decision.
- **Risk:** Operator may want the template to live under `docs/templates/` instead of `records/evidence/meta/`.
  **Mitigation:** Use `records/evidence/meta/` for the draft per meta-governance rule ("Preferred durable evidence path: records/evidence/meta/<descriptive-kebab-slug>.md"); move to `docs/templates/` only when promoted via decision.
- **Risk:** Meta-experiment YAML may fail schema validation if `scope: meta` is not in the enum.
  **Mitigation:** Check `schemas/experiment.schema.json` before writing; if `scope` enum is strict, use the closest existing value and document the deviation in `notes`.

## Security Considerations

- No credentials, raw external data, raw installer logs, raw vendor data, or private artifacts in the candidate or meta-experiment.
- Candidate template explicitly forbids those classes in its inclusion guidance.

## Next Steps

- Phase 2 updates Gap 2 MD (independent track).
- Phase 3 runs validation gates and optionally drafts a meta-decision pinning the revisit trigger.
