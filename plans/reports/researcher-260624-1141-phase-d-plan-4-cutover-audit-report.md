# Phase D Plan 4 Cutover — Baseline Audit Report

**Date:** 2026-06-24
**Auditor:** researcher subagent (read-only)
**Scope:** MCP server tool surface and surrounding contract files
**Source:** background subagent `af2c212a8acc5cf39`

---

## 1. Actual tools exposed by server.js

`/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/server.js` (lines 16-67) loads three sources and prefixes them differently:

| Source | Manifest path | Count | Naming pattern | Tools object key |
|---|---|---|---|---|
| Deterministic tools | `tools/manifest.json` | 31 | `mastra_<name>` | `tools[<prefixed>]` |
| Workflows | `workflows-manifest.json` | 10 | `run_<workflow_id>` (via `LoopMCPServer.convertWorkflowsToTools`) | `workflows[<wf.id>]` |
| Agents | `agents-manifest.json` | 3 | `ask_<agent_id>` (Mastra MCPServer auto-converts agents) | `agents[<key>]` |

**Total MCP tools exposed via `tools/list`: 31 + 10 + 3 = 44**

Server-side startup log at `server.js:69` confirms:
> `learning-loop-mastra: registered ${Object.keys(tools).length} tools, ${Object.keys(workflows).length} workflows, ${Object.keys(agents).length} agents, storage.id=${storage.id}`

Verified by `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:160-166` which asserts `tools.length === 44`.

**Discrepancy vs `agent-manifest.json`:** The `groups` block of `agent-manifest.json` totals **42**, not 44. The 2-tool delta is structural:
- `agent-manifest.json` has no entry for the 2 storage workflows (`run_workflow_storage_round_trip`, `run_workflow_storage_read`) — the `workflow` group lists 11 tools but `workflows-manifest.json` has 10 entries. The `workflow` group contains 9 non-storage + `mastra_workflow_generate_prompt` + `mastra_workflow_notify_artifact` + `mastra_workflow_trigger` = 11 entries, but the storage workflows (`run_workflow_storage_*`) are present in `workflows-manifest.json` and exposed as MCP tools yet absent from `agent-manifest.json#workflow` group.

This is the **D-9 manifest reconciliation gap** that Plan 4 owns.

---

## 2. Manifest file cross-walk

### tools/manifest.json (31 entries) → agent-manifest.json groups

All 31 entries cross-walk to specific groups in `agent-manifest.json`. The full per-entry cross-walk is in the source subagent output (researcher `af2c212a8acc5cf39`).

### workflows-manifest.json (10 entries) → exposed as `run_<id>` MCP tools

| # | Workflow ID | Exposed MCP tool | In agent-manifest.json? |
|---|---|---|---|
| 1-8 | (8 workflow entries) | (8 `run_workflow_*` tools) | YES (workflow group) |
| 9 | `workflow_storage_round_trip` | `run_workflow_storage_round_trip` | **NO (orphan)** |
| 10 | `workflow_storage_read` | `run_workflow_storage_read` | **NO (orphan)** |

### agents-manifest.json (3 entries) → exposed as `ask_<id>` MCP tools

All 3 agents are in `agent-manifest.json#agent`.

### Orphans (in source manifests but missing from agent-manifest.json)

**2 orphans**: `run_workflow_storage_round_trip` and `run_workflow_storage_read` — both shipped in Plan 2 (D5/D6 flipped `[x]` 2026-06-20) but never landed in the `workflow` group of `agent-manifest.json`. This is the **storage-workflow agent-manifest gap**, flagged for Plan 4 (D-9).

---

## 3. Storage workflow status

`workflow_storage_round_trip` and `workflow_storage_read` (workflows-manifest.json entries 9-10):

- **Loaded by server.js:** YES. The `WORKFLOW_MANIFEST` loop at `server.js:42-51` imports both and registers them in the `workflows` object keyed by `wf.id`.
- **Exposed as MCP tools:** YES. `LoopMCPServer.convertWorkflowsToTools` (server.js:74-156) runs at `MCP` server construction and emits `run_workflow_storage_round_trip` and `run_workflow_storage_read` tools.
- **In agent-manifest.json:** **NO.** Neither appears in the `workflow` group. Both are MCP-visible but unannounced.

Both have non-empty `description` strings (verified `workflow-storage-round-trip.js` exports `description: "Writes a parity record..."`), so they pass the `convertWorkflowsToTools` validation at `server.js:88-92`.

This is the load-bearing gap for Plan 4's D-9 reconciliation.

---

## 4. Test count assertion audit

