---
phase: 0
title: "G8 Observation + Plan Scaffolding"
status: completed
priority: P2
effort: "0.5h"
dependencies: []
---

# Phase 0: G8 Observation + Plan Scaffolding

## Overview

This phase documents the G8 subcommand-class false positive recurrence and confirms the plan structure. The `ck plan create` CLI command was blocked by G8 (5th recurrence was on 2026-06-03; 6th recurrence is the `ck plan create` invocation in this session). Per AGENTS.md, the operator-approved workaround is to use the Create tool directly. This phase logs the 6th recurrence as a meta-state change-log entry via `meta_state_log_change`, mirroring SP0's Phase 5 pattern.

## Requirements

- **Functional:**
  - Log the G8 6th recurrence in `meta-state.jsonl` as a change-log entry via `meta_state_log_change` (MCP tool, not direct write)
  - Verify the plan structure is correct (4 phases, 52+ new tests planned, all touchpoints identified)
  - Confirm the 4 inbound-state-gate observations are orthogonal to SP3 (already documented in plan.md "Inbound State Acknowledgement")
- **Non-functional:**
  - The change-log entry's `change_target` references the gated command + the workaround used
  - The change-log entry's `reason` cross-references the 5 prior recurrences and the AGENTS.md fallback
  - No `ck plan create` invocations (G8 workaround enforced)

## Architecture

This phase does not introduce new architecture. It is a self-logging + scaffold-verification step.

**Change-log entry shape** (via `meta_state_log_change`):
```js
{
  change_dimension: "gate-logic",  // or "mechanical" — the gate is the mechanical mechanism
  change_target: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
  change_diff: {
    added: [],
    removed: [],
    changed: ["ck plan create (SP3 plan scaffolding, 6th recurrence)"],
  },
  reason: "...",
  applies_to: {
    tools: ["meta_state_log_change"],
    schemas: ["core/meta-state.js"],
  },
}
```

## Related Code Files

### Create
- `meta-state.jsonl` (append 1 change-log entry via `meta_state_log_change` MCP tool)

### Modify
- None

### Read
- `meta-state.jsonl` (verify 5 prior G8 recurrences are documented)
- `AGENTS.md` (G8 fallback protocol)
- `plans/260603-sp3-drift/plan.md` (this plan; verify structure)

### Delete
- None

## Implementation Steps

1. **Verify the 4 affected observations are orthogonal to SP3** (already done in plan.md "Inbound State Acknowledgement"; no action needed).
2. **Log the G8 6th recurrence** via `meta_state_log_change`:
   - `change_dimension`: `"mechanical"`
   - `change_target`: `"tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules"`
   - `change_diff.changed`: `["ck plan create --title ... --phases ... --dir 260603-sp3-drift (SP3 plan scaffolding, 6th recurrence)"]`
   - `reason`: "G8 6th recurrence: rule-no-new-artifact-types regex matched bare 'create' in `ck plan create` subcommand. Workaround per AGENTS.md: Create tool directly. Same as 5 prior recurrences (2026-06-02 3rd/4th, 2026-06-03 5th)."
   - `applies_to.tools`: `["meta_state_log_change"]`
   - `applies_to.schemas`: `["core/meta-state.js"]`
3. **Verify the plan structure**:
   - 4 phases (Phase 0-3) with frontmatter (phase, title, status: pending, priority, effort, dependencies)
   - 52+ new tests planned (24 unit + 24 tool + 2 acceptance + 2 grounding-mode + 1 discoverability = 53)
   - All touchpoints identified (5 create + 4 modify + 0 delete)
4. **Document Phase 0 in the cook journal** (placeholder; cook journal is written at the end of Phase 3).
5. **Run `pnpm test` to confirm baseline (557 tests pass)** before any Phase 1 work begins.

## Success Criteria

- [x] `meta_state_log_change` invocation succeeds; 1 new change-log entry appended to `meta-state.jsonl`
- [x] The change-log entry's `change_target` references the gated command and the workaround
- [x] The change-log entry's `reason` cross-references the 5 prior G8 recurrences
- [x] Plan structure verified: 4 phases, 52+ new tests planned, all touchpoints identified
- [x] `pnpm test` shows 557 pass, 0 fail (baseline preserved)
- [x] No `ck plan create` invocations in this phase

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| `meta_state_log_change` itself is blocked by the G8 gate (unlikely; the tool name doesn't contain "create" in a way that triggers the regex) | Low | If blocked, fall back to the bash gate bypass (the `meta_state_log_change` tool writes to `meta-state.jsonl` via the MCP server, not via bash; the gate check is on the bash command, not the tool invocation). |
| The G8 6th recurrence is not documented, so the next plan's "6 prior recurrences" claim will be wrong | Low | The change-log entry explicitly states "6th recurrence" in the reason field. The next plan's verification can read `meta-state.jsonl` and count. |
