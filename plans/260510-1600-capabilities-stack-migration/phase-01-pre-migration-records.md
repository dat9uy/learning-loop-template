---
phase: 1
title: "Pre-Migration Records"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Pre-Migration Records

## Overview

Author loop records that establish the claim, risk, draft experiment, and draft decision for the capabilities stack migration. No code changes in this phase.

## Requirements

- Functional: Records exist and pass `pnpm validate:records`.
- Non-functional: Records use qualified terminology (capability script / capability record / Capability Runtime Experiment); no bare "capability" or "user" language.

## Related Code Files

- Create: `records/claims/claim-loop-capabilities-stack-allowlist.yaml`
- Create: `records/risks/risk-loop-capability-allowlist-overreach.yaml`
- Create: `records/experiments/experiment-loop-capabilities-stack-allowlist-<ts>.yaml` (status: draft)
- Create: `records/decisions/decision-<ts>-capabilities-stack-migration.yaml` (status: draft)

## Implementation Steps

1. Read `records/evidence/meta/capability-allowlist-deferred-axes.md` for deferred extension axes.
2. Read `records/decisions/decision-20260509T192449Z-prospective-convention-application.yaml` for frozen-record policy.
3. Read `plans/reports/brainstorm-20260510-capabilities-stack-migration.md` for locked decisions and decision draft.
4. Author `claim-loop-capabilities-stack-allowlist.yaml`:
   - Claim: the glob allowlist correctly admits `product/*/capabilities` for capability records and rejects others.
   - Verification dimensions: `static` (schema lints), `runtime` (validator passes against fixtures — stays `claimed` until phase 06).
5. Author `risk-loop-capability-allowlist-overreach.yaml`:
   - Risk: future record types accidentally inherit the widened allowlist.
   - Mitigation: per-type table, default-deny.
6. Author `experiment-loop-capabilities-stack-allowlist-<ts>.yaml` (status: draft):
   - Hypothesis: validator enforces per-record-type allowlist with glob `product/*/capabilities`.
   - Method: run `pnpm validate:records --allow-disallowed-fixtures` against new fixtures (phase 03), then `pnpm validate:records` baseline.
   - `verification.proves`: `static` + `runtime`.
7. Author `decision-<ts>-capabilities-stack-migration.yaml` (status: draft):
   - Use the verbatim decision draft from the brainstorm report.
   - `source_refs` lists only paths that exist at phase 01 author time.
   - `notes` cites the brainstorm path as text, not as `source_refs`.
8. Run `pnpm validate:records` and `pnpm check`.

## Prompt Block (Loop)

```text
Task: Author pre-migration loop records for the capabilities stack migration.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- records/evidence/meta/capability-allowlist-deferred-axes.md
- records/decisions/decision-20260509T192449Z-prospective-convention-application.yaml
- plans/reports/brainstorm-20260510-capabilities-stack-migration.md
- docs/operator-guide.md
- docs/claim-verification.md

Goal:
- Create claim, risk, draft experiment, and draft decision records.
- Use qualified terminology: capability script, capability record, Capability Runtime Experiment.
- No bare "capability" or "user" language.

Allowed sources:
- local:records/evidence/meta/capability-allowlist-deferred-axes.md
- record:decision-20260509T192449Z-prospective-convention-application
- plans/reports/brainstorm-20260510-capabilities-stack-migration.md

Forbidden actions:
- Do not edit frozen historical records.
- Do not create product code.
- Do not modify validators or schemas.

Validation:
- Run pnpm validate:records.
- Run pnpm check.

Report:
- Record paths created.
- Verification status of each.
- Any unresolved questions.
```

## Success Criteria

- Process: 8/8 steps complete.
- Experiment outcome: `inconclusive` (fixtures do not yet exist; experiment stays draft until phase 06).
- `pnpm validate:records` passes.
- `pnpm check` passes.

## Risk Assessment

- Risk: decision draft references future evidence MD that does not yet exist. Mitigation: `source_refs` omits it; `notes` documents the phase-06 addition.
- Risk: claim's `runtime` dimension is prematurely verified. Mitigation: claim stays `claimed` for `runtime` until phase 06.
