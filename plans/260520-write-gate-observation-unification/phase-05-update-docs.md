---
phase: 5
title: "Update Docs"
status: completed
priority: P2
effort: "1h"
dependencies: [4]
---

# Phase 5: Update Docs

## Overview

Update documentation to reflect the new observation-based write approval workflow. Operators and agents must know that `records/**` writes now require a `write-path` observation, and how to record one.

## Requirements

- Functional: `docs/system-architecture.md` describes the new write-path observation flow.
- Functional: `docs/operator-guide.md` documents how to approve `records/**` file creation.
- Functional: `.claude/skills/constraint-gate/SKILL.md` documents `write-path` constraint type and MCP `file_path` validation.
- Functional: `schemas/observation.schema.json` includes `constraint_type` and `constraint` as optional fields.
- Functional: MCP `check_gate` tool accepts optional `file_path` parameter for write-path validation.
- Non-functional: No stale references to profile-based gating, skill gate, or `coordination-config.json`.

## Architecture

### Docs to Update

| Document | Section to Add/Update |
|----------|----------------------|
| `docs/system-architecture.md` | Outbound Gates section: add write-path observation check to write gate and bash gate descriptions. Add `write-path` to observation record format. |
| `docs/operator-guide.md` | Add "Approving Records File Creation" subsection. Explain AskUserQuestion → `record_observation(constraint_type: write-path, constraint: records-evidence)` → Write tool flow. |
| `.claude/skills/constraint-gate/SKILL.md` | Add `write-path` to constraint types. Document `record_observation` usage for file creation approval. Document `check_gate` `file_path` parameter. Remove stale `coordination-config.json` reference. |
| `schemas/observation.schema.json` | Add optional `constraint_type` and `constraint` string properties. |

### MCP Server Scope

Extend `check_gate` in `tools/constraint-gate/server.js`:
- Add optional `file_path` parameter to the tool schema.
- If `file_path` is provided (and `command` may be absent):
  - Check if path matches `records/observations/**` → block unconditionally.
  - Check if path matches `records/evidence/**` → look for `write-path` observation with `constraint: records-evidence`.
    - No observation → block with `observation_required: true`.
    - Stale observation → escalate with `inbound_gate: true`.
    - Fresh observation → ok.
  - Check if path matches `records/claims/**` → ok (no observation needed).
  - Non-records paths → ok.
- `file_path` validation reuses `pathMatchesObservation` from `gate-utils.cjs` (or a ported copy in `gate-logic.js`).

### Operator Workflow (for docs)

```
Agent: "I need to create records/evidence/vnstock-260520.md. Content: ..."
Operator: "Yes, approved."
Agent: calls record_observation(constraint_type: "write-path", constraint: "records-evidence")
Agent: uses Write tool to create file
Write gate: sees fresh observation → allows
```

## Related Code Files

- Modify: `docs/system-architecture.md`
- Modify: `docs/operator-guide.md`
- Modify: `.claude/skills/constraint-gate/SKILL.md`
- Modify: `tools/constraint-gate/server.js`
- Modify: `tools/constraint-gate/gate-logic.js`

## Implementation Steps

1. Read current `docs/system-architecture.md` Outbound Gates section.
   - Add paragraph: "Write gate checks `write-path` observations for `records/evidence/**` before applying domain rules."
   - Add paragraph: "Bash gate detects file writes to `records/**` via redirects and checks `write-path` observations."
   - Update observation record format table to include `write-path` constraint_type.
2. Read current `docs/operator-guide.md`.
   - Add subsection under "State Query Protocol" or as new section: "Approving File Creation in records/".
   - Explain that agents must record a `write-path` observation after operator approval.
   - Include exact `record_observation` call example.
3. Read current `.claude/skills/constraint-gate/SKILL.md`.
   - Add `write-path` to constraint types list.
   - Document that `write-path` is enforced by hooks directly, but agents can pre-check via `check_gate` with `file_path`.
   - Add `check_gate` example with `file_path`: `check_gate(command: "", file_path: "records/evidence/foo.md")`.
   - Add example: `record_observation(constraint_type: "write-path", constraint: "records-evidence", description: "Operator approved evidence file creation")`.
   - Remove stale `coordination-config.json` reference from "Files" list.
4. Update `schemas/observation.schema.json`:
   - Add optional `constraint_type` string property.
   - Add optional `constraint` string property.
5. Extend MCP `check_gate` tool:
   - Add optional `file_path: z.string()` parameter to `check_gate` schema in `server.js`.
   - In `gate-logic.js`, add `evaluateWritePath(filePath, observations, root)` function:
     - Returns `{ decision: 'ok' | 'block' | 'escalate', ... }`.
     - Reuses pattern matching logic from `pathMatchesObservation` (ported or imported).
     - Checks staleness via `checkObservationStaleness`.
   - In `server.js` `check_gate` handler:
     - If `file_path` provided, call `evaluateWritePath`.
     - Merge result with constraint decision (constraint takes priority if both fail).
6. Verify no stale references to skill gate, profile, `.bypass-next`, or `coordination-config.json`.

## Success Criteria

- [ ] `docs/system-architecture.md` describes write-path observation checks for both gates.
- [ ] `docs/operator-guide.md` has an "Approving File Creation" section with workflow and example.
- [ ] `.claude/skills/constraint-gate/SKILL.md` lists `write-path` constraint type with example and documents `check_gate` `file_path` parameter.
- [ ] `schemas/observation.schema.json` includes optional `constraint_type` and `constraint` properties.
- [ ] MCP `check_gate` accepts optional `file_path` and returns correct decision for `records/evidence/**` paths.
- [ ] No stale references to profile-based gating, `.bypass-next`, or `coordination-config.json`.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Docs diverge from actual behavior | Low | Medium | Keep examples minimal and match actual observation YAML structure. Verify against test fixtures. |

## Next Steps

- End session or proceed to `/ck:cook <plan-path>` for implementation.
