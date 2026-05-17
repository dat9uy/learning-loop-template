# Brainstorm: Constraint Gate Architecture

**Date:** 2026-05-17
**Status:** Decision approved, questions resolved

## Decision (TL;DR)

**Build a constraint gate MCP server** that the main agent calls via a single tool. The gate checks observation records, budget state, and dependency chains. Enforcement is through an expanded hook that gates constraint-relevant Bash calls (docker, sudo, vendor APIs) through the gate before execution.

**Why MCP over alternatives:** Clean interface (~40 tokens for main agent), synchronous (agent needs answers now), stateless between calls (no session management), works with existing stdio transport (zero infrastructure).

**Scope v1:** Journal pattern only — "observe before workaround" for constraint discovery. Design the tool surface for breadth (all external systems) but implement only the narrow pattern first.

---

## Problem Statement

The agent encounters constraints from external systems (Docker stale mounts, device limits, sudo requirements) and attempts workarounds before documenting the constraint. The journal (`docs/journals/260517-agent-observation-gap-reflection.md`) documents two failures:

1. **Observation not written proactively** — agent hit sudo requirement, tried to solve instead of recording
2. **Workaround before transparency** — agent hit stale guard, tried to rename `.vnstock` instead of tracing the dependency chain to the exhausted device budget

Root cause: task completion is a stronger attractor than process compliance. Advisory rules (CLAUDE.md, coordinator prompts) fail when they conflict with "solve the immediate problem."

## Codebase Context

### Existing Infrastructure

| Component | What it does | Limitation |
|-----------|-------------|------------|
| `skill-coordination-gate.cjs` | Blocks Skill tool calls, routes through coordinator | Only gates Skill tool — agent bypasses via Bash |
| learning-loop coordinator | Builds constraint prompts with allowlists/forbidlists | Advisory — agent can ignore prompts |
| `check-budget.js` | Reads budget YAML, checks `current < budget` | Only checked when coordinator runs, not at constraint-discovery time |
| Observation YAML | 4 files, mixed schemas (budget, ledger, constraint) | No unified trigger mechanism, no enforcement |
| `resource-budget-rules.md` | 10 hard constraints for external systems | Rules are in agent context but agent doesn't follow them under pressure |

### Schema Relationship

Current: `resource-budget.schema.json` and `observation.schema.json` are independent.

Clarified: Budget is a **specialization** of observation — an observation with `external_system`, `resource`, `budget`, `current`, and `validation_window` fields. Technically, "budget" is an incremental state machine. The term "budget" is user-facing language for a counter with a ceiling.

The schemas should document this inheritance: budget extends observation. Dedicated schemas for dedicated use cases are fine, but the relationship must be explicit.

### Common External System Interactions (from experiments)

| Pattern | Example | Constraint Type |
|---------|---------|-----------------|
| Docker sandbox | Fresh container for install test | Stale mounts, volume cleanup, HOME leak |
| Vendor API | vnstock device registration | Device slots (1/1), auth cache |
| External installer | Makeself .run execution | API key requirements, temp file cleanup |
| OS-level | sudo for root-owned files | Permission escalation, ownership chains |

The constraint gate must handle all of these, but v1 targets the narrow pattern: constraint discovered → must document → must trace chain → then act.

## Approaches Evaluated

### Approach A: Expanded Hook (No MCP)

Expand `skill-coordination-gate.cjs` to also intercept Bash calls for docker, sudo, and vendor APIs. The hook checks observation state directly.

**Pros:** No new infrastructure. Reuses existing hook mechanism.
**Cons:** Hook script becomes complex (must parse bash commands, match patterns). Brittle — new external system = new hook rule. Hook logic and gate logic coupled. Hard to test.

**Verdict:** Rejected. Hook should be a thin dispatcher, not the gate logic itself.

### Approach B: Sidecar Background Agent

A separate agent runs alongside the main agent, monitoring constraint state. It writes gate signals to files that the main agent reads.

**Pros:** Zero context cost for main agent. Can maintain complex state.
**Cons:** Asynchronous — main agent needs answers NOW, not eventually. Hard to debug. Requires session management. Overkill for what's essentially a lookup operation.

**Verdict:** Rejected for v1. The gate check is synchronous; a background agent adds latency and complexity without proportional benefit.

### Approach C: MCP Server (Recommended)

An MCP server with two tools: `check_gate` and `record_observation`. The main agent calls `check_gate` before constraint-relevant actions. A hook gates Bash calls through the MCP server.

**Pros:** Clean interface (~40 tokens for main agent). Synchronous. Stateless between calls. Easy to test (stdio transport). Works with existing hook infrastructure.
**Cons:** New dependency (MCP SDK). New server to maintain. Requires hook expansion to gate Bash calls.

**Verdict:** Recommended. Best trade-off between enforcement strength and implementation complexity.

### Approach D: Filesystem Guards Only

Pre-write hooks that check observation state before allowing writes to constrained paths.

**Pros:** Simple, no new infrastructure.
**Cons:** Can't reach outside the repo (Docker, ~/.vnstock, vendor APIs). The journal failures happened at layer 2-3, not layer 1.

**Verdict:** Rejected as sole mechanism. Useful as complementary enforcement for repo-internal writes, but insufficient for the actual failure pattern.

## Recommended Architecture

### Tool Surface

Two MCP tools:

