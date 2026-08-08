---
phase: 1
title: "File the durability drift finding"
status: complete
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: File the durability drift finding

## Overview

Record the L3 drift as a meta-state finding *before* doing the work — the loop's observe-and-defer pattern (SessionStart hint `defer-needs-filing`). The finding names the contract violation (the wiring commits ephemeral rows as if durable) so the reconciliation in Phases 2–5 has a registry entry to resolve against. No code.

## Requirements
- Functional: one `meta_state_report` finding filed describing the drift, citing the L1/L2 contract clauses written this session.
- Non-functional: the finding is `escalate` severity (it is a contract violation in the shipped wiring), category `schema-drift`.

## Architecture
The finding's `affected_system` is `runtime-state`. Its `description` cites: the L1 durability axis (`docs/loop-engine.md` § Budget tracking vs ledger log), the L2 contract (`docs/runtime-contract.md` § Runtime-state row kinds), the L3 drift note (`docs/architecture.md` § Runtime-State Sidecar), and the concrete evidence — the `gate-verb:bash` (2026-08-08T04:05) and `gate-verb:node` (2026-08-08T13:13) `budget-state` rows committed to `runtime-state.jsonl` by PRs #119/#120/#122, both expired against the 30-min staleness window.

## Related Code Files
- Modify: none (records write only).
- Read: `runtime-state.jsonl`, `docs/loop-engine.md`, `docs/runtime-contract.md`, `docs/architecture.md`.

## Implementation Steps
1. Invoke `meta_state_report` with `category: schema-drift`, `severity: escalate`, `affected_system: runtime-state`, and a description naming the drift + the three doc anchors + the two committed gate-verb rows as evidence.
2. Capture the returned finding id for use in Phase 5 (`meta_state_resolve`).
3. Confirm the finding is visible via `meta_state_list({ id: <id> })` or `tools/scripts/registry-table.sh | tail -20`.

## Success Criteria
- [ ] A `schema-drift` finding id is returned and recorded in the registry.
- [ ] The finding description cites the L1/L2/L3 anchors and the two gate-verb rows as evidence.
- [ ] The finding id is captured for Phase 5 resolution.

## Risk Assessment
Low. This is a records write through the loop CLI; it cannot change behavior. The only risk is filing under the wrong `category` — `schema-drift` is correct (the wiring drifts from the L2 contract), not `loop-anti-pattern` (which is for toolchain false-positives).