---
phase: 1
title: "MCP Server Foundation"
status: complete
priority: P1
effort: 2h
dependencies: []
---

# Phase 1: MCP Server Foundation

## Overview

Create the MCP server with `check_gate` tool. Server uses stdio transport, reads coordination config and observation files, returns gate decisions (ok/block/escalate). Extract budget-checking as a pure function from check-budget.js.

## Context Links

- Brainstorm: `plans/reports/brainstorm-20260517-constraint-gate-architecture.md`
- Existing hook: `.claude/coordination/hooks/skill-coordination-gate.cjs`
- Coordination config: `.claude/coordination/coordination-config.json`
- check-budget tool: `tools/check-budget/check-budget.js`
- Observation schema: `schemas/observation.schema.json`
- Budget schema: `schemas/resource-budget.schema.json`

## Requirements

**Functional:**
- MCP server starts via stdio transport
- `check_gate(command, context?)` tool registered (single command string, matching hook interface)
- Gate reads coordination config for write allowlists/forbidlists
- Gate reads observation YAML files for constraint state
- Gate checks budget by reading budget YAML directly (not spawning check-budget.js)
- Returns `{ decision: "ok" }`, `{ decision: "block", reason, observation_required }`, or `{ decision: "escalate", reason, chain }`
- Decision vocabulary: `ok`, `block`, `escalate` (canonical set, matches hook convention)

**Non-functional:**
- Stateless between calls (reads files each time)
- <100ms per gate check
- Fail-open on missing/corrupt files
- ESM module (`"type": "module"` in package.json)
- Root resolution via `import.meta.url` (not env vars)

## Architecture

```
tools/constraint-gate/
├── server.js              # MCP server entry point (stdio transport)
├── gate-logic.js          # Core gate decision logic (pure functions)
├── file-readers.js        # Read coordination config, observations, budgets
├── gate-logic.test.js     # Unit tests for gate logic
├── file-readers.test.js   # Unit tests for file readers
└── server.test.js         # Integration tests for MCP tool calls
```

Gate logic (pure, testable):
1. `matchConstraintPattern(command)` → which constraint type (if any), using word-boundary regex
2. `checkObservationExists(constraintType, observations)` → match by `constraint_type` field in observation YAML
3. `checkBudgetState(budgets, system, resource)` → read budget YAML directly, map exit semantics to decisions
4. `makeGateDecision(constraintMatch, observationStatus, budgetStatus)` → final decision

**Root resolution:** Use `dirname(dirname(dirname(fileURLToPath(import.meta.url))))` (same pattern as check-budget.js). Verify resolved root contains `package.json` and `.claude/coordination/`.

**Budget checking:** Read budget YAML directly in `file-readers.js` (not spawning check-budget.js). Parse `remaining`, `validation_window_active` from the YAML. Map: `current >= budget` → escalate, `validation_window.active` → escalate, missing file → ok (fail-open), parse error → ok (fail-open).

**Constraint patterns:** Word-boundary regex unified across all phases:
```javascript
const CONSTRAINT_PATTERNS = {
  docker: /\bdocker\b/,
  sudo: /\bsudo\b/,
  'package-manager': /\b(pip|npm|yarn|pnpm)\s+(install|add)\b/,
  'vendor-api': /\bcurl\b.*api/,
};
```

**Observation matching:** Observations declare `constraint_type` field (e.g., `constraint_type: sudo`). Gate matches against this field. Existing observations without this field are read as-is (raw YAML, no schema validation for reading).

**Duplicate YAML keys:** Use `yaml.parse(content, { uniqueKeys: false })` to tolerate existing observation files with duplicate `constraint:` keys.

## Related Code Files

- Create: `tools/constraint-gate/server.js`
- Create: `tools/constraint-gate/gate-logic.js`
- Create: `tools/constraint-gate/file-readers.js`
- Create: `tools/constraint-gate/gate-logic.test.js`
- Create: `tools/constraint-gate/file-readers.test.js`
- Create: `tools/constraint-gate/server.test.js`
- Modify: `package.json` (add `@modelcontextprotocol/sdk` v1.29.0, `zod`)

