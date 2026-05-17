# Observation Record Discovery Gap

## Observation

During brainstorming for post-validation next steps, the agent asked the user about device slot state instead of reading `records/observations/observation-vnstock-resource-budget.yaml`. The observation record contained all needed information (budget: 1, current: 1, validation_window: active: false), but the agent skipped the records layer entirely.

## Motivating Case

The user asked "do you think we could go to the next steps to check the capabilities in the product environment." The agent scouted the codebase, read the validation plan, capability scripts, and install script — but never checked `records/observations/` for system state. When discussing cleanup and re-bootstrap, the agent asked the user whether re-bootstrap would consume a device slot, instead of reading the resource budget observation that would have answered the question immediately.

## Root Cause

The Agent Intake Flow and Agent Anti-Confusion Checklist in `docs/operator-guide.md` do not include a rule to check observation records for external system state before asking the user. The intake flow step 2 scans `records/evidence/meta/` and `records/evidence/<capability>/` but does not mention `records/observations/`.

## Proposed Rule

Before asking the user about external system state (device slots, budgets, registration status, rate limits, operational constraints), check `records/observations/` for relevant observation records. Observations are the authoritative source for factual system state — they are operator-managed and more reliable than agent memory or user recall.

## Distinction From Existing Rules

- Q4 E (claims-first scanning) governs truth-status discovery through claims. This rule governs system-state discovery through observations.
- The capability-dir scan (Q6) governs planning-context discovery in evidence directories. This rule governs operational-state discovery in observation records.
- Resource budget rules (`references/resource-budget-rules.md`) govern when to block actions. This rule governs where to look for state before asking questions.

## Trigger

- Event class: brainstorm-or-planning-session-touching-external-systems
- Threshold: N=1 (principle adoption)
- Action when triggered: scan `records/observations/` for records matching the external system in question; read relevant records before asking the user about state.

## Deferral

N=1 closeable. Adopt as a rule in `docs/operator-guide.md` Agent Anti-Confusion Checklist and Agent Intake Flow.

## Superseded By

- `docs/operator-guide.md` Agent Intake Flow step 2 and Agent Anti-Confusion Checklist (commit TBD) - The observation-state-check rule has been canonized at the operator-guide level. This evidence remains as the rationale and motivating-case source.
