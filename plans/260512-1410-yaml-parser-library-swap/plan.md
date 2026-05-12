---
title: "YAML Parser Library Swap (eemeli/yaml)"
description: "Replace hand-rolled tools/validate-records/simple-yaml-parser.js with eemeli/yaml. Project stops owning YAML grammar; ledger/schema/claim rules remain hand-rolled. AJV explicitly deferred to a later decision."
status: completed
priority: P2
branch: "main"
tags: [tooling, posture-shift, validator]
blockedBy: []
blocks: []
created: "2026-05-12T07:13:52.412Z"
createdBy: "ck:plan"
source: skill
---

# YAML Parser Library Swap (eemeli/yaml)

## Overview

Single posture shift: project no longer owns a YAML 1.2 parser. Decision `records/decisions/decision-20260510T172056Z-yaml-parser-library-swap.yaml` (status: approved) authorizes the swap. Brainstorm `plans/reports/brainstorm-260512-1357-parser-swap-ajv-deferral.md` approved Approach B (sequence: YAML now, AJV deferred until datetime UTC-Z trigger acted on).

Scope is hard-bound by the decision's `decision_effect.allowed_actions` / `blocked_actions`. AJV / `validateSchema` rewrite, any other npm deps, and any retrofit of historical records are out of scope.

## Context Links

- Decision draft: `records/decisions/decision-20260510T172056Z-yaml-parser-library-swap.yaml`
- Brainstorm: `plans/reports/brainstorm-260512-1357-parser-swap-ajv-deferral.md`
- Validator-quirk journal: `docs/journals/260512-meta-evidence-gap-revisit.md`
- Hand-rolled parser (to delete): `tools/validate-records/simple-yaml-parser.js`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Baseline](./phase-01-baseline.md) | Completed |
| 2 | [Dependency](./phase-02-dependency.md) | Completed |
| 3 | [Migration](./phase-03-migration.md) | Completed |
| 4 | [Regression](./phase-04-regression.md) | Completed |
| 5 | [Cleanup](./phase-05-cleanup.md) | Completed |
| 6 | [Decision-Promotion](./phase-06-decision-promotion.md) | Completed |

## Dependencies

None. No active plans overlap. `260512-1321-artifact-timestamp-convention` is complete (commit `e2a82d6`); the parser-swap will benefit from its UTC-Z normalization but doesn't depend on it.

## Out of Scope (Reaffirmed)

- Replacing hand-rolled `validateSchema` in `record-validation-rules.js` (deferred to separate AJV decision).
- Adding any npm dep beyond `yaml`.
- Editing frozen historical records to use new YAML features (block scalars, anchors).
- Extending `scope` enum, source-ref allowlist, or any schema field.
- Documenting the four validator quirks from the journal in a tools README (nice-to-have, not urgent).

## Success Criteria (Plan-Level)

- `pnpm validate:records` exit 0 against all 34 records pre- and post-swap with **byte-identical** captured output (regression baseline).
- `pnpm check` exit 0.
- `tools/validate-records/simple-yaml-parser.js` deleted; zero remaining imports.
- One smoke-test record proves pipe-block-scalar support post-swap.
- Decision draft `decision-20260510T172056Z` promoted draft → approved; `source_refs` includes brainstorm and evidence MD.
