---
phase: 0
title: "G8 7th-Recurrence Observation + Plan Scaffolding"
status: completed
priority: P2
effort: "0.5h"
dependencies: []
---

# Phase 0: G8 7th-Recurrence Observation + Plan Scaffolding

## Overview

This phase documents the G8 subcommand-class false positive recurrence (7th) and confirms the plan scaffolding is complete. The `ck plan create` CLI command would have triggered the G8 7th recurrence (matching the pattern of recurrences 1, 3, 5, 6). Per AGENTS.md, the operator-approved workaround is to use the Create tool directly. This phase logs the 7th recurrence as a meta-state change-log entry via `meta_state_log_change` (mirror SP0's Phase 5 pattern, mirror SP3's Phase 0), and verifies that the 4 work phases plus this scaffolding phase form a complete plan.

## Requirements

- **Functional:**
  - Log the G8 7th recurrence in `meta-state.jsonl` as a change-log entry via `meta_state_log_change` (MCP tool, not direct file write) — OR — if the MCP server is unreachable (gap 2 in this very plan), use a Node script that imports `core/meta-state.js#writeEntry` (also acceptable, with a note in the change-log's `reason`).
  - Verify the plan structure is correct: 4 work phases (1-4) + 1 scaffolding phase (0); 17 new tests planned; all touchpoints identified.
  - Confirm the 4 inbound-state-gate observations are orthogonal to this plan (already documented in `plan.md` "Inbound State Acknowledgement").
- **Non-functional:**
  - The change-log entry's `change_target` references the gated command + the workaround used.
  - The change-log entry's `reason` cross-references the 6 prior recurrences and the AGENTS.md fallback.
  - No `ck plan create` invocations (G8 workaround enforced).

## Architecture

This phase does not introduce new architecture. It is a self-logging + scaffold-verification step.

**Change-log entry shape** (via `meta_state_log_change` or direct `writeEntry`):

```js
{
  change_dimension: "mechanical",
  change_target: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
  change_diff: {
    added: [],
    removed: [],
    changed: ["ck plan create (this plan's scaffolding, 7th recurrence)"],
  },
  reason: "G8 7th recurrence: rule-no-new-artifact-types regex matched bare create in ck plan create subcommand. Workaround per AGENTS.md: use the Create tool directly to scaffold plan files. Same as 6 prior recurrences (2026-06-02 1st/3rd/4th, 2026-06-03 5th, 2026-06-05 6th). This plan's Phase 1 ships 'superseded' status + 'consolidated_into' field; Phase 2 applies them to the 4 G8 finding entries. The actual fix (regex qualifier or subcommand-name allowlist) is a separate plan; this plan acknowledges the bug without fixing it.",
  applies_to: {
    tools: ["meta_state_log_change"],
    schemas: ["core/meta-state.js"],
  },
  evidence: {
    code_ref: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
    journal: "plans/260605-superseded-status-and-discoverability/plan.md",
  },
  status: "active",
}
```

## Related Code Files

- Create: `plans/260605-superseded-status-and-discoverability/plan.md`
- Create: `plans/260605-superseded-status-and-discoverability/phase-0-g8-observation-and-scaffolding.md`
- Create: `plans/260605-superseded-status-and-discoverability/phase-1-option-a-schema-and-drift-filter.md`
- Create: `plans/260605-superseded-status-and-discoverability/phase-2-apply-g8-supersede.md`
- Create: `plans/260605-superseded-status-and-discoverability/phase-3-loop-describe-cold-tier.md`
- Create: `plans/260605-superseded-status-and-discoverability/phase-4-mcp-connection-discoverability.md`
- Mutate: `meta-state.jsonl` (1 new change-log entry: this phase's G8 7th-recurrence log)

## Implementation Steps

1. Verify the 4 work phases plus this scaffolding phase are present and follow the canonical phase file template.
2. If using `meta_state_log_change`:
   - Invoke `meta_state_log_change({ change_dimension, change_target, change_diff, reason, applies_to, evidence_code_ref, evidence_journal })`.
   - Verify the entry appears in `meta-state.jsonl` (last line) with `entry_kind: 'change-log'`, `status: 'active'`.
3. If using direct `writeEntry` (MCP unreachable; gap 2 demonstrated):
   - Run a Node script that imports `core/meta-state.js#writeEntry` and appends the change-log entry directly.
   - Add a note to the change-log's `reason`: "Logged via Node script because MCP server not reachable in this session (gap 2 captured in meta-260605T1356Z-sp0-sp3-tools-require-live-mcp-server-connection). Phase 4 of this plan will close that gap."
4. Verify the plan files render correctly (frontmatter valid, sections present, no orphan refs).

## Success Criteria

- [ ] All 5 plan files (plan.md + 5 phase files) are present in `plans/260605-superseded-status-and-discoverability/`.
- [ ] The 7th G8 recurrence is logged in `meta-state.jsonl` as a change-log entry.
- [ ] The plan's `blockedBy`, `blocks`, and `related` frontmatter are valid (no orphan refs).
- [ ] The whole-plan consistency sweep finds no unresolved contradictions (per `plan.md` "Whole-Plan Consistency Gate" section).

## Risk Assessment

- **Risk:** `meta_state_log_change` is unreachable (gap 2 of this very plan). **Mitigation:** fall back to direct `writeEntry` with a note in the change-log's `reason`.
- **Risk:** the change-log entry's `change_target` could conflict with the 6th recurrence's target (same file, same line). **Mitigation:** the 7th recurrence is a separate change-log entry with a different `id` and `created_at`; the conflict is by design (the same line is hit 7 times).
- **Risk:** the plan scaffolding itself triggers G8 (which is why this phase exists). **Mitigation:** use the Create tool directly per AGENTS.md fallback; do not invoke `ck plan create`.
