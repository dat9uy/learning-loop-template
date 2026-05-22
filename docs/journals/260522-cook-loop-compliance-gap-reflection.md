# Cook Loop Compliance Gap — Reflection

## What Happened

Invoked `/ck:cook` to implement the macro layer from `records/vnstock/evidence/unified-ui-snapshot/05-macro-layer.md`. Produced a code-only plan without checking learning-loop artifacts. User blocked the attempt before any product code was written.

## Root Cause

`/ck:cook` skill workflow (plan → implement → test → review) has zero awareness of the learning-loop record system. The skill's hard-gates check code quality, test coverage, and side-effects — but never check whether decision records exist before writing to `product/**`.

I followed the skill mechanically without cross-referencing the project CLAUDE.md which states:

> Writing to `product/**` requires decision records for the inferred surface.

I also failed to read the prior experiment `experiment-product-macro-cook-no-loop-20260522T055121Z.yaml` which documents this exact failure mode — `/ck:cook` producing product code without loop compliance, archived at `archive/macro-wrong-integration`.

## Key Insight

**The gate should trigger when you write the plan, not when you write product code.**

By the time a plan exists, the agent has already committed to implementation scope and touchpoints. Checking loop compliance at the product-code write stage is too late — the mental model is already locked into "build this." The correct sequence is:

1. Scout evidence and requirements
2. **Verify decision coverage for inferred surface**
3. Check prior experiments for related attempts
4. Only then write the plan
5. Include artifact creation/update as explicit plan deliverables

## Evidence of Pattern

- Reference layer: preceded by `decision-vnstock-20260511T003000Z-product-approval-reference-slice.yaml`
- Fundamental layer: preceded by `decision-product-260521T2102Z-fundamental-live-gate.yaml`
- Macro layer (previous attempt): no decision, no claim, no risk — archived

All three followed `/ck:cook`, but only reference and fundamental had pre-existing decision records. The macro attempt failed loop compliance because the decision step was skipped.

## Corrected Posture

Before using any implementation skill in this repo:

1. Read `records/*/experiments/` for related prior attempts
2. Verify `records/<surface>/decisions/*.yaml` covers scope
3. Confirm gate status for intended write paths
4. Treat project CLAUDE.md as overriding skill defaults

## Unresolved Questions

- Should `/ck:cook` be wrapped with a loop-pre-check skill?
- Should the write-gate escalate on plan writes to `plans/` that declare `product/**` touchpoints without decision coverage?
