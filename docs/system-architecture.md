# System Architecture

## Constraint Gate System

The constraint gate system enforces operational boundaries on AI agent actions through a multi-layer gating architecture. It consists of inbound gates, outbound gates, an MCP server, and observation records.

### Architecture Diagram

```
Operator Message          Agent Action (Bash/Skill/Edit)
       |                           |
       v                           v
[UserPromptSubmit]          [PreToolUse]
       |                           |
 inbound-state-gate        bash-coordination-gate
       |                    skill-coordination-gate
       |                    write-coordination-gate
       |                           |
       v                           v
.last-operator-message     constraint-gate MCP server
       |                           |
       +-----------+---------------+
                   |
              observations/
              (YAML records)
```

### Inbound State Gate

**File:** `.claude/coordination/hooks/inbound-state-gate.cjs`
**Hook Type:** `UserPromptSubmit`
**Behavior:** Soft-only (never blocks)

The inbound gate intercepts operator messages before the agent processes them. It detects state-change signals (operator reporting external state changes) and injects context reminding the agent to update observations if they are stale.

#### Flow

1. Read prompt from stdin JSON (`{ prompt: string }`)
2. Skip if prompt is empty, short (`< 10` chars), or ends with `?`
3. Detect state-change signals via regex patterns
4. Write `.last-operator-message` marker file with timestamp and prompt snippet
5. Read active observations from `records/observations/`
6. Check staleness: `(now - updated_at) > 30 minutes`
7. If stale observations found, inject `additionalContext` via `hookSpecificOutput`

#### State-Change Detection Patterns

The gate uses 10 regex patterns covering:
- Device/resource clearance (`cleared`, `removed`, `wiped`, `reset`)
- Registration/creation (`registered`, `created`, `installed`, `started`)
- State reports (`working`, `running`, `fixed`, `ready`, `done`)
- Container/service state
- Slot/device status
- Operator action reports (`did`, `finished`, `completed`)
- Environment state changes
- Explicit state-change language
- Budget/resource updates
- Direct state assertions (`the X is Y`)

#### Staleness Algorithm (Inbound)

- **Threshold:** 30 minutes (`STALENESS_THRESHOLD_MS = 30 * 60 * 1000`)
- Missing `updated_at` → stale
- Invalid `updated_at` → stale
- `(now - updated_at) > 30min` → stale

#### Output Format