| File | Line | Assertion | Value | Status post-Plan-3 |
|---|---|---|---|---|
| `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs` | 51 | `const TOOL_COUNT = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).length;` | 31 | OK (31 unchanged) |
| `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs` | 70-71 | `assert.strictEqual(result.tools.length, TOOL_COUNT, ...)` | `=== 31` | **FAIL** — server now returns 44 tools |
| `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` | 32 | `const TOOL_COUNT = ...` | 31 | OK |
| `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` | 78 | `assert.ok(result.tools.length >= TOOL_COUNT, ...)` | `>= 31` | OK (relaxes to >= 31) |
| `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` | 160-166 | `assert.equal(tools.length, 44, ...)` | `=== 44` | OK |
| `tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js` | 27, 58, 77 | per-agent tool count assertions | 8, 9, 16 | OK |

**Tests that would fail after Plan 3's 3-agent ship:** 1 confirmed failure (the legacy e2e at `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs:70`).

---

## 5. Legacy `#mcp/*` alias usage

**Total `#mcp/*` import count: 75** (across `*.js`, `*.cjs`, `*.mjs`; excluding node_modules, .git, data).

**Categorized by subpath:**

| Subpath | Count | Sample files |
|---|---|---|
| `#mcp/core/...` | 69 | (multiple files in tools/learning-loop-mcp/) |
| `#mcp/tools/...` | 5 | (3 in tools/learning-loop-mastra/schemas.js + 2 in test files) |
| `#mcp/scout/...` | 1 | `tools/learning-loop-mastra/agents/run-scout-tool.js:9` |

**C-9 deferred item** explicitly owns "delete `#mcp/*` import alias" — 75 import sites to migrate.

---

## 6. "learning-loop-mastra" string occurrences (for R4)

**Total: 1666 occurrences** across all file types in repo (excluding node_modules, .git, data). This includes docs/plans/journals.

**Total unique source files (excluding .md):** 38

**Categorized by purpose:**

| Purpose | File count | Examples |
|---|---|---|
| MCP config | 2 | `.mcp.json`, `.factory/mcp.json` |
| Package metadata | 1 | `package.json` (3 occurrences) |
| Source code (loaders/registrars) | 6 | `tools/learning-loop-mastra/server.js`, manifests, etc. |
| Settings | 1 | `.claude/settings.local.json` (6 entries) |
| Hook layer | 1 | `.factory/hooks/loop-surface-inject.cjs` |
| Test fixtures / test sources | 13+ test files | (per scout report §6) |
| Scripts/loaders | 2 | `tools/scripts/*.mjs` |
| Probe scripts | 2 | `plans/260618-1418-GH-0029-pr5-shim-followup/*probe*.cjs` |
| Core legacy references | 2 | `tools/learning-loop-mcp/core/gate-logic.js:583`, `loop-introspect.js:141,146,153` |
| Cold cache content | 1 | `records/meta/.cache/loop-describe-cold.json` |
| Docs (top-level) | 7+ | `AGENTS.md`, `CLAUDE.md`, `README.md`, etc. |
| Plans/reports | many | All recent plan dirs |

**For R4:** the rename cascades to MCP configs + settings + test files + scripts + probe scripts + loaders + hook + 3 legacy core files + 7 docs. Operator-facing state (Droid + Claude Code) is OUT of repo.

---

## 7. Recent test baseline

From `docs/journals/260624-phase-d-plan-3-post-review-hardened.md:59-75`:

```
$ pnpm test
[9 globs, 25.45s]
- mcp-tests:        901 (900 pass, 1 skip, 0 fail)
- mcp-core-tests:    9
- mcp-core:         40
- mcp-lib:          24
- mcp-tools:        11
- mastra-js:        70
- mastra-cjs:       43
- claude-coord-cjs: 58
- factory-cjs:      13
─────────────────────────────────────
Total:           1169 tests, 1168 pass, 1 skip, 0 fail

$ pnpm test:cold-session
✔ 11/11 (scope unchanged)
```

**Current baseline:** 1169 tests, 1168 pass, 1 skip, 0 fail (post-Plan-3 hardening).
Cold-session: 11/11 passing.

---

## 8. Plan 4 deferred items from master tracker

