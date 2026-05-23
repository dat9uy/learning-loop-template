# CLAUDE.md — Learning Loop Template

## Coordination System

Three PreToolUse hooks and one MCP server enforce mechanical safety.
All gate logic lives in `tools/coordination-gate/core/` (single source of truth).
Both Claude Code and Droid CLI use the same universal hooks via thin wrappers:

| Surface | Hook | Wrapper | Universal Script |
|---------|------|---------|------------------|
| Claude Code | Bash gate | `.claude/coordination/hooks/bash-coordination-gate.cjs` | `tools/coordination-gate/hooks/bash-gate.js` |
| Claude Code | Write gate | `.claude/coordination/hooks/write-coordination-gate.cjs` | `tools/coordination-gate/hooks/write-gate.js` |
| Claude Code | Inbound gate | `.claude/coordination/hooks/inbound-state-gate.cjs` | `tools/coordination-gate/hooks/inbound-gate.js` |
| Droid CLI | Execute gate | `.factory/coordination/hooks/bash-coordination-gate.cjs` | `tools/coordination-gate/hooks/bash-gate.js` |
| Droid CLI | Write gate | `.factory/coordination/hooks/write-coordination-gate.cjs` | `tools/coordination-gate/hooks/write-gate.js` |
| Droid CLI | Inbound gate | `.factory/coordination/hooks/inbound-state-gate.cjs` | `tools/coordination-gate/hooks/inbound-gate.js` |

- **Bash/Execute gate** — blocks commands matching constraint patterns (docker,
  sudo, package-manager, vendor-api, side-effect-import) without active
  observations, and blocks all direct writes to `records/**` via
  redirects/heredocs/tee.
- **Write gate** — blocks Edit/Write/Create/ApplyPatch to `records/**`,
  `schemas/**`, `node_modules/**`, `dist/**`, `build/**`, and unknown
  multi-segment paths. Allowed: `docs/**`, `plans/**`, `product/**`,
  `tools/**`, `.claude/**`, `.factory/**`, single-segment files.
- **Inbound gate** — warns when operator state-change messages may have stale
  observations.
- **MCP server** (`tools/coordination-gate/mcp/server.js`) — 32 tools for
  constraint checks, record CRUD, preflight gating, and workflow orchestration.

### Droid CLI Configuration

Droid CLI uses `.factory/settings.json` with the same hook JSON structure as
Claude Code. Tool name differences are handled by the universal protocol adapter:
- `Bash` (Claude) ↔ `Execute` (Droid)
- `Write` (Claude) ↔ `Create` (Droid)
- `Edit`, `ApplyPatch` — same in both

## MCP-First Record Access

**All `records/**` writes go through MCP tools.** Both gates unconditionally
block direct file writes (Edit/Write/Bash redirects) to `records/**`. There is
no observation-dance, no pre-authorized path, and no bypass.

### Available MCP CRUD Tools

| Tool | Purpose |
|------|---------|
| `create_decision_record` | Create a decision YAML in `records/<surface>/decisions/` |
| `update_decision_record` | Update an existing decision record |
| `create_experiment_record` | Create an experiment YAML in `records/<surface>/experiments/` |
| `update_experiment_record` | Update an existing experiment record |
| `create_risk_record` | Create a risk YAML in `records/<surface>/risks/` |
| `update_risk_record` | Update an existing risk record |
| `record_observation` | Create an observation YAML in `records/observations/` |
| `update_observation` | Update an existing observation's status |
| `notify_artifact_change` | Log a file change and evaluate triggered workflows |
| `validate_records` | Validate all YAML records against schemas |
| `extract_index_entries` | Rebuild the index from evidence/capability files |
| `generate_capability_records` | Generate capability records from product surfaces |
| `mark_preflight_complete` | Mark preflight checklist complete for a surface (unlocks product/** writes for 30 min) |

### Record ID Convention

`{type}-{surface}-{YYMMDD}T{HHmm}Z-{slug}` — e.g.,
`decision-product-260522T0930Z-use-vnstock-sdk`

### Surface-First Directory Layout

```
records/
├── <surface>/
│   ├── decisions/*.yaml
│   ├── experiments/*.yaml
│   └── risks/*.yaml
├── observations/*.yaml
├── meta/
│   ├── evidence/*.md
│   └── capabilities/*.yaml
└── index.yaml
```

## Write Gate Block Protocol

When the gate blocks with `decision: block`:

1. **Identify if the artifact is required.** If the plan phase lists the file
   as a deliverable, it is required.
2. **For `records/**` paths:** Use the appropriate MCP CRUD tool to create or
   update the record. The MCP server writes directly — no gate bypass.
3. **For `schemas/**` paths:** Use `AskUserQuestion` to surface the block to
   the operator with: what file is blocked, why, why it's needed, and options
   to approve or skip.
4. **Never use Bash to circumvent a write-gate block.** If Edit/Write is
   blocked, using Bash (sed, cat, echo, redirect) to modify that same path is
   a circumvention, not a solution.
5. **Never assume `--auto` mode overrides mechanical blocks.** `--auto`
   skips review gates, NOT PreToolUse hook blocks. A blocked tool is a hard
   stop.

## Artifact-Level Loop Rules

### Product-Build Plans
- All plans with `tags: [product-build]` MUST declare surfaces in Phase 0.
- Decision records MUST exist in `records/<surface>/decisions/` before
  implementation phases begin. Use `create_decision_record` MCP tool.
- Missing decision records **always block** (exit 2) — regardless of
  `GATE_RESPONSE_MODE`.

### Product Code Writes
- Writing to `product/**` requires a valid preflight marker for the inferred surface.
- Surface inference: all `product/**` paths → surface `product`.
- The gate checks `.claude/coordination/.loop-preflight-<surface>` for a marker
  with a valid timestamp within 30-minute TTL.
- Missing or expired preflight markers **always block** (exit 2) — regardless of
  `GATE_RESPONSE_MODE`.
- The block message includes a `preflight_checklist` (6 steps) and `surface` field.
- Use `mark_preflight_complete` MCP tool to create the marker. Direct writes
  to `.loop-preflight-*` files are blocked by both write and bash gates.

### Journal Writes
- `docs/journals/**` is allowed unconditionally.
- Agents SHOULD suggest using `create_experiment_record` when journals
  contain experiment-worthy observations.

### Gate Response Modes
`GATE_RESPONSE_MODE` controls behavior for **non-artifact** gate checks only
(unknown paths, observation staleness). Artifact-aware checks always block.

- `warn` (default): allow the write, emit JSON warning.
- `escalate`: block the write, require operator approval.
- Set via `GATE_RESPONSE_MODE` environment variable.

## Implementation Workflows

### Use Case A — Direct Cook

For quick product changes:

1. Use `mark_preflight_complete` MCP tool to unlock product/** writes for the target surface.
2. `/ck:cook evidence.md` or `/ck:cook <file>`
3. Gate validates product code writes have a valid preflight marker.

### Use Case B — Plan Then Cook

For features requiring research:

1. `/ck:plan` (produces plan.md with Phase 0 surface declaration)
2. Use `create_decision_record` MCP tool for required decision records (plan gate).
3. Use `mark_preflight_complete` MCP tool to unlock product/** writes.
4. `/ck:cook plan.md`

### Agent Rule

**Never ignore gate block decisions.** If blocked by preflight gate, use
`mark_preflight_complete` MCP tool and retry. If blocked by records gate,
use MCP CRUD tools to create the missing record. Do not use Bash to
circumvent a gate block.
