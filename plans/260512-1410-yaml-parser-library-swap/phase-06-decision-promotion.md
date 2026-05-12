---
phase: 6
title: "Decision Promotion"
status: completed
priority: P1
effort: "45m"
dependencies: [5]
---

# Phase 6: Decision Promotion

## Overview

Author the follow-on evidence MD that pairs the YAML-parser friction history with the inventory in the brainstorm report, add both to the decision's `source_refs`, and promote `decision-20260510T172056Z-yaml-parser-library-swap` from `draft` → `approved`. This closes the brainstorm-skill chain (Step 8 of brainstorm: source_refs updated, status moved) and leaves the AJV trigger criterion explicitly named for the next session.

## Requirements

- Functional: new evidence MD at `records/evidence/meta/` (the meta subdir per Gap-1 convention from the journal) summarizing: (a) the two YAML-parser friction events (vnstock-installer pipe scalar, artifact-timestamp colon-in-sequence-scalar), (b) the JSON Schema feature inventory from the brainstorm, (c) the AJV deferral with trigger criteria.
- Functional: decision YAML's `source_refs` gains two new entries (brainstorm report, evidence MD); `status` flips `draft` → `approved`; `updated_at` bumped to commit time in UTC-Z.
- Functional: `pnpm validate:records` exit 0 after the edits (confirms ref-allowlist accepts the new evidence path).
- Non-functional: evidence MD respects the 7-section + 11-key frontmatter envelope from `install-experiment-template-candidate.md` only if it actually fits; otherwise pick the simplest serviceable shape and note the deviation in `notes`.

## Architecture

### Evidence MD shape

Pragmatic: not an install-experiment, so the candidate template doesn't apply directly. Use a minimal evidence-MD shape (frontmatter with `id`, `title`, `date`, `scope`, `summary`, `source_refs`) plus 3 sections: Friction History, Feature Inventory, AJV Deferral & Trigger.

File path: `records/evidence/meta/yaml-parser-friction-and-schema-inventory-260512.md`. Kebab-case, date suffix, lives under `records/evidence/meta/` so the ref-allowlist accepts `record:evidence/meta/yaml-parser-friction-and-schema-inventory-260512` references (per the journal's allowlist analysis, `records/evidence` is the default allowlist root).

Content body restates the brainstorm's two key findings tersely: friction ledger (YAML parser bit twice, validator bit zero) and the feature-coverage table. Avoid duplicating the full brainstorm; link to it via `source_refs`.

### Decision YAML edits

In `records/decisions/decision-20260510T172056Z-yaml-parser-library-swap.yaml`:
- `status: draft` → `status: approved`
- `updated_at: "2026-05-12T..."` → bump to current UTC-Z timestamp
- `source_refs:` add two entries:
  - the brainstorm report (as a local ref via `notes`, since `plans/` is not in the allowlist — see journal Quirk #3) **OR** if the allowlist tolerates it (test in step 4 below), add directly; otherwise route through `notes`.
  - the evidence MD as `record:evidence/meta/yaml-parser-friction-and-schema-inventory-260512`.

The brainstorm-path constraint is the key gotcha. Resolution per journal Quirk #3: cite the brainstorm path in the YAML `notes:` field (free-form, no validation), and put only the evidence-MD record ref in `source_refs`. This stays within the allowlist without expanding it.

### Decision count update

Decision draft's text mentions "existing 18 records" in `decision_effect.required_gates`. Live count is 34. Update the gate text to reflect the live count (or generalize to "all existing records" — pick whichever the team prefers; defaulting to "all 34 records" for specificity).

## Related Code Files

- Create: `records/evidence/meta/yaml-parser-friction-and-schema-inventory-260512.md`
- Modify: `records/decisions/decision-20260510T172056Z-yaml-parser-library-swap.yaml`

## Implementation Steps

1. Draft the evidence MD per the architecture above. Keep under ~80 lines.
2. Run `pnpm validate:records`. Expect exit 0 (the MD shouldn't be parsed as a record; it lives under `records/evidence/meta/` as a free-form supporting doc and is referenced *by* records, not validated *as* a record).
3. Edit the decision YAML:
   - Flip `status` to `approved`.
   - Update `updated_at` to current UTC-Z (e.g., `"2026-05-12T07:30:00Z"` — use real commit time).
   - Add the evidence-MD ref to `source_refs`: `- record:evidence/meta/yaml-parser-friction-and-schema-inventory-260512`.
   - Append to `notes`: a sentence pointing at the brainstorm path (free-form, since `plans/reports/` is not in the ref allowlist).
   - Update `required_gates` count from 18 to 34 (or "all existing", as preferred).
4. Run `pnpm validate:records`. Expect exit 0. If allowlist rejects the evidence-MD ref, double-check the path is exactly under `records/evidence/...` (the default allowlist root).
5. Run `pnpm check`. Expect exit 0.
6. Review `git status` — ready for a single focused commit. Suggested commit message:

   ```
   feat(tools): swap hand-rolled YAML parser for eemeli/yaml

   Replaces tools/validate-records/simple-yaml-parser.js with the yaml
   package. Project stops owning YAML 1.2 grammar; ledger, schema, and
   claim rules remain hand-rolled. AJV deferred to a follow-up decision
   per plans/reports/brainstorm-260512-1357-parser-swap-ajv-deferral.md.

   Regression: identical pnpm validate:records output across 34 records
   pre- and post-swap. New capability proven via pipe-block-scalar
   smoke test.

   Promotes decision-20260510T172056Z-yaml-parser-library-swap from
   draft to approved.
   ```

## Success Criteria

- [ ] `records/evidence/meta/yaml-parser-friction-and-schema-inventory-260512.md` exists, content under ~80 lines.
- [ ] Decision YAML `status: approved`, `updated_at` is current UTC-Z, `source_refs` includes the evidence-MD ref, `notes` cites the brainstorm path, `required_gates` reflects live record count.
- [ ] `pnpm validate:records` exit 0.
- [ ] `pnpm check` exit 0.
- [ ] One focused commit on `main`.

## Risk Assessment

- **Risk**: ref-allowlist rejects `record:evidence/meta/...` because `meta/` is a new subdir under `records/evidence/`. **Mitigation**: the journal already established that `records/evidence/meta/install-experiment-template-candidate.md` works as a reference target (Gap 1). Same path scheme.
- **Risk**: brainstorm path is the right thing to cite in `source_refs` but the allowlist won't accept it. **Accepted workaround**: cite in `notes` per journal Quirk #3; do NOT expand the allowlist as part of this commit (out of scope per decision `blocked_actions`).
- **Risk**: bumping `updated_at` UTC-Z accidentally violates the just-landed timestamp convention from commit `e2a82d6`. **Mitigation**: use the exact `YYYY-MM-DDTHH:MM:SSZ` format the commit standardized on.
- **Risk**: a reviewer wants the AJV trigger criteria written into the decision YAML itself (not just the brainstorm). **Deferred**: the AJV decision is the place for that. This decision's `blocked_actions` already says the AJV swap is out of scope for this change.

## Notes

- After this phase, run `/ck:journal` to write the technical journal entry per the brainstorm skill's Step 10.
- The next session's AJV decision should cite Trigger #1 met (user wants datetime UTC-Z enforced; commit `e2a82d6` is motivating drift evidence) and the brainstorm's inventory of which JSON Schema 2020-12 features are actually in use.