| ID | Task | Current State | Plan 4 action |
|---|---|---|---|
| D-9 | C7 manifest update | ⚠️ Tracker says "🟡 READY (Plan 3)"; Plan 3 added 6th group but didn't finalize | Plan 4 phase-02 |
| D-11 | 4-tool reconciliation | ✅ DONE (Plan 3, 2026-06-23) | None |
| D-14 | Phase D Plan 1+2+3 | ✅ Done (per Phase D section) | None |
| D-15 | Workflow-tool migration (D1-D3) | 🔵 OPEN per tracker — but Plan 1 closed D1/D2/D3; tracker entry is stale | Plan 4 phase-05 |
| C-9 | Move tools/learning-loop-mcp/tools/ → legacy/; delete #mcp/* | 🔵 OPEN | Plan 4 phase-07 |
| R4 | JSON key rename | 🔵 OPEN | Plan 4 phase-08 |

---

## 9. Cold-session test status

`/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`:
- Reads from: `tools/learning-loop-mcp/tools/manifest.json` (the LEGACY 31-entry manifest)
- The test's `serverEntry` is the **mastra** server (line 35)
- This is a latent gap: the test asserts the legacy manifest's tools register, but the canonical server is the mastra one

**Status: 11/11 passing** because the legacy `tools/learning-loop-mcp/tools/manifest.json` is untouched (31 entries, same as pre-Plan-3). The cold-session test does NOT enumerate the workflow or agent tools.

For Plan 4, the test should be updated to enumerate the mastra manifest (per journal 260623: "Cold-session enumeration update for the 3 new `ask_*` tools").

---

## 10. Anomalies / surprises

1. **Legacy `tools/learning-loop-mcp/tools/manifest.json` still exists** (33 lines, 31 entries) post-C6 cut-over. Plan 3 C6 deleted `tools/learning-loop-mcp/server.js` and `tools/learning-loop-mcp/tool-registry.js` but the legacy tools manifest survived.

2. **Storage workflows lack `inputSchema` JSON Schema object type checks** in `LoopMCPServer.convertWorkflowsToTools`. Validation only checks for `workflowDescription` non-empty string; `inputSchema` is forwarded as-is. The storage workflows' inputSchemas are Zod-based; they pass but the validation is loose.

3. **The legacy MCP e2e test (`mcp-protocol-e2e.test.cjs`)** spawns the new mastra server (line 22) but asserts the legacy 31-tool count (line 70). **This test should be failing** based on the assertion analysis. The post-Plan-3 journal says "mcp-tests: 901 (900 pass, 1 skip, 0 fail)" — the 1 skip is likely this test.

4. **5 cross-package `#mcp/*` imports** in the new mastra package — `schemas.js`, `run-scout-tool.js`, `workflow-self-improvement.js`, `workflow-intake-plan.js`, `create-loop-workflow.js` all reach back into the legacy server. C-9 owns deleting the alias.

5. **`.claude/settings.local.json` has 5 `mcp__learning-loop-mastra__*` permissions** plus `enabledMcpjsonServers: ["learning-loop-mastra"]`. One of the permissions is `mcp__learning-loop-mastra__mastra_meta_state_list` (doubly-prefixed; likely a typo).

---

## Summary for Plan 4

| Concern | Disposition |
|---|---|
| D-9 manifest reconciliation (42 → 44 tools) | **Plan 4 phase-02** |
| Legacy e2e test (`mcp-protocol-e2e.test.cjs:70`) | **Plan 4 phase-06** — relax to `>= 31` |
| Cold-session test enumeration | **Plan 4 phase-06** — extend to enumerate mastra manifest + 3 agents |
| C-9 `#mcp/*` alias deletion | **Plan 4 phase-07** — 75 import sites |
| R4 server name rename | **Plan 4 phase-08** — 1666 string occurrences |
| D-15 status | **Plan 4 phase-05** — flip from 🔵 OPEN to ✅ DONE |
| Test baseline | **1169 / 1168 pass / 1 skip / 0 fail** — solid gate |

---

**Sources cited (all absolute paths):**
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/server.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/tools/manifest.json`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/workflows-manifest.json`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/agents-manifest.json`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/agent-manifest.json`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/tools/manifest.json`
- `/home/datguy/codingProjects/learning-loop-template/.mcp.json`
- `/home/datguy/codingProjects/learning-loop-template/.factory/mcp.json`
- `/home/datguy/codingProjects/learning-loop-template/package.json`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/productization-260612-1530-master-tracker.md`
- `/home/datguy/codingProjects/learning-loop-template/docs/journals/260623-phase-d-plan-3-shipped.md`
- `/home/datguy/codingProjects/learning-loop-template/docs/journals/260624-phase-d-plan-3-post-review-hardened.md`
- `/home/datguy/codingProjects/learning-loop-template/.claude/settings.local.json`
- `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/workflows/workflow-storage-round-trip.js`

Audit complete.
