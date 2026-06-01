# AGENTS.md — Agent Surfaces Reference

Shared coordination rules for both Claude Code and Droid CLI. All gate logic lives in `tools/learning-loop-mcp/core/` (single source of truth). Both surfaces use the same universal hooks via thin wrappers.

## Hook Matrix

| Surface | Hook | Wrapper | Universal Script |
|---------|------|---------|------------------|
| Claude Code | Bash gate | `.claude/coordination/hooks/bash-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/bash-gate.js` |
| Claude Code | Write gate | `.claude/coordination/hooks/write-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/write-gate.js` |
| Claude Code | Inbound gate | `.claude/coordination/hooks/inbound-state-gate.cjs` | `tools/learning-loop-mcp/hooks/inbound-gate.js` |
| Droid CLI | Execute gate | `.factory/coordination/hooks/bash-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/bash-gate.js` |
| Droid CLI | Write gate | `.factory/coordination/hooks/write-coordination-gate.cjs` | `tools/learning-loop-mcp/hooks/write-gate.js` |
| Droid CLI | Inbound gate | `.factory/coordination/hooks/inbound-state-gate.cjs` | `tools/learning-loop-mcp/hooks/inbound-gate.js` |

### Gate Descriptions

- **Bash/Execute gate** — blocks commands matching constraint patterns (docker, sudo, package-manager, vendor-api, side-effect-import) without active observations, and blocks all direct writes to `records/**` via redirects/heredocs/tee.
- **Write gate** — blocks Edit/Write/Create/ApplyPatch to `records/**`, `schemas/**`, `node_modules/**`, `dist/**`, `build/**`, and unknown multi-segment paths. Allowed: `docs/**`, `plans/**`, `product/**`, `tools/**`, `.claude/**`, `.factory/**`, single-segment files.
- **Inbound gate** — warns when operator state-change messages may have stale observations.
- **MCP server** (`tools/learning-loop-mcp/server.js`) — 35 tools for constraint checks, record CRUD, preflight gating, and workflow orchestration.

### Discovery: `loop_describe`

Call `loop_describe({tier: "warm"})` at session start to discover the loop's operational surface and active rules. The tool returns a tiered view to control context bloat:

| Tier | Returns | Size | When |
|---|---|---|---|
| `summary` | counts only | <1KB | pre-flight |
| `hot` | active promoted rules + tool names | ~5KB | "is X safe?" |
| `warm` | active surface + tool descriptions + findings | 10-25KB | default; session start |
| `cold` | full history + all findings | 25-100KB | audit only |

The response includes a `tier` field (robustness echo) and a `degraded` flag when partial data is returned. On `degraded: true`, retry with `tier: "summary"` or proceed with partial data.

`loop_describe` composes with `meta_state_list`; use `meta_state_list` for detailed filtering and `loop_describe` for operational context.

### Protocol Adapter

The universal hooks handle tool name differences between surfaces:
- `Bash` (Claude) ↔ `Execute` (Droid)
- `Write` (Claude) ↔ `Create` (Droid)
- `Edit`, `ApplyPatch` — same in both

## MCP-First Record Access

**All `records/**` writes go through MCP tools.** Both gates unconditionally block direct file writes (Edit/Write/Bash redirects) to `records/**`. There is no observation-dance, no pre-authorized path, and no bypass.

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

`{type}-{surface}-{YYMMDD}T{HHmm}Z-{slug}` — e.g., `decision-product-260522T0930Z-use-vnstock-sdk`

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

1. **Identify if the artifact is required.** If the plan phase lists the file as a deliverable, it is required.
2. **For `records/**` paths:** Use the appropriate MCP CRUD tool to create or update the record. The MCP server writes directly — no gate bypass.
3. **For `schemas/**` paths:** Use `AskUserQuestion` to surface the block to the operator with: what file is blocked, why, why it's needed, and options to approve or skip.
4. **Never use Bash to circumvent a write-gate block.** If Edit/Write is blocked, using Bash (sed, cat, echo, redirect) to modify that same path is a circumvention, not a solution.
5. **Never assume `--auto` mode overrides mechanical blocks.** `--auto` skips review gates, NOT PreToolUse hook blocks. A blocked tool is a hard stop.

## Artifact-Level Loop Rules

### Product-Build Plans
- All plans with `tags: [product-build]` MUST declare surfaces in Phase 0.
- Decision records MUST exist in `records/<surface>/decisions/` before implementation phases begin. Use `record_create_decision` MCP tool.
- Missing decision records **always block** (exit 2) — regardless of `GATE_RESPONSE_MODE`.

### Product Code Writes
- Writing to `product/**` requires a valid preflight marker for the inferred surface.
- Surface inference: all `product/**` paths → surface `product`.
- The gate checks `.claude/coordination/.loop-preflight-<surface>` for a marker with a valid timestamp within 30-minute TTL.
- Missing or expired preflight markers **always block** (exit 2) — regardless of `GATE_RESPONSE_MODE`.
- The block message includes a `preflight_checklist` (6 steps) and `surface` field.
- Use `gate_mark_preflight` MCP tool to create the marker. Direct writes to `.loop-preflight-*` files are blocked by both write and bash gates.

### Journal Writes
- `docs/journals/**` is allowed unconditionally.
- Agents SHOULD suggest using `record_create_experiment` when journals contain experiment-worthy observations.

### Gate Response Modes
`GATE_RESPONSE_MODE` controls behavior for **non-artifact** gate checks only (unknown paths, observation staleness). Artifact-aware checks always block.

- `warn` (default): allow the write, emit JSON warning.
- `escalate`: block the write, require operator approval.
- Set via `GATE_RESPONSE_MODE` environment variable.

## Budget-Check Rule (vendor-api commands)

Before executing any `vendor-api` command (e.g., `curl` to vendor APIs, vendor SDK calls):

1. Call `budget_check(system="vnstock", resource="device-slots")` (or appropriate system/resource)
2. If budget observation is stale or missing, stop and ask the operator
3. If budget is exhausted (`remaining: 0`), read `observation-vnstock-device-slot-ledger` to check host fingerprint
4. Decide:
   - Same fingerprint as registered device → safe, proceed
   - New fingerprint → dangerous, stop or ask operator
5. Record your reasoning via `meta_state_report(category="budget-check", ...)` with:
   - `affected_system`: the vendor system name (e.g., `vnstock_vendor`)
   - `description`: budget numbers, fingerprint match result, and decision
   - `evidence_code_ref`: the budget observation path
6. Only proceed after recording the budget-check meta-state entry

## Side-Effect Import Rule (all vendor SDKs)

If any vendor SDK import triggers device registration or authentication (e.g., `import vnstock_data`, `import vendor_data`), do not import it directly. Use `importlib.util.find_spec()` for safe checks. If the gate blocks with `side-effect-import`, respect the block. Do not attempt to bypass it.

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

**Never ignore gate block decisions.** If blocked by preflight gate, use `gate_mark_preflight` MCP tool and retry. If blocked by records gate, use MCP CRUD tools to create the missing record. Do not use Bash to circumvent a gate block.
