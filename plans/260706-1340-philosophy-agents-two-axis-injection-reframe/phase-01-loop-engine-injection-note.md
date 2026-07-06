# Phase 1: loop-engine.md — instruction injection note

## Context
- Source report: `plans/reports/from-problem-solving-260706-1340-injection-consumption-two-axis-l1-reframe-report.md`
- `loop-engine.md` is the L1 invariant. This phase adds one sentence; changes no vocabulary.

## File to modify
- `docs/loop-engine.md` — escape-hatch item #1 (around line 80).

## Change

Add one sentence to escape-hatch #1, after the existing text *"The escape hatch is not wrong; it is temporary."*:

> The gradient's subject is *instruction injection* — how an instruction reaches the runtime — not the file format of the artifact that carries it.

## Why this exact wording

- Names the canonical L1 term ("instruction injection") that phases 2 + 3 reference.
- Decouples the gradient from the *.md conflation (operator point 2): states explicitly the gradient is not about file format.
- Does NOT introduce state-1/2/3, "wired", "loop-maintained/encoded", or the two-axis model — those live in `philosophy.md` (phase 2). Keeps the invariant doc minimal and avoids scope-creeping the L1 vocabulary.
- Preserves the 13 escape-hatch items' vocabulary (escape-hatch kept per operator decision 2).

## Implementation steps
1. `Read` `docs/loop-engine.md` escape-hatch #1 (line ~80) to confirm exact current wording.
2. `Edit` to append the one sentence after "it is temporary." (do not alter the existing sentences).
3. Verify no other section changed.

## Validation
- `grep "instruction injection" docs/loop-engine.md` → exactly one occurrence, in escape-hatch #1.
- The deterministic-step / agentic-step / record / rule / promotion vocabulary unchanged (grep each term; counts stable).
- File stays under 100 lines (currently ~98; one sentence added).

## Risk + rollback
- **Risk:** touching the L1 invariant doc. **Mitigation:** one sentence, names a subject already implied by #1, no vocabulary change.
- **Rollback:** delete the sentence.