```
check_gate(action, target, context?) → GateResult
record_observation(type, constraint, source, details) → ObservationResult
```

**`check_gate`** — called before constraint-relevant actions. Returns:
- `{ decision: "ok" }` — proceed
- `{ decision: "blocked", reason, observation_required: true }` — write observation first
- `{ decision: "escalate", reason, chain }` — budget exhausted, ask user

**`record_observation`** — writes observation YAML. Returns confirmation with ID.

### Gate Logic

```
1. Is target on a constrained resource?
   No  → ok
   Yes →

2. Is there an observation for this constraint?
   No  → blocked (must record observation first)
   Yes →

3. Does dependency chain hit exhausted budget?
   Yes → escalate (ask user)
   No  → ok
```

### Enforcement Flow

```
Main Agent                          Hook                    MCP Server
    │                                 │                          │
    ├─ Bash("docker run ...") ───────►│                          │
    │                                 ├─ check_gate ────────────►│
    │                                 │◄─ { blocked } ──────────┤
    │◄─ hook blocks bash ────────────┤                          │
    │                                 │                          │
    ├─ record_observation(...) ─────────────────────────────────►│
    │◄─ { recorded: true } ─────────────────────────────────────┤
    │                                 │                          │
    ├─ Bash("docker run ...") ───────►│                          │
    │                                 ├─ check_gate ────────────►│
    │                                 │◄─ { ok } ────────────────┤
    │◄─ hook allows bash ────────────┤                          │
```

### Context Budget Impact

| Component | Current | With Gate |
|-----------|---------|-----------|
| Main agent context | 100% (task + constraints) | ~85% (task + 40-token tool desc) |
| Constraint tracking | Buried in main context | Isolated in MCP server |
| Per gate check | 0 (but agent carries state) | ~200 tokens (call + response) |

The 15% freed in main agent context goes to better task reasoning. Constraint logic doesn't compete with implementation attention.

### State Persistence

File-based, in `.claude/coordination/`:

```
.claude/coordination/
├── gate-state.json          # active constraints, budgets, dependency graph
├── observations/            # observation records (existing YAML files)
└── gate-log.jsonl           # append-only audit log
```

The MCP server is stateless between calls — reads files on each `check_gate`. No session management. State survives agent restarts.

### Hook Expansion

Expand the hook to gate Edit, Write, and Bash tools. The hook intercepts before execution — this is the "hard rule" enforcement.

```javascript
const GATED_TOOLS = ['Edit', 'Write', 'Bash'];
if (GATED_TOOLS.includes(input.tool_name)) {
  // Route through MCP server gate
  // For Edit/Write: check target path against coordination config
  // For Bash: check command against external-system patterns
}
```

For Edit/Write: gate checks the target path against the coordination config's write forbidlists. For Bash: gate checks command against external-system patterns (docker, sudo, curl, pip, npm). Both use the same `check_gate` MCP tool — the gate determines the constraint type from the action descriptor.

## Schema Clarification

Document the inheritance relationship:

```
observation.schema.json     (base)
    └── resource-budget.schema.json   (extends: adds external_system, resource, budget, current, validation_window)
```

"Budget" is user-facing language for an incremental state machine: a counter with a ceiling and operator-controlled transitions. The schema should document this explicitly.

## Implementation Considerations

### What Changes

1. **New:** MCP server (`tools/constraint-gate/`) with `check_gate` and `record_observation` tools
2. **Modified:** Hook script expanded to gate Edit, Write, and Bash tools
3. **Modified:** `.claude/settings.json` — register MCP server, expand hook matcher to include Edit/Write
4. **Modified:** Observation schema docs — clarify inheritance from base observation
5. **New:** `gate-log.jsonl` — append-only audit trail with pruning and summarization

### What Doesn't Change

- Existing observation YAML files (read by MCP server, not modified)
- Existing check-budget.js (MCP server calls it internally)
- Existing skill-registry.json (gates skills, not bash)
- CLAUDE.md coordination rules (now enforced by hook + MCP, not just prompts)

### Risks

| Risk | Mitigation |
|------|------------|
| Hook pattern matching is brittle | Start with exact patterns (docker, sudo), expand incrementally |
| MCP server adds latency | stdio transport, stateless — ~50ms per call, acceptable |
| Agent bypasses gate by not calling check_gate | Hook forces the call — agent can't run gated bash without gate approval |
| Gate becomes too restrictive | "ok" decision is the default for non-constrained actions |

### Success Criteria

1. Agent encounters sudo requirement → observation written BEFORE any workaround attempt
2. Agent hits stale guard → dependency chain traced to budget → user informed (no workaround cycles)
3. Gate log shows every constraint check — audit trail for debugging
4. Main agent context usage drops ~15% (constraint logic moved to MCP server)

## Resolved Questions

1. **Gate Edit/Write too:** Yes. The MCP server gates Edit, Write, and Bash tools. This enforces the coordination config's write forbidlists (currently advisory) as hard constraints.
2. **Multi-step chains:** Check once per intent/domain, not per step. The agent declares "I'm about to do X in domain Y" — gate checks the full chain at entry. No per-step polling.
3. **Log lifecycle:** Prune `gate-log.jsonl` after a configurable period. Summarize pruned entries. Push significant patterns to meta artifacts (observations, experiment records) if they improve the meta process.
