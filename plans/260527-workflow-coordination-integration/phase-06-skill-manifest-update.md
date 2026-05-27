---
phase: 6
title: "Skill & Manifest Update"
status: pending
priority: P2
effort: "1h"
dependencies: [2, 3]
---

# Phase 6: Skill & Manifest Update

## Overview

Update `agent-manifest.json` and both `.claude/skills/coordination-gate/SKILL.md` + `.factory/skills/coordination-gate/SKILL.md` to document the new agent-intentional workflow model. The skills must tell agents to call `workflow_notify_artifact` after writes and then explicitly call the recommended tools.

## Requirements

- **Functional:** Skill docs and manifest describe the new behavior: recommendations, not spawning.
- **Non-functional:** Both surfaces (Claude Code + Droid CLI) updated symmetrically.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/agent-manifest.json`
- **Modify:** `.claude/skills/coordination-gate/SKILL.md`
- **Modify:** `.factory/skills/coordination-gate/SKILL.md`

## Implementation Steps

1. **Update `agent-manifest.json`:**
   - `workflow_notify_artifact` description: "Notify that an artifact file has changed. Returns recommended MCP tools to call next based on registry triggers. Does NOT spawn processes."
   - `workflow_trigger` description: "Trigger a workflow by name. Returns the recommended MCP tool sequence. Does NOT spawn processes — the agent calls the tools explicitly."
   - Add to `workflow` group `typical_chain` if helpful:
     ```json
     "typical_chain": [
       "workflow_intake_orient",
       "workflow_intake_plan",
       "workflow_product_build",
       "workflow_notify_artifact",
       "index_validate",
       "index_extract"
     ]
     ```

2. **Update `.claude/skills/coordination-gate/SKILL.md`:**
   Add a new section after "Quickstart: Record CRUD":
   ```markdown
   ## Quickstart: Post-Write Validation

   After writing evidence, observations, capabilities, or index files via MCP record tools:

   1. Call `workflow_notify_artifact` with the file path and change type.
   2. Read the returned `recommended_next_tools`.
   3. Call each recommended tool explicitly (e.g., `index_validate`, `index_extract`).

   Example:
   ```
   workflow_notify_artifact(path="records/product/evidence/decision.md", change_type="created")
   → { recommended_next_tools: ["index_extract", "index_validate"] }
   index_extract()
   index_validate()
   ```
   ```

3. **Mirror update in `.factory/skills/coordination-gate/SKILL.md`:**
   - Copy the same section.
   - Ensure no surface-specific paths (both use same universal logic).

4. **Verify both files are identical where they should be:**
   ```bash
   diff .claude/skills/coordination-gate/SKILL.md .factory/skills/coordination-gate/SKILL.md
   ```

## Tests

No automated tests for skill docs — verification via manual review:
- Read both skill files; confirm they mention `workflow_notify_artifact` returns recommendations.
- Confirm they do NOT say workflows spawn processes automatically.
- Confirm `agent-manifest.json` descriptions match the new behavior.

## Success Criteria

- [ ] `agent-manifest.json` descriptions updated for both workflow tools.
- [ ] `.claude/skills/coordination-gate/SKILL.md` has "Post-Write Validation" quickstart.
- [ ] `.factory/skills/coordination-gate/SKILL.md` mirrors the update.
- [ ] No stale references to "spawn" or "trigger processes" in docs.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Skill docs out of sync with actual tool behavior | Medium | Review both surfaces together; diff them. |
| Agent still expects old behavior | Low | Tool names unchanged; return shape is clearer. Skill docs reinforce. |
