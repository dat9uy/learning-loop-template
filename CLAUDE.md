# CLAUDE.md — Learning Loop Template

See `AGENTS.md` for the agent coordination reference (layer definitions, 4-kind union, internalization rule, R2 ownership). Depth lives in `docs/`: `docs/loop-engine.md` (engine invariant + concept vocabulary), `docs/runtime-contract.md` (runtime participation contract), `docs/architecture.md` (gate system, 3-layer architecture, meta-state self-learning loop), `docs/meta-state-lifecycle.md` (4-kind lifecycle), `docs/trajectory.md` (long-term direction). All runtimes share the same rules via universal hooks in `tools/learning-loop-mastra/hooks/universal/`.

Quick reference:
- **Tool surface:** `tools/learning-loop-mastra/tools/manifest.json` is the registry. The stateless CLI `tools/learning-loop-mastra/bin/loop.mjs <tool> '<json>'` is the single record surface — **12 read tools + 30 write/mutation tools = 42 tools** (the `CLI_TOOLS` set in `core/cli-tools.js`; run `loop.mjs list` to see them). The MCP server registers only the irreducible 8-tool residue (`workflow_generate_prompt`, `check_runtime_agnostic`, `update_r2_allowlist`, the two `run_workflow_storage_*` tools, and the three `ask_*` agent wrappers) in every runtime — no flag changes this. The handler manifest has 44 entries; `agent-manifest.json` remains the full 50-entry declaration. Requires `LOOP_SURFACE`; set `GATE_ROOT` for non-loop repos (default reads the loop's own repo silently — wrong-root is not an error). The MCP server itself is `tools/learning-loop-mastra/mastra/server.js`.
- **Hooks:** `tools/learning-loop-mastra/hooks/universal/{bash,write,inbound}-gate.js`
- **Core logic:** `tools/learning-loop-mastra/core/` — single source of truth
- **Discovery:** call `loop_describe({tier: "warm"})` at session start to discover the loop's surface and active rules
- **Preflight:** use `gate_mark_preflight` to unlock `product/**` writes (and `skills/**`, `schemas/**`, runtime-state surfaces)
- **Records:** all `records/**` writes go through loop tools (CLI or MCP); direct file writes are blocked
- **Gate response mode:** `warn` (default) or `escalate` via `GATE_RESPONSE_MODE` env var
- **Inbound gate:** when triggered, run `tools/scripts/registry-table.sh | tail -20` BEFORE any bash command (the registry is two files: `meta-state.jsonl` + `change-log.jsonl`; `registry-table.sh` reads the union, dedupes by id, and emits one-line-per-id). Named observations are a subset; the full escalation context is in the registry. See `docs/architecture.md` § Inbound State Gate for the gate flow and staleness algorithm.
- **Budget / side-effect commands:** there is no `budget_check` tool. Before a side-effect command (vendor API, package install, sudo, docker), call `gate_check`; record budget/ledger rows via `runtime_state_record`, and record the reasoning via `meta_state_report(category:"budget-check")`. See `AGENTS.md` §2 (Internalization Rule) for the citation flow.
- **Gate-verb allowance (bounded 30 min):** the bash gate blocks executor verbs (`bash`, `eval`, `node -e`, …) unless an active `gate-verb:<verb>` observation exists. When blocked, the block message emits the full 2-call incantation (verb substituted, fresh timestamp) — copy it. To record an allowance proactively before any block fires, fetch the canonical recipe via `loop_get_instruction({key:'gate-verb-allowance'})` — that extra lookup on the pre-block path is the accepted tradeoff for keeping this file minimal; the blocked path stays zero-discovery.
- **Audit trail (versioned-append history per id):** `meta_state_list({ id, include_all_versions: true, include_archived: true })` — bypasses the `max_by(version)` projection. See `AGENTS.md` §2.1.

## Agent skills

### Issue tracker

Issues are tracked in this repository’s GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.
