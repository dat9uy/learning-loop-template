# Brainstorm Report — MCP Workflow Layer + Minimal Hook

Date: 2026-05-21
Topic: Routing artifact writes through MCP for audit + workflow triggers
Decision: Approach 2 — MCP workflow layer with minimal hard-blocking hook

---

## Problem Statement

The user wants audit trail and reactive workflows (e.g., run index extraction on every evidence change) for all learning-loop artifact writes (observations, evidence, claims). The current PreToolUse hooks provide hard-blocking enforcement but no workflow orchestration. The MCP server provides rich policy logic but no enforcement guarantee.

## Requirements (Exact)

1. **Expected output**: A system where every artifact write is logged authoritatively and can trigger downstream workflows (index extraction, validation, etc.)
2. **Acceptance criteria**: (a) Evidence write → index extraction runs automatically, (b) Audit log captures who/what/when for every artifact mutation, (c) Operator still has hard-blocking control over unconditionally blocked paths, (d) No security regression vs. current hooks
3. **Scope boundary**: Product code (product/api, product/web) is OUT of scope. Only learning-loop artifacts (records/, docs/, plans/, schemas/, tools/)
4. **Non-negotiable constraints**: Must retain exit-code-2 hard blocking for `records/observations/**`; MCP server uses stdio transport; existing observation YAML format unchanged
5. **Touchpoints**: `.claude/coordination/hooks/write-coordination-gate.cjs`, `.claude/coordination/hooks/bash-coordination-gate.cjs`, `tools/constraint-gate/server.js`, `tools/constraint-gate/gate-logic.js`, `records/evidence/**`, `records/observations/**`

## Evaluated Approaches

### Approach 1: Full MCP Replacement
Remove hooks entirely. Agent calls `check_gate` before every write and obeys the response.

- **Pros**: Single policy engine, rich responses, natural audit log, easy to test
- **Cons**: **Security regression** — agent can ignore MCP response; latency on every write; MCP crash blocks all writes; bootstrapping circular dependency
- **Verdict**: Rejected. Audit trail is meaningless if bypassable.

### Approach 2: MCP Workflow Layer + Minimal Hook (Selected)
Shrink hook to unconditional-block enforcer + MCP health check. Move all policy (budgets, staleness, write-path auth) to MCP. Add `notify_artifact_change` MCP tool for workflow triggers.

- **Pros**: Retains hard-blocking security; centralized policy in MCP; decoupled workflow triggers; authoritative audit log
- **Cons**: Slightly more complex than pure hooks; MCP is a runtime dependency
- **Verdict**: Accepted. Best balance of security and capability.

### Approach 3: Event-Driven with Existing Gate Log
No hook changes. Agent calls post-write workflow script manually.

- **Pros**: Zero architectural change; no latency on writes; minimal failure surface
- **Cons**: Agent must remember to trigger; no automatic reaction
- **Verdict**: Rejected. Doesn't solve "automatic index on every evidence change."

## Selected Architecture

```
Operator Message          Agent Action (Bash/Edit/Write)
       |                           |
       v                           v
[UserPromptSubmit]          [PreToolUse]
       |                           |
 inbound-state-gate        minimal-write-gate (50 lines)
       |                    - unconditional blocks
       |                    - delegates policy to MCP
       |                    - enforces exit code 2
       v                           v
.last-operator-message     constraint-gate MCP server
       |                           |
       +-----------+---------------+
                   |
              observations/
              (YAML records)
                   |
              gate-log.jsonl
                   |
         notify_artifact_change
         -> trigger_workflow
         -> extract-index
         -> validate-records
```

## Implementation Considerations

### Hook Shrinking
Current `write-coordination-gate.cjs` is ~150+ lines. The minimal version needs only:
1. Unconditionally block `records/observations/**`
2. For other paths, call MCP `check_gate` with `file_path`
3. If MCP returns `block` or `escalate`, exit 2 with reason
4. If MCP unreachable, fail-open or fail-closed? (recommend fail-closed for safety)

### MCP Server Expansion
New tools to add:
- `notify_artifact_change(path, change_type)` — logs change, evaluates workflows
- `trigger_workflow(name, context)` — executes a registered workflow by name

Workflow registry (JSON or inline):
- `evidence-changed` → `extract-index`, `validate-records`
- `observation-changed` → `validate-records`
- `plan-created` → `generate-docs` (if applicable)

### Audit Log Enhancement
Current `gate-log.jsonl` only logs gate decisions. Expand to log:
- `tool`: `notify_artifact_change`
- `path`: file path
- `change_type`: `created`, `updated`, `deleted`
- `triggered_workflows`: array of workflow names
- `operator_context`: from `.last-operator-message` marker

### Staleness Integration
The MCP server already checks staleness relative to `.last-operator-message`. The minimal hook should pass this through without duplicating logic.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP server crash blocks writes | High | Keep hook minimal so it can fall back to local unconditional blocks without MCP |
| Workflow script failure blocks write | Medium | Workflows should be async / best-effort, not synchronous with the write gate |
| Circular dependency: MCP file is artifact | Low | MCP server file is in `tools/`, not `records/` — outside the gate |
| Latency increase | Low | MCP call happens once per write, stdio is fast for local process |

## Success Metrics

1. Every evidence write appears in `gate-log.jsonl` with `tool: "notify_artifact_change"`
2. `extract-index` runs automatically within 5 seconds of evidence write (or immediately if sync)
3. Hook test suite passes with <100 lines in the new minimal hook
4. No regression in existing `server.test.js` or `gate-logic.test.js`

## Next Steps

1. Create implementation plan for hook shrinking + MCP expansion
2. Write minimal hook first (safety net must exist before MCP changes)
3. Add `notify_artifact_change` and `trigger_workflow` to MCP server
4. Define workflow registry JSON
5. Update `docs/system-architecture.md`
6. Write integration tests
