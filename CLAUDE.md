# CLAUDE.md — Learning Loop Template

## Coordination System

Three PreToolUse hooks and one MCP server enforce mechanical safety.
All gate logic lives in `tools/learning-loop-mcp/core/` (single source of truth).
Both Claude Code and Droid CLI use the same universal hooks via thin wrappers:

| Surface | Hook | Wrapper | Universal Script |
|---------|------|---------|------------------|
| Claude Code | Bash gate | `.claude/coordination/hooks/bash-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/bash-gate.js` |
| Claude Code | Write gate | `.claude/coordination/hooks/write-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/write-gate.js` |
| Claude Code | Inbound gate | `.claude/coordination/hooks/inbound-state-gate.cjs` | `tools/learning-loop-mcp/hooks/inbound-gate.js` |
| Droid CLI | Execute gate | `.factory/coordination/hooks/bash-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/bash-gate.js` |
| Droid CLI | Write gate | `.factory/coordination/hooks/write-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/write-gate.js` |
| Droid CLI | Inbound gate | `.factory/coordination/hooks/inbound-state-gate.cjs` | `tools/learning-loop-mcp/hooks/inbound-gate.js` |

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
- **MCP server** (`tools/learning-loop-mcp/server.js`) — 32 tools for
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
| `record_create_decision` | Create a decision YAML in `records/<surface>/decisions/` |
| `record_update_decision` | Update an existing decision record |
| `record_create_experiment` | Create an experiment YAML in `records/<surface>/experiments/` |
| `record_update_experiment` | Update an existing experiment record |
| `record_create_risk` | Create a risk YAML in `records/<surface>/risks/` |
| `record_update_risk` | Update an existing risk record |
| `record_create_observation` | Create an observation YAML in `records/observations/` |
| `record_update_observation` | Update an existing observation's status |
| `workflow_notify_artifact` | Log a file change and evaluate triggered workflows |
| `index_validate` | Validate all YAML records against schemas |
| `index_extract` | Rebuild the index from evidence/capability files |
| `capability_generate` | Generate capability records from product surfaces |
| `gate_mark_preflight` | Mark preflight checklist complete for a surface (unlocks product/** writes for 30 min) |

See `tools/learning-loop-mcp/agent-manifest.json` for full tool grouping and quickstart recipes.

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
  implementation phases begin. Use `record_create_decision` MCP tool.
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
- Use `gate_mark_preflight` MCP tool to create the marker. Direct writes
  to `.loop-preflight-*` files are blocked by both write and bash gates.

### Journal Writes
- `docs/journals/**` is allowed unconditionally.
- Agents SHOULD suggest using `record_create_experiment` when journals
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

1. Use `gate_mark_preflight` MCP tool to unlock product/** writes for the target surface.
2. `/ck:cook evidence.md` or `/ck:cook <file>`
3. Gate validates product code writes have a valid preflight marker.

### Use Case B — Plan Then Cook

For features requiring research:

1. `/ck:plan` (produces plan.md with Phase 0 surface declaration)
2. Use `record_create_decision` MCP tool for required decision records (plan gate).
3. Use `gate_mark_preflight` MCP tool to unlock product/** writes.
4. `/ck:cook plan.md`

### Agent Rule

**Never ignore gate block decisions.** If blocked by preflight gate, use
`gate_mark_preflight` MCP tool and retry. If blocked by records gate,
use MCP CRUD tools to create the missing record. Do not use Bash to
circumvent a gate block.
