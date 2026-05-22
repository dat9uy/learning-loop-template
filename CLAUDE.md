# CLAUDE.md — Learning Loop Template

## Skill Coordination

This repo uses a coordination system for external skills. The system has three
PreToolUse hooks and one MCP server:

- **Bash gate** (`.claude/coordination/hooks/bash-coordination-gate.cjs`) —
  blocks Bash commands that match constraint patterns without active observations
  or with exhausted budgets.
- **Write gate** (`.claude/coordination/hooks/write-coordination-gate.cjs`) —
  blocks file writes based on domain rules (`schemas/**` and
  `records/observations/**` blocked; `docs/**`, `plans/**`, `product/**`,
  `tools/**` allowed).
- **Inbound gate** (`.claude/coordination/hooks/inbound-state-gate.cjs`) —
  warns when operator state-change messages may have stale observations.
- **MCP server** (`tools/constraint-gate/server.js`) — provides `check_gate`
  and `record_observation` tools for agent-driven constraint checks.

Skills can be invoked directly. There is no skill registry, no profile-based
gating, and no coordinator workflow. The bash gate and write gate enforce
safety mechanically.

## Write Gate Block Protocol

When the write-coordination-gate blocks a tool call with `decision: block`, the
agent MUST NOT silently defer or skip the artifact. Required behavior:

1. **Identify if the artifact is required by the current plan.** If the plan
   phase explicitly lists the file as a deliverable, it is required.
2. **For observation-backed paths** (`records/evidence/**`): Use MCP
   `record_observation` (new observation) or `update_observation` (existing
   observation) to activate the write-path observation, then retry the write.
   The `.last-operator-message` marker invalidates observations when the
   operator reports state changes; the agent updates them naively without
   prompting. No `AskUserQuestion` required.
3. **For unconditionally blocked paths** (`schemas/**`, `records/observations/**`):
   Use `AskUserQuestion` to surface the block to the operator with: what file is
   blocked, why the gate blocked it, why the file is needed, and options to
   approve or skip with a journal note.
4. **Never use Bash to bypass a write-gate block.** If Edit/Write is blocked for
   a path, using Bash (sed, cat, echo, etc.) to modify that same path is a
   circumvention, not a solution. Bash is for shell operations; blocked file
   edits require operator approval or MCP-mediated authorization.
5. **Never assume `--auto` mode overrides mechanical blocks.** The `--auto`
   flag skips review gates (post-research, post-plan, etc.), NOT PreToolUse
   hook blocks. A blocked tool is a hard stop requiring operator input.

### Pre-authorized paths

The following paths have write-path observations and do NOT require
`AskUserQuestion`:

- `records/evidence/**` — authorized by `observation-evidence-write-path` for
  runtime verification artifacts. If the observation is inactive or stale, the
  agent uses MCP `update_observation` to re-activate it and proceeds. Operator
  validates content after.

Paths without observations (e.g., `schemas/**`, `records/observations/**`)
remain blocked and require step 3 above.

## Artifact-Level Loop Rules

The write gate enforces loop compliance mechanically. These rules are the
human-readable contract.

### Product-Build Plans
- All plans with `tags: [product-build]` MUST declare surfaces in Phase 0.
- Decision records MUST exist in `records/<surface>/decisions/` before
  implementation phases begin.
- The gate scans plan frontmatter on first write. Missing decision records
  trigger a warning (default) or block (escalate mode).

### Product Code Writes
- Writing to `product/**` requires decision records for the inferred surface.
- Surface inference: `product/api/*` -> surface `product`, `product/web/*` ->
  surface `product`. Unknown segments infer surface from first path segment.
- The gate checks `records/<surface>/decisions/*.yaml` (surface-first) or
  `records/decisions/*<surface>*.yaml` (flat fallback).

### Journal Writes
- `docs/journals/**` is allowed unconditionally.
- Agents SHOULD suggest drafting `records/<surface>/experiments/` YAML when
  journals contain experiment-worthy observations.
- Journals are agent observations; experiment records are operator
  formalizations.

### Gate Response Modes
- `warn` (default): allow the write, emit a JSON warning. Use during
  initial validation and mapping confirmation.
- `escalate`: block the write, require operator approval. Use after the
  operator has validated surface mapping across 3+ builds.
- Set mode via `GATE_RESPONSE_MODE` environment variable.
