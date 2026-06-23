# Phase D Plan 3 — Mastra Agents Migration (D4+D7) — Shipped

**Date:** 2026-06-23
**Branch:** `260623-1619-phase-d-plan-3-agents`
**Plan:** `plans/260623-1619-phase-d-plan-3-agents/`

## Summary

Shipped D4 + D7 from the master tracker. Plan 3 promotes 3 meta-surface agents from concept to `createAgent` wrappers with per-agent model configuration and an agent parity harness.

## What Shipped

### Agents (D4)

- `intakeAgent` — read-only orientation surface (8 tools)
- `scoutAgent` — read-only filesystem + meta-surface (9 tools: 8 read-only + `run_scout`)
- `selfImprovementAgent` — read + operator-bounded writes (16 tools: 8 read-only + 8 write)
- `agents-manifest.json` with 3 entries (snake_case keys: `intake_agent`, `scout_agent`, `self_improvement_agent`)
- `createLoopAgent` factory with 3-layer model lookup
- `MCPServer` auto-converts to 3 `ask_*` tools: `ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`

### Per-Agent Model Config (D7)

- 3-layer lookup: (1) per-agent `agents-manifest.json` `model` field, (2) `MASTRA_AGENT_MODEL` env var, (3) code default `kimi-for-coding/k2p6`
- `.claude/coordination/MASTRA_AGENT_MODEL.md` — operator-facing env-var reference
- `.envrc` + `.env.example` — `direnv` recommended workflow (per-project, git-safe)
- No `dotenv` import in loop code (reads `process.env.*` directly)

### D-11 Reconciliation

- Legacy `tools/learning-loop-mcp/agent-manifest.json` meta_state group: 15 → 19
- Added: `propose_design`, `relationships`, `re_verify`, `supersede`

### Agent Parity Harness

- `agent-parity.test.cjs` — 7 tests (mocked LLM via `@mastra/core/test-utils/llm-mock`)
- `agent-e2e-integration.test.cjs` — 3 conditional tests (gated on `KIMI_API_KEY`, skipped by default)
- Mock injection via `__MOCK_LLM__` marker in test fixture + `MASTRA_AGENTS_MANIFEST` env var

## Test Results

| Metric | Count |
|--------|-------|
| Total tests | 1162 |
| Pass | 1161 |
| Fail | 0 |
| Skipped | 1 (baseline) |

### Breakdown

| Phase | Tests Added | Cumulative |
|-------|-------------|------------|
| Plan 1b baseline | — | 1140 |
| Phase 2 (factory) | +7 | 1147 |
| Phase 3 (agent wrappers) | +3 | 1150 |
| Phase 4 (wiring) | +0 | 1150 |
| Phase 5 (parity harness) | +7 + 3 e2e (skipped) | 1160 |
| Phase 6 (closeout) | +0 | 1160 |

Note: actual count is 1162 (vs plan's estimate of 1155) due to additional validation tests in Phase 2 beyond the planned 4.

## Files Created

| File | Purpose |
|------|---------|
| `tools/learning-loop-mastra/create-loop-agent.js` | Factory + `resolveAgentModel` helper |
| `tools/learning-loop-mastra/agents-manifest.json` | 3-entry agent manifest |
| `tools/learning-loop-mastra/agents/intake-agent.js` | intakeAgent wrapper |
| `tools/learning-loop-mastra/agents/scout-agent.js` | scoutAgent wrapper |
| `tools/learning-loop-mastra/agents/self-improvement-agent.js` | selfImprovementAgent wrapper |
| `tools/learning-loop-mastra/agents/run-scout-tool.js` | createTool wrapper for runScout |
| `tools/learning-loop-mastra/agents/build-meta-state-tools.js` | Read/write tool subset builders |
| `tools/learning-loop-mastra/agents/instructions/intake-agent.js` | intakeAgent instructions |
| `tools/learning-loop-mastra/agents/instructions/scout-agent.js` | scoutAgent instructions |
| `tools/learning-loop-mastra/agents/instructions/self-improvement-agent.js` | selfImprovementAgent instructions |
| `tools/learning-loop-mastra/scripts/probe-create-mock-model.mjs` | Phase 1 probe script |
| `.claude/coordination/MASTRA_AGENT_MODEL.md` | Operator env-var reference |
| `.envrc` | direnv hook (committed, no secrets) |
| `.env.example` | Env var template (committed) |
| `tools/learning-loop-mastra/__tests__/create-loop-agent.test.js` | Phase 2 invariant tests |
| `tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js` | Phase 3 direct unit tests |
| `tools/learning-loop-mastra/__tests__/agent-parity.test.cjs` | Phase 5 parity harness |
| `tools/learning-loop-mastra/__tests__/agent-e2e-integration.test.cjs` | Phase 5 conditional e2e |
| `tools/learning-loop-mastra/__tests__/fixtures/agents-manifest.test.json` | Test fixture |
| `tools/learning-loop-mastra/__tests__/helpers/create-mock-model.cjs` | Test helper |
| `tools/learning-loop-mastra/__tests__/helpers/mock-model-factory.cjs` | Server-process mock |

## Files Modified

| File | Change |
|------|--------|
| `tools/learning-loop-mastra/server.js` | Added agent loading + `agents: {...}` to MCPServer config |
| `tools/learning-loop-mastra/agent-manifest.json` | Added `agent` group (5→6 groups) |
| `tools/learning-loop-mcp/agent-manifest.json` | D-11: meta_state group 15→19 |
| `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` | Assertion bump 41→44 |
| `.gitignore` | Already had `.env` (no change needed) |
| `.env.example` | Added Plan 3 agent model vars |
| `plans/reports/productization-260612-1530-master-tracker.md` | D4 + D7 + D-11 flipped |

## Operator Notes

### Before Plan 4

1. **Set `KIMI_API_KEY`** in your shell (via `direnv` or `~/.bashrc`). The agent parity tests use mocked LLM and don't need this key. The e2e integration tests do.
2. **Run the e2e verification:** `KIMI_API_KEY=<your-key> node --test tools/learning-loop-mastra/__tests__/agent-e2e-integration.test.cjs`
3. **Verify the tools/list count:** `node tools/learning-loop-mastra/server.js` should log "31 tools, 10 workflows, 3 agents"

### What Plan 4 Owns

- Cold-session enumeration update for the 3 new `ask_*` tools
- Final manifest reconciliation (D-9)
- Master-tracker cleanup

## Risk Notes

- `resolveAgentModel` is now async (required for `__MOCK_LLM__` dynamic import). All callers updated.
- Agent wrappers respect `MASTRA_AGENTS_MANIFEST` env var for test-only manifest override.
- `createServerMockModel` uses `@mastra/core/test-utils/llm-mock` in the server process (not cross-process).
