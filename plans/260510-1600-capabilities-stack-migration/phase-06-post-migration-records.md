---
phase: 6
title: "Post-Migration Records"
status: pending
priority: P1
effort: "2h"
dependencies: [5]
---

# Phase 6: Post-Migration Records

## Overview

Close the loop: flip experiment to approved, write evidence MD, update claim verification, approve the decision, and run final validation.

## Requirements

- Functional: Experiment approved. Claim runtime dimension verified. Decision approved. Evidence MD exists.
- Non-functional: Evidence captures pre/post migration tree, validator fixture summary, and `pnpm check` output.

## Related Code Files

- Modify: `records/experiments/experiment-loop-capabilities-stack-allowlist-<ts>.yaml` (status: draft → approved)
- Modify: `records/claims/claim-loop-capabilities-stack-allowlist.yaml` (runtime → verified)
- Modify: `records/decisions/decision-<ts>-capabilities-stack-migration.yaml` (status: draft → approved; add evidence MD to source_refs)
- Create: `records/evidence/loop/capabilities-stack-migration.md`

## Implementation Steps

1. Read phase 01 authored records.
2. Read `records/evidence/meta/capability-allowlist-deferred-axes.md`.
3. Update `experiment-loop-capabilities-stack-allowlist-<ts>.yaml`:
   - Fill `method`, `observations`, `result`, `agent_outcome`, `product_outcome`.
   - Set `status: approved`.
   - Add proof refs to fixture results.
4. Update `claim-loop-capabilities-stack-allowlist.yaml`:
   - Set `verification.runtime.status: verified`.
   - Add `proof_refs` pointing to the experiment record.
5. Create `records/evidence/loop/capabilities-stack-migration.md`:
   - Pre-migration tree layout.
   - Post-migration tree layout.
   - Validator fixture pass/fail summary.
   - `pnpm check` output (redacted if needed).
   - Reference to deferred axes meta evidence.
6. Update `decision-<ts>-capabilities-stack-migration.yaml`:
   - Set `status: approved`.
   - Add `local:records/evidence/loop/capabilities-stack-migration.md` to `source_refs`.
7. Run `pnpm validate:records` and `pnpm check`.
8. Run `git diff` to verify zero changes to frozen records:
   - `records/experiments/experiment-vnstock-capabilities-20260509T174957Z.yaml`
   - `records/evidence/vnstock-data/capability-runtime-output.md`
   - `docs/journals/260510-vnstock-capability-runtime.md`

## Prompt Block (Loop)

```text
Task: Close the loop for the capabilities stack migration.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- records/claims/claim-loop-capabilities-stack-allowlist.yaml
- records/experiments/experiment-loop-capabilities-stack-allowlist-<ts>.yaml
- records/decisions/decision-<ts>-capabilities-stack-migration.yaml
- records/evidence/meta/capability-allowlist-deferred-axes.md
- docs/operator-guide.md (Phase Success Criteria)

Goal:
- Flip experiment to approved with observations and result.
- Flip claim runtime dimension to verified.
- Write evidence MD.
- Approve decision and add evidence MD to source_refs.

Constraints:
- Do not edit frozen historical records.
- Evidence must be meta (loop architecture), not domain evidence.
- Use qualified terminology throughout.

Validation:
- Run pnpm validate:records.
- Run pnpm check.
- Run git diff on frozen record paths (must be empty).

Report:
- Record status changes.
- Evidence MD path.
- Frozen-record diff result.
- Any unresolved questions.
```

## Success Criteria

- Process: 8/8 steps complete.
- Experiment outcome: `supports` (migration successful, validator enforces new rules).
- `pnpm validate:records` passes.
- `pnpm check` passes.
- `claim-loop-capabilities-stack-allowlist.verification.runtime.status` is `verified` with proof refs.
- `decision-<ts>-capabilities-stack-migration.status` is `approved`.
- `records/evidence/loop/capabilities-stack-migration.md` exists.
- `git diff` on frozen records shows zero changes.

## Risk Assessment

- Risk: evidence MD is too large or captures raw data. Mitigation: meta evidence only; tree layouts and validator summaries, no raw capability output.
- Risk: decision approval references non-existent evidence MD. Mitigation: create evidence MD before updating decision; add to source_refs in same step.

## Approval Gate

None. This phase is record promotion only; all risky work (filesystem, validator) is behind us. Operator may review the evidence MD before final commit if desired.
