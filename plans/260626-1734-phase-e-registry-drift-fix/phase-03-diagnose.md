---
phase: 3
title: "Diagnose drift via MCP probe"
status: pending
priority: P2
dependencies: [1, 2]
---

# Phase 3: Diagnose drift via MCP probe

## Overview

Invoke `meta_state_consistency_check` via the MCP gateway against the live registry. Document every drift event. Classify each entry by fix-path: (a) known orphan → Phase 4 supersede/ack; (b) known pattern → handle in Phase 4 if applicable; (c) new class → file finding, defer to follow-up plan. Output is a diagnostic report at `plans/reports/diagnostic-260626-1734-phase-e-registry-drift.md`.

## Requirements

### Functional
- Tool invoked exactly once via `mcp__learning-loop__mastra_meta_state_consistency_check`
- Each drift event documented with: id, invariant_id, message, classification, fix-path
- Drift inventory grouped by classification (a/b/c)
- Diagnostic report saved to `plans/reports/diagnostic-260626-1734-phase-e-registry-drift.md`

### Non-functional
- Read-only — this phase does NOT modify `meta-state.jsonl`
- Invariant_ids must match `META_STATE_CONSISTENCY_INVARIANTS` ids exactly
- Drift events listed in the order returned by the tool (already sorted by `(entry_kind, id, invariant_id)`)
- Diagnostic report concise (1-2 pages); cross-references back to the plan

## Architecture

Phase 3 is a thin coordination phase: invoke the tool, capture the output, classify each event. No code changes.

Classification decision tree:
```
for each drift event:
  if event.invariant_id === "F-1" and event.status === "active" and "resolved_at" in event.forbidden_fields:
    classification = "known-orphan"
    fix_path = "meta_state_supersede (Phase 4)"
  elif event.invariant_id === "NEW-1" and event.status === "reported":
    classification = "known-orphan (NEW-1 introduced by 4132891)"
    fix_path = "meta_state_ack (Phase 4 — preserves resolution text)"
  else:
    classification = "new-class"
    fix_path = "file finding; defer to follow-up plan"
```

The 3 known orphans (O-1, O-2, O-3) from plan scope inventory should appear in the drift output. If any are missing, that is itself a finding to investigate (the tool may have a bug).

## Related Code Files

- **Create:** `plans/reports/diagnostic-260626-1734-phase-e-registry-drift.md` (the diagnostic report)
- **Read-only:** `meta-state.jsonl` (via the MCP tool)

## Implementation Steps

### Step 1: Verify Phase 1 + Phase 2 GREEN before invoking
Sanity check:
```bash
node --test tools/learning-loop-mastra/core/__tests__/consistency-check.test.js
node --test tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-consistency-check-tool.test.js
```

Expect 16/16 + 8/8 = 24/24 GREEN. If any fail, return to Phase 1 or 2.

### Step 2: Invoke tool via MCP
Call:
```
mcp__learning-loop__mastra_meta_state_consistency_check
```

Capture the full response (JSON). The shape is:
```json
{
  "drift_count": <N>,
  "drift_events": [
    { "id": "...", "entry_kind": "...", "status": "...",
      "invariant_id": "...", "message": "...",
      "present_fields": [...], "missing_fields": [...], "forbidden_fields": [...] },
    ...
  ]
}
```

Note: the tool returns `{ content: [{ type: "text", text: JSON.stringify(result) }] }` — parse the inner JSON.

### Step 3: Verify expected orphans present
Cross-reference the drift events with the 3 known orphans from plan scope:
- O-1: `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois` (F-1 breach)
- O-2: `meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met` (F-1 breach)
- O-3: `meta-260626T1627Z-plan-7-fix-phase-1-deferred-2-stale-mechanism-check-false-en` (NEW-1 breach)

If any expected orphan is missing, that is a finding — investigate. Likely cause: Phase 1 implementation bug; return to Phase 1.

### Step 4: Classify each event
Apply the decision tree above. For each event:
- Write the event row (id, invariant_id, message, classification, fix_path)
- Group by classification

### Step 5: Write diagnostic report
Save to `plans/reports/diagnostic-260626-1734-phase-e-registry-drift.md`:

```markdown
# Drift Diagnostic Report

**Date:** 2026-06-26T<HH:MM>Z
**Tool:** meta_state_consistency_check
**Drift count:** <N>

## Drift Events

| # | Entry id (truncated) | Invariant | Status | Classification | Fix path |
|---|----------------------|-----------|--------|----------------|----------|
| 1 | meta-260606T1830Z-... | F-1 | active | known-orphan | supersede (Phase 4) |
| 2 | meta-260606T2102Z-... | F-1 | active | known-orphan | supersede (Phase 4) |
| 3 | meta-260626T1627Z-... | NEW-1 | reported | known-orphan | ack (Phase 4) |
| ... | ... | ... | ... | ... | ... |

## Summary

- Known orphans (a): <N>
- Known patterns (b): <N>
- New class (c): <N>

## Cross-references

- Plan scope inventory: plans/260626-1734-phase-e-registry-drift-fix/plan.md §Scope Inventory
- Invariant definitions: tools/learning-loop-mastra/core/consistency-check.js
```

## Success Criteria

- [ ] Phase 1 + Phase 2 tests still GREEN before invoking
- [ ] Tool invoked exactly once via MCP
- [ ] All 3 known orphans present in the drift output (O-1, O-2, O-3)
- [ ] Each event classified and fix-path assigned
- [ ] Diagnostic report saved at `plans/reports/diagnostic-260626-1734-phase-e-registry-drift.md`
- [ ] No `meta-state.jsonl` modifications in this phase (verified by `git status` clean)

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Tool returns drift_count = 0 unexpectedly | Investigate — likely Phase 1 bug (the 3 known orphans should be present) |
| Tool returns MORE than 3 drift events | Phase 4 fix scope expands; classify as new-class and file findings; defer to follow-up |
| Tool returns FEWER than 3 drift events | Same as 0 case — investigate before proceeding |
| MCP invocation is logged but not visible in shell transcript | Capture the response text content verbatim in the diagnostic report |
| Tool's gate-log entry interferes with other gate-decision logic | Read-only operation; gate-log entry is consistent with SP3 pattern; no interference expected |

## TDD Gate

This phase has no automated test gate — it is a coordination phase. Manual verification:
- All 3 expected orphans appear in drift output
- Diagnostic report saved at the documented path
- `git status` shows no `meta-state.jsonl` modifications

If expected orphans are missing, return to Phase 1 to investigate the core function.