## Tests Before (TDD)

Write tests for gate logic BEFORE implementation:

1. **`gate-logic.test.js`** — test `matchConstraintPattern` (word-boundary):
   - `docker run ubuntu` → matches `docker` constraint
   - `sudo chown root file` → matches `sudo` constraint
   - `pip install requests` → matches `package-manager` constraint
   - `cat docker-compose.yml` → no match (word boundary)
   - `echo "see undocumented feature"` → no match
   - `ls -la` → no constraint match
   - Split on `;`, `&`, `|` — each segment checked independently

2. **`gate-logic.test.js`** — test `makeGateDecision`:
   - No constraint match → `{ decision: "ok" }`
   - Constraint match, no observation → `{ decision: "block", observation_required: true }`
   - Constraint match, observation exists, budget ok → `{ decision: "ok" }`
   - Constraint match, observation exists, budget exhausted → `{ decision: "escalate" }`
   - Budget file missing → `{ decision: "ok" }` (fail-open)

3. **`file-readers.test.js`** — test file reading:
   - Read coordination config returns profiles
   - Read observations returns parsed YAML array (with `uniqueKeys: false`)
   - Missing file → returns empty/default (fail-open)
   - Malformed YAML → returns empty + logs warning (console.error)
   - Observation with duplicate `constraint:` keys → parsed without error

4. **`file-readers.test.js`** — test budget reading:
   - Budget with `current < budget` → `{ remaining: N, exhausted: false }`
   - Budget with `current >= budget` → `{ exhausted: true }`
   - Budget with `validation_window.active: true` → `{ windowActive: true }`
   - Missing budget file → `{ exhausted: false }` (fail-open)

## Implementation Steps

1. Initialize `tools/constraint-gate/` directory
2. Install `@modelcontextprotocol/sdk` v1.29.0 and `zod` dependencies
3. Implement `file-readers.js`:
   - `readCoordinationConfig(root)` → parse coordination-config.json
   - `readObservations(root)` → scan and parse observation YAML files (with `uniqueKeys: false`)
   - `readBudgets(root)` → scan and parse budget YAML files
   - Root resolved via `import.meta.url`, not env vars
   - All readers fail-open (return empty on error, log to console.error)
4. Implement `gate-logic.js` (pure functions, no I/O):
   - `CONSTRAINT_PATTERNS` with word-boundary regex (shared source of truth)
   - `matchConstraintPattern(command)` → constraint type or null
   - `checkObservationExists(constraintType, observations)` → match by `constraint_type` field
   - `evaluateBudget(budgetData)` → `{ exhausted, windowActive }`
   - `makeGateDecision(...)` → `{ decision: "ok" | "block" | "escalate", ... }`
5. Implement `server.js`:
   - Create MCP server with `McpServer` from SDK
   - Register `check_gate` tool: `check_gate(command, context?)` — single command string
   - Handler: reads files via file-readers, runs gate logic, returns decision
   - Start stdio transport
   - **NEVER console.log()** — use console.error() for all logging
6. Run all tests, verify gate logic correctness

## Success Criteria

- [ ] MCP server starts and responds to `check_gate` calls
- [ ] Gate correctly identifies constrained actions using word-boundary regex
- [ ] Gate returns "block" when observation missing
- [ ] Gate returns "ok" when observation exists and budget available
- [ ] Gate returns "escalate" when budget exhausted
- [ ] Gate returns "ok" when budget file missing (fail-open)
- [ ] `cat docker-compose.yml` does NOT match docker constraint
- [ ] All unit tests pass (`node --test tools/constraint-gate/*.test.js`)
- [ ] Server handles malformed input gracefully (fail-open)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| MCP SDK API changes | Pin v1.29.0, read SDK docs |
| Pattern matching false positives | Word-boundary regex, test edge cases |
| File I/O latency on each call | Files are small, reads are fast |
| Duplicate YAML keys crash parser | `uniqueKeys: false` option |
| Root resolution wrong | Verify root contains expected files at startup |

## Regression Gate

```bash
node --test tools/constraint-gate/*.test.js
pnpm check
```
