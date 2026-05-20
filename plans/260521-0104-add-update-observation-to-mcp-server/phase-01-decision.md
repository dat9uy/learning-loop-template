---
phase: 1
title: "Decision"
status: completed
priority: P1
effort: "15m"
dependencies: []
---

# Phase 1: Decision

## Overview

Create a decision record that justifies adding an `update_observation` capability to the constraint-gate MCP server. The gap was discovered during evidence-file authoring: the existing `record_observation` tool only creates new observations (hardcoded `status: active`, rejects duplicates). There is no way to toggle an existing observation's status via MCP, forcing operators to use Bash (bypasses gate) or manual file edits.

## Requirements

- Functional: Decision record explains the gap, the chosen solution, and the rejection of alternatives.
- Non-functional: Follows project decision record schema; references the journal entry where the gap was discovered.

## Related Code Files

- Create: `records/decisions/decision-add-update-observation-to-mcp-server.md`
- Read for context: `docs/journals/260521-fundamental-capability-implementation-closeout.md` (evidence gap and write-gate block documented; MCP update gap discovered in follow-up session)
- Read for context: `tools/constraint-gate/server.js`
- Read for context: `tools/constraint-gate/observation-writer.js`

## Implementation Steps

1. Read the journal entry (gap discovery context).
2. Read `server.js` and `observation-writer.js` to verify the limitation.
3. Draft decision record with:
   - Problem: `record_observation` creates only; no update path
   - Solution: Add `update_observation` MCP tool
   - Rejected alternatives: Bash bypass (breaks gate abstraction), manual edits (operator friction)
   - Impact: Agents can re-activate/inactivate observations without leaving MCP
4. Write decision record to `records/decisions/`.

## Success Criteria

- [x] Decision record exists and is schema-valid.
- [x] Record references the journal entry and the CLAUDE.md protocol section.

## Risk Assessment

- **Risk:** Decision record path may be blocked by write gate. **Mitigation:** `records/**` is allowed by domain rules; `records/observations/**`, `records/evidence/**`, and `schemas/**` are blocked.
