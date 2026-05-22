# MCP Record CRUD + Gate Simplification

## Problem

3 sessions, 3 plans, 3 journals — none achieved "produce artifact alongside implementation."
Root cause: the gate encodes the **absence** condition (records must exist) but not the
**production** workflow (how to make them exist). Edit/Write to `records/**` is blocked;
the only MCP tool that writes records (`record_observation`) writes to `records/observations/`
which is also blocked. No MCP tools exist for decisions, experiments, or risks.

## Solution

**MCP owns all CRUD for `records/**`. Gate blocks all direct Edit/Write to `records/**`.**

One rule eliminates multiple special-case mechanisms (evidence write-path observation dance,
index/capabilities write-path logic, check-loop-ready.js).

## Architecture

### New MCP Tools (6)

| Tool | Artifact | Action |
|------|----------|--------|
| `create_decision_record` | decision | CREATE |
| `update_decision_record` | decision | UPDATE |
| `create_experiment_record` | experiment | CREATE |
| `update_experiment_record` | experiment | UPDATE |
| `create_risk_record` | risk | CREATE |
| `update_risk_record` | risk | UPDATE |

Evidence is derivative of experiments — no `create_evidence_record`.
Observations retained for runtime constraint state only (sudo, docker, device limits).

### Gate Simplification

- `records/**` → always block (exit 2), message: "Use MCP tools to create/update records"
- `schemas/**` → always block (unchanged)
- `product/**` → check `hasDecisionRecords()` (file-existence, draft accepted)
- `plans/**/plan.md` → content scan for product-build tag, check decisions (unchanged)
- DELETE: evidence write-path logic, index/capabilities write-path logic,
  `WRITE_PATH_PATTERNS`, `pathMatchesObservation()`, `tools/check-loop-ready.js`

### Record Writer Pattern

Based on `observation-writer.js`:
- `record-writer.js` — shared base: ID generation, slug sanitization, atomic write,
  surface dir resolution, duplicate detection
- `decision-writer.js` — decision-specific YAML construction
- `experiment-writer.js` — experiment-specific YAML construction
- `risk-writer.js` — risk-specific YAML construction

### ID Convention

`{type}-{surface}-{YYMMDD}T{HHmm}Z-{slug}`
Example: `decision-product-260522T2100Z-mcp-crud-ownership`

## Phases

1. **record-writer base** — shared module (in progress)
2. **decision CRUD** — writer + create/update tools + manifest
3. **experiment CRUD** — writer + create/update tools + manifest
4. **risk CRUD** — writer + create/update tools + manifest
5. **gate simplification** — rewrite gate + delete dead code
6. **integration tests** — gate→MCP→validate:records round-trip
7. **CLAUDE.md update** — agent-facing MCP-first instructions

## Design Decisions

- Gate accepts draft status (file-existence check, no status parsing)
- Evidence is derivative: draft assertions → experiment to prove → evidence (no create tool)
- Observations retained for runtime state, not write-path authorization
- MCP writes directly via `writeFileSync` — bypasses Edit/Write gate (by design)
