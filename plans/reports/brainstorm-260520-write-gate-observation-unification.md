# Brainstorm Report: Write Gate Observation Unification

Date: 2026-05-20
Topic: Close write-gate approval UX gap by reusing observation/staleness infrastructure

## Problem Statement

The write gate (`.claude/coordination/hooks/write-coordination-gate.cjs`) blocks `Edit|Write` to `records/evidence/**` and `records/observations/**`. When an agent asks the operator for approval via `AskUserQuestion` and the operator says yes, the write gate blocks the subsequent `Write` again because it is a stateless PreToolUse hook with no conversation awareness.

The agent falls back to `Bash` with a heredoc (`cat <<'EOF' > path`) to create the file. The bash gate does not check file paths, only command patterns. This creates:

- Operator confusion (approved but still failed)
- Agent workaround (tool switching)
- Governance bypass (bash creates files write gate was meant to control)

## Evaluated Approaches

### Option A: Teach Write Gate to Read Observations (Selected)

Add observation reading to the write gate. Agent records `constraint_type: write-path` observation via MCP after operator approval. Write gate checks observations before applying domain rules.

**Pros:**
- Reuses existing staleness infrastructure (inbound gate marker + `checkObservationStaleness()`)
- Mechanical approval, consistent with bash gate
- No tool switching, no UX gap
- Audit trail via observation YAML

**Cons:**
- Write gate grows from ~85 to ~120 lines
- Observation matching logic needed

### Option B: Close Bash Bypass + Update Workflow

Add path-target detection to bash gate. Update skill template to use Bash heredoc after approval.

**Pros:**
- No write gate changes
- Closes the bypass

**Cons:**
- Agents still switch tools (Write → Bash)
- Bash path detection fragile (many write patterns)
- Clunky UX preserved

### Option C: Remove Write Gate, Rely on Bash Gate

All file creation goes through Bash. Bash gate checks both constraint patterns and target paths.

**Pros:**
- Single gate

**Cons:**
- Loses `Edit|Write` convenience for ALL files
- Massive UX regression

## Final Recommended Solution

### 1. Block All `records/**` (Except Observations Directory)

```javascript
// write-coordination-gate.cjs DOMAIN_RULES
{ pattern: 'records/observations/**', decision: 'block', reason: 'State machine. Use MCP tool instead.' },
{ pattern: 'records/**',              decision: 'block', reason: 'Records require explicit approval.' },
```

`records/observations/**` stays blocked with no observation override. Only the MCP server writes there (via Node.js `fs`, bypassing the hook). All other `records/**` writes require a `write-path` observation.

### 2. Reuse Staleness Logic

Before applying domain rules, the write gate:
1. Reads observations from `records/observations/`
2. Finds active `write-path` observation matching the target path
3. Calls `checkObservationStaleness()` (same function bash gate uses)
4. If stale (operator sent state-change message after observation recorded) → block
5. If fresh → allow

Same behavior as bash gate. No new infrastructure.

### 3. Close Bash Bypass

Bash gate detects writes to `records/**` via redirect patterns (`>`, `>>`, heredoc, `tee`). Same observation check. No bypass.

### 4. Agent Workflow

```
1. Present exact file content in AskUserQuestion
2. On approval, call record_observation:
   constraint_type: write-path
   constraint: records-evidence   (or records-audit, records-metrics, etc.)
3. Then use Write tool
```

## Observation Format

```yaml
constraint_type: write-path
constraint: records-evidence
status: active
updated_at: 2026-05-20T22:33:00Z
```

| Constraint slug | Unblocks |
|---|---|
| `records-evidence` | `records/evidence/**` |
| `records-audit` | `records/audit/**` |
| `records-metrics` | `records/metrics/**` |
| `records` | `records/**` (except observations) |

## Implementation Considerations

### Files to Modify
- `.claude/coordination/hooks/write-coordination-gate.cjs` — add observation check + staleness
- `.claude/coordination/hooks/bash-coordination-gate.cjs` — add path-write detection + observation check
- `.claude/coordination/hooks/lib/gate-utils.cjs` — may need `pathMatchesObservation()` helper
- Skill template / operator guide — document new workflow

### Risk: Chicken-and-Egg

Observations are stored in `records/observations/**`. The write gate blocks this path. The MCP server writes observations via Node.js `fs` (not Claude tool calls), so it bypasses the write gate. This is by design — the MCP server is the escape hatch.

### Risk: Staleness on `/clear`

`/clear` does not update `.last-operator-message` marker. Clearing context alone does not invalidate approvals. Any post-clear message matching state-change patterns does. This is acceptable — operator intent stands until explicitly contradicted.

## Success Criteria

- [ ] Write to `records/evidence/**` without observation → blocked
- [ ] Write to `records/evidence/**` with fresh observation → allowed
- [ ] Write to `records/evidence/**` with stale observation → blocked
- [ ] Bash heredoc to `records/evidence/**` without observation → blocked
- [ ] Bash heredoc to `records/evidence/**` with fresh observation → allowed
- [ ] MCP server can still write observations to `records/observations/` freely

## Next Steps

1. Create implementation plan in `./plans/`
2. Modify write gate and bash gate
3. Update skill template / operator guide
4. Test with evidence file creation flow
5. Verify MCP observation writing still works