When stale observations are found:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "INBOUND STATE GATE: ..."
  }
}
```

Always exits with code 0 (soft gate).

### Outbound Gates

**Files:**
- `.claude/coordination/hooks/bash-coordination-gate.cjs`
- `.claude/coordination/hooks/skill-coordination-gate.cjs`
- `.claude/coordination/hooks/write-coordination-gate.cjs`
**Hook Type:** `PreToolUse`
**Behavior:** Hard-blocking (exits 2 on escalation/block)

Outbound gates intercept agent tool usage before execution. They check constraints against coordination config and observation records.

#### Bash Coordination Gate Flow

1. Read tool input from stdin JSON
2. Skip if tool is not `Bash`
3. Match command against constraint patterns
4. Check resource budgets (global)
5. Check for active observation matching constraint
6. Check observation staleness relative to last operator message
7. Escalate, block, or allow

#### Staleness Algorithm (Outbound)

- **Comparison:** marker timestamp > observation updated_at
- No marker → not stale
- Missing `updated_at` → stale
- Invalid timestamps → not stale (fail-open)
- Marker newer than observation → stale

This algorithm differs from the inbound gate's 30-minute threshold. See Known Issues (F2).

### Constraint Gate MCP Server

**File:** `tools/constraint-gate/server.js`
**Transport:** stdio (MCP protocol)
**Tools:** `check_gate`, `record_observation`

The MCP server provides the same gating logic as the outbound hooks but via the MCP protocol, enabling integration with agent tool systems.

#### check_gate

Returns `ok`, `block`, or `escalate` for a given command. Includes `inbound_gate: true` when observations are stale relative to the last operator message.

#### record_observation

Records a constraint observation as a YAML file in `records/observations/`.

### Observation Records

**Directory:** `records/observations/`
**Format:** YAML files with fields:
- `id`: Unique identifier
- `constraint_type`: Type of constraint (e.g., `docker`, `sudo`)
- `constraint`: Slug describing the constraint
- `status`: `active` or `archived`
- `updated_at`: ISO 8601 timestamp
- `description`: Human-readable explanation

Observations are the single source of truth for constraint state. The agent must not assume external state matches observation records.

### Environment Variables for Testing

| Variable | Purpose |
|----------|---------|
| `GATE_ROOT` | Override project root for observation lookup |
| `GATE_MARKER_PATH` | Override path for `.last-operator-message` marker |

### Known Issues and Limitations

#### F1: Phantom Escalation — RESOLVED

The inbound gate writes the marker file **before** checking staleness. If observations are fresh, the marker is still written. This causes the outbound gate to escalate on the next constrained command even though the inbound gate did not warn.

**Impact:** Operator sends state-change message when observations are fresh → next constrained command escalates.
**Resolution (2026-05-17):** Marker write moved after staleness check in `inbound-state-gate.cjs`. Marker is only written when observations are actually stale. Verified by integration tests.

#### F2: Staleness Algorithm Divergence — RESOLVED

The inbound gate uses a **30-minute time-based threshold**. The outbound gates use **marker-vs-observation comparison** (no threshold). These can disagree:

| Scenario | Inbound (30min) | Outbound (marker>obs) |
|----------|----------------|----------------------|
| Obs 10min old, new marker | Fresh → no warning | Stale → escalate |
| Obs 3hr old, marker 24hr old | Stale → warn | Fresh → no escalate |

**Impact:** Inbound and outbound gates may make different staleness decisions.
**Resolution (2026-05-17):** Resolved as side effect of F1 fix. Since markers are only written when observations are stale (by the 30-minute threshold), a marker exists only when observations are genuinely old. The outbound gate's `markerTime > obsTime` comparison then naturally agrees with the inbound gate's assessment. No separate fix needed.

#### F3: MCP Server Staleness Check Only on `ok` — RESOLVED

The MCP server only runs `checkObservationStaleness` when `decision === "ok"`. If budget is exhausted (decision already `escalate`), the staleness check is skipped and `inbound_gate: true` is not included.

**Impact:** Budget escalation responses don't include `inbound_gate` flag.
**Resolution (2026-05-17):** Removed `decision === "ok"` guard in `server.js`. Staleness check now runs for all constraint-matched commands regardless of decision. `inbound_gate: true` is added to budget escalations when observations are stale. Existing `ok→escalate` upgrade behavior preserved.

#### F4: Data Leak Risk

The marker file stores the first 200 characters of the operator's prompt in plaintext.

**Impact:** Sensitive information in operator messages may be persisted to disk.
**Mitigation:** Store boolean flag or hash instead of raw prompt content.

#### F8: Marker TTL — RESOLVED

The marker file never expires. An operator's state-change message causes permanent escalation until the observation is manually updated.

**Impact:** Stale marker causes escalations long after the state change is irrelevant.
**Resolution (2026-05-17):** Added `MARKER_TTL_MS = 30 * 60 * 1000` (30 minutes) to `readLastOperatorMessage` in both `gate-utils.cjs` and `server.js`. Markers older than 30 minutes are treated as `null`, preventing perpetual escalation. TTL matches inbound gate's `STALENESS_THRESHOLD_MS` for consistency.

#### F11: False Positive Rate

State-change patterns are broad. Messages like "the build is broken" trigger detection even though they may not indicate an actionable state change.

**Impact:** Occasional unnecessary context injection.
**Mitigation:** Questions ending with `?` are already filtered. Further refinement of patterns may be needed.

#### F12: Race Condition

`fs.writeFileSync` is non-atomic. A partial read during concurrent write causes `JSON.parse` to fail, resulting in `readLastOperatorMessage` returning `null` and the escalation being silently skipped.

**Impact:** Rare missed escalation during concurrent marker writes.
**Mitigation:** Acceptable for soft gate. Use atomic writes (write to temp + rename) if critical.

#### Multi-Session Isolation

The marker file has no session ID. Multiple Claude Code sessions sharing a project directory share the same marker file.

**Impact:** Session A's state-change message affects Session B's outbound gate.
**Mitigation:** Add session ID to marker filename.
