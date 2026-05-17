# Brainstorm: Post-Validation Gap Closure

## Problem Statement

After completing the vnstock installer rewrite validation plan (`plans/260517-1200-vnstock-installer-rewrite-validation/`), several gaps remain before capabilities can be re-validated in the product environment.

## Scout Findings

- Validation plan executed (commit `7c238d1`, experiment record `20260517T053000Z`)
- All 5 capability scripts verified previously (experiment `20260509T174957Z`, result: supports)
- Root-owned Docker artifacts in `product/api/` (.vnstock, .venv, .cache, .config, product/)
- Phase files say `status: pending` but plan.md says `status: completed`
- Capability definition was ambiguous in agent mind (confused with FastAPI endpoints)

## Resource Budget Constraint

From `observation-vnstock-resource-budget.yaml`:
- Budget: 1 device slot, Current: 1 (exhausted)
- Validation window: closed
- `.vnstock` must be preserved during cleanup (holds device registration state)
- Re-bootstrap after cleanup: `uv sync` rebuilds .venv, installer idempotency check skips registration when `.vnstock` exists

## Agreed Design (v2)

### Task 1: Fix Phase Statuses
- Update 4 phase files: `status: pending` → `status: completed`
- Files: phase-01 through phase-04 in `plans/260517-1200-vnstock-installer-rewrite-validation/`

### Task 2: Docker Sandbox Cleanup Script
- Create `product/api/scripts/cleanup-sandbox.sh`
- Scans `product/api/` for root-owned files/dirs
- Removes: `.venv`, `.cache`, `.config`, `product/` (recreatable)
- Preserves: `.vnstock` (device registration, budget 1/1)
- Verifies cleanup, reports what was cleaned
- Add `pnpm clean:sandbox` to package.json

### Task 3: Strengthen Capability Definition
Three locations:
- `docs/artifact-reference.md` — add "Key Principle" after Capability Term Glossary: capability scripts verify the library layer independently from the product layer
- `docs/operator-guide.md` — add clarifying note to Capability Runtime Experiment section
- `product/api/capabilities/vnstock-data/README.md` — add "What This Is / What This Isn't" section

### Task 4: Re-validate Capabilities
- Sequence: cleanup → `uv sync` → run 5 capability scripts → capture evidence
- Install script idempotency: detects `.vnstock` + `vnstock_data` importable → skips registration

## Learning-Loop Self-Improvement (Completed)

During brainstorm, agent asked about device slot state instead of reading `observation-vnstock-resource-budget.yaml`. Encoded as learning-loop artifact:

- Meta evidence: `records/evidence/meta/observation-record-discovery-gap.md`
- Decision: `records/decisions/decision-20260517T1200Z-observation-state-check-rule.yaml`
- Operator guide updated: Anti-Confusion Checklist + Agent Intake Flow step 2
- Learning-loop rules updated: Observation State Rule added

## Unresolved Questions

None — all design decisions confirmed by operator.
