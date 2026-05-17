# Coordination Hooks

Hooks that enforce constraints on agent behavior through Claude Code's hook system.

## Hook Lifecycle

Claude Code invokes hooks at specific points in the agent workflow:

1. **UserPromptSubmit** — Before the agent processes an operator message
2. **PreToolUse** — Before the agent executes a tool

Hooks run as separate processes. They receive JSON on stdin and produce JSON on stdout. Exit code controls flow:
- `0` — Allow (continue)
- `2` — Block/escalate (prevent tool execution)

## Hooks

### inbound-state-gate.cjs

**Type:** `UserPromptSubmit`
**Exit behavior:** Always 0 (soft gate)

Detects state-change signals in operator messages. Injects context when observations are stale. Writes `.last-operator-message` marker for outbound gates.

**Input:** `{ prompt: string }`
**Output (when stale):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "INBOUND STATE GATE: ..."
  }
}
```

### bash-coordination-gate.cjs

**Type:** `PreToolUse`
**Matcher:** `Bash`
**Exit behavior:** 0 (allow) or 2 (block/escalate)

Gates Bash commands against constraint patterns, resource budgets, and observation staleness.

**Input:** `{ tool_name: "Bash", tool_input: { command: string } }`
**Output (when blocked):**
```json
{
  "decision": "block|escalate",
  "reason": "...",
  "constraint_type": "...",
  "inbound_gate": true
}
```

### skill-coordination-gate.cjs

**Type:** `PreToolUse`
**Matcher:** `Skill`
**Exit behavior:** 0 (allow) or 2 (block)

Blocks unregistered skills based on `skill-registry.json`.

### write-coordination-gate.cjs

**Type:** `PreToolUse`
**Matcher:** `Edit|Write`
**Exit behavior:** 0 (allow) or 2 (block)

Enforces write allowlists and forbidlists from coordination config.

## Shared Utilities

### lib/gate-utils.cjs

Common functions used by multiple hooks:
- `matchConstraintPattern(command)` — Match command against constraint patterns
- `readCoordinationConfig(coordDir)` — Read coordination config
- `readActiveProfile(coordDir)` — Read active profile
- `readObservations(obsDir)` — Read observation YAML files
- `readLastOperatorMessage(coordDir)` — Read marker file
- `checkObservationStaleness(observations, coordDir)` — Check if observations are stale
- `globMatch(pattern, path)` / `matchesAnyGlob(patterns, path)` — Glob matching

## Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `GATE_ROOT` | All hooks | Override project root for observation lookup |
| `GATE_MARKER_PATH` | Inbound/outbound gates | Override `.last-operator-message` path |

## Adding New Hooks

1. Create hook file in this directory (`.cjs` for CJS compatibility)
2. Export no symbols — hooks are standalone scripts
3. Read input from stdin, write output to stdout
4. Use `process.exit(0)` for allow, `process.exit(2)` for block
5. Register in `.claude/settings.json` under appropriate hook type
6. Add tests in `../__tests/<hook-name>.test.cjs`
7. Follow existing patterns for error handling (fail-open)

## Testing

Run all hook tests:
```bash
for f in .claude/coordination/__tests__/*.test.cjs; do node "$f"; done
```

Tests use `child_process.spawnSync` to match production invocation. Each test isolates via temp directories and `GATE_MARKER_PATH` / `GATE_ROOT` env vars.
