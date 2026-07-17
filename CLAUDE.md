# CLAUDE.md — Learning Loop Template

See `AGENTS.md` for the agent coordination reference (layer definitions, 4-kind union, internalization rule, R2 ownership). Depth lives in `docs/`: `docs/loop-engine.md` (engine invariant + concept vocabulary), `docs/runtime-contract.md` (runtime participation contract), `docs/architecture.md` (gate system, 3-layer architecture, meta-state self-learning loop), `docs/meta-state-lifecycle.md` (4-kind lifecycle), `docs/trajectory.md` (long-term direction). All runtimes share the same rules via universal hooks in `tools/learning-loop-mastra/hooks/universal/`.

Quick reference:
- **MCP server:** `tools/learning-loop-mastra/mastra/server.js` — see `tools/learning-loop-mastra/tools/manifest.json` for current tool list
- **Hooks:** `tools/learning-loop-mastra/hooks/universal/{bash,write,inbound}-gate.js`
- **Core logic:** `tools/learning-loop-mastra/core/` — single source of truth
- **Discovery:** call `loop_describe({tier: "warm"})` at session start to discover the loop's surface and active rules
- **Preflight:** use `gate_mark_preflight` MCP tool to unlock `product/**` writes
- **Records:** all `records/**` writes go through MCP tools; direct file writes are blocked
- **Gate response mode:** `warn` (default) or `escalate` via `GATE_RESPONSE_MODE` env var
- **Inbound gate:** when triggered, run `tools/scripts/registry-table.sh | tail -20` BEFORE any bash command (post-Tier-1-split the registry is two files; `registry-table.sh` reads the union of `meta-state.jsonl` + `change-log.jsonl`, dedupes by id, and emits one-line-per-id). Named observations are a subset; the full escalation context is in the registry. See `docs/architecture.md` § Inbound State Gate for the gate flow and staleness algorithm.
- **Budget check:** before vendor-api commands, call `budget_check`, then `meta_state_report(category="budget-check")` to record reasoning. See `AGENTS.md` §6 (Internalization Rule) for the citation flow.
- **Audit trail (versioned-append history per id):** `meta_state_list({ id, include_all_versions: true, include_archived: true })` — bypasses the `max_by(version)` projection. See `AGENTS.md` §6.1.
