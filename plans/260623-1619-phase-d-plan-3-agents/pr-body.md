# Phase D Plan 3 — Mastra Agents Migration (D4+D7)

## Summary

Ships **D4 + D7** from the master tracker. Promotes 3 meta-surface agents to `createAgent` with per-agent model configuration and an agent parity harness. Closes the agents slice of the 4-plan Phase D stack; Plan 4 (cutover) is unblocked.

## What Ships

### D4 — 3 Meta-Surface Agents

| Agent | ID | Tools | Purpose |
|-------|-----|-------|---------|
| intakeAgent | `intake_agent` | 8 read-only | Orientation + deterministic verification plan |
| scoutAgent | `scout_agent` | 9 (8 read-only + `run_scout`) | Scout pipeline wrapper + readiness report |
| selfImprovementAgent | `self_improvement_agent` | 16 (8 read-only + 8 write) | Gap → experiment candidates via meta-surface |

- `createLoopAgent` factory with 3-layer model lookup
- `MCPServer` auto-converts to `ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`
- `agents-manifest.json` (3 entries, snake_case keys)

### D7 — Per-Agent Model Config

- 3-layer lookup: per-agent manifest → `MASTRA_AGENT_MODEL` env var → code default (`kimi-for-coding/k2p6`)
- `.claude/coordination/MASTRA_AGENT_MODEL.md` — operator reference
- `.envrc` + `.env.example` — `direnv` recommended (no `dotenv` in loop code)

### D-11 — Legacy Manifest Reconciliation

- `tools/learning-loop-mcp/agent-manifest.json` meta_state group: 15 → 19
- Added: `propose_design`, `relationships`, `re_verify`, `supersede`

### Agent Parity Harness

- 7 mocked LLM tests (`agent-parity.test.cjs`)
- 3 conditional e2e tests (`agent-e2e-integration.test.cjs`, gated on `KIMI_API_KEY`)

## Count Matrix

| Source | Pre-Plan 3 | Post-Plan 3 |
|--------|-----------|-------------|
| `mastra_*` tools | 31 | 31 |
| `run_workflow_*` tools | 10 | 10 |
| `ask_*` tools | 0 | **3** |
| **Total tools** | **41** | **44** |
| `agent-manifest.json` groups | 5 | **6** |
| Legacy meta_state tools | 15 | **19** |
| Test namespaces | 11 | **12** |
| Tests pass | 1140 | **1162** |

## Out of Scope

- Per-agent `memory` field (OM deferred to Phase 5)
- Multi-step `stateSchema` restructuring
- D-9 (final manifest reconciliation — Plan 4)
- Cold-session enumeration update (Plan 4)
- `dotenv` import in loop code

## Post Plan 3 — Operator Verification

Before starting Plan 4:

1. Set `KIMI_API_KEY` in shell (via `direnv` or rc)
2. Run e2e: `KIMI_API_KEY=<key> node --test tools/learning-loop-mastra/__tests__/agent-e2e-integration.test.cjs`
3. Verify tools/list: `node tools/learning-loop-mastra/server.js` → "31 tools, 10 workflows, 3 agents"
