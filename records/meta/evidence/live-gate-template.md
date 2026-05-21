---
capability: meta
dimension: static
scope: governance
validation_status: passed
---

# Live Gate Template

## Findings

- [live-gate-template] New external system integration requiring runtime protection uses env-var pattern gate.
- [env-var-pattern] Define gate constant `GATE_NAME_LIVE_GATE = os.getenv("GATE_NAME_LIVE_GATE", "closed")`; check before any live call.
- [approval-flow] Gate starts closed (default); operator sets env var to `open` after confirming external system state; agent checks gate before live call; operator resets to `closed` after operation.
- [no-agent-memory] Do not cache gate state in agent memory; re-read env var each time.
- [decision-record] Author decision record documenting `allowed_actions`, `blocked_actions`, `required_gates`, `affected_refs`.
- [fail-closed] Gate closed is the safe default; closed gate raises 403 or equivalent blocked signal.

## Observation

When integrating a new external system (vendor APIs, authenticated registries, device-slot systems), add a live gate using this template. The pattern keeps runtime protection in environment configuration, not agent memory or codebase state.

## Trigger

- Event class: new-external-system-integration
- Threshold: N=1
- Action when triggered: apply env-var gate pattern, author decision record, document in capability records.
