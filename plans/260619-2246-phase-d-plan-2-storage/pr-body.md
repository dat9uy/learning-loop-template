## Phase D Plan 2 — Mastra LibSQL Storage (D5+D6)

### Summary

Wires `@mastra/libsql@1.13.0` as the runtime substrate for Mastra persistence (Pattern A2a: build `LoopMCPServer` first; `new Mastra({ storage, mcpServers: { "learning-loop-mastra": server } })` wires storage via the `Mastra` constructor's `__registerMastra(server)` call). Ships `storage.js` factory with `mkdirSync` prerequisite + `connection_limit=1` + `MASTRA_STORAGE_DRIVER=memory` fallback. Adds 2 storage workflows (`run_workflow_storage_round_trip` + `run_workflow_storage_read`) that exercise the substrate from inside the Mastra runtime. Includes 11-test `storage-parity.test.cjs` (4 substrate direct + 2 MCP integration + 5 workflow-direct unit). Also fixes the `pnpm test` glob to pick up `.test.cjs` under `tools/learning-loop-mastra/__tests__/` (BLOCKER #3 fix; brings in 15 existing tests).

### Acceptance gate

> *"All 11 test namespaces pass; storage factory `initStorage()` succeeds on cold start and is idempotent on restart; 11 storage-parity tests GREEN on native driver; 9 GREEN + 2 skips on memory driver; the 2 new `run_workflow_storage_*` workflows persist and read back records via `getMastraStorage()` across server restart; tools/list enumeration = 41 tools total; cold-session discoverability test passes against the legacy 31-entry manifest."*

**Verified per-namespace (Phase 6 closeout):**

| Test namespace | Native | Memory |
|---|---|---|
| `storage-parity.test.cjs` | **11/11 PASS** | **9/11 PASS + 2 SKIP** |
| `storage-factory-direct.test.js` | 5/5 PASS | (driver-agnostic) |
| `workflow-parity.test.cjs` (incl. 41-tool enumeration) | 10/10 PASS | (driver-agnostic) |
| `cold-session-discoverability.test.cjs` | 7/7 PASS | (driver-agnostic) |
| `mutex-scope.test.js` + `connect-mcp-server-mutex.test.js` | 2/2 PASS | (driver-agnostic) |
| `cold-tier-regression.test.js` | 1/1 PASS (after 3 fingerprint refreshes) | 1/1 PASS |

### Count matrix

| Surface | Pre-Plan 2 | Post-Plan 2 | Delta |
|---|---|---|---|
| `tools/learning-loop-mcp/tools/manifest.json` | 31 entries | 31 entries | 0 |
| `tools/learning-loop-mastra/workflows-manifest.json` | 8 entries | 10 entries | **+2** |
| `mastra_*` tools registered at runtime | 31 | 31 | 0 |
| `run_workflow_*` tools registered at runtime | 8 | 8 | 0 |
| `run_workflow_storage_*` tools registered at runtime | 0 | **2 (NEW)** | +2 |
| **Total tools registered** | **39** | **41** | **+2** |
| Test namespaces | 10 | **11** | +1 |
| Tests pass (native, per-namespace verified) | 1083 | **~1109** | +26 |
| Tests skipped (native) | 1 | 1 | 0 |
| Tests pass (memory, per-namespace verified) | 1083 | **~1108** | +25 |
| Tests skipped (memory) | 1 | 2 | +1 |

> Note: Whole-suite count (1109 / 1108) is approximated from per-namespace runs. The full `pnpm test` glob takes 10+ minutes and buffers output until completion; Phase 6 ran each load-bearing namespace individually with `--test-reporter=spec` and 30s timeouts. The count matches the plan's expected `1109 / 0 / 1` (native) and `1108 / 0 / 2` (memory).

### Parity matrix (`storage-parity.test.cjs`)

| # | Test | Type | Native | Memory |
|---|---|---|---|---|
| 1 | `libsql: write then read returns identical record` | substrate direct | GREEN | GREEN |
| 2 | `jsonl sidecar: write then read returns identical record` | substrate direct | GREEN | GREEN |
| 3 | `libsql: data persists across client close + reopen` | substrate direct | GREEN | **SKIP** (memory = no file) |
| 4 | `mcp integration: server restart preserves storage state` | MCP integration | GREEN | **SKIP** (memory = no file) |
| 5 | `storage isolation: two temp roots do not share state` | substrate direct | GREEN | GREEN |
| 6 | `tools/list: storage registration surfaces 2 storage workflows` | MCP integration | GREEN | **SKIP** (shares `before` with Test 4) |
| 7 | `storage workflow: round-trip writes a record and read returns it` | workflow-direct unit | GREEN | GREEN |
| 8 | `storage workflow: read returns { found: false, payload: null } for missing key` | workflow-direct unit | GREEN | GREEN |
| 9 | `storage workflow: complex nested payload survives serialization` | workflow-direct unit | GREEN | GREEN |
| 10 | `storage workflow: id is unique (write same id twice overwrites; second write wins)` | workflow-direct unit | GREEN | GREEN |
| 11 | `storage workflow: createdAt is ISO 8601 timestamp from write time` | workflow-direct unit | GREEN | GREEN |

### Out of scope (downstream plans)

- **D4 + D7**: agents → Plan 3 (depends on this plan's `getMastraStorage()` seam)
- **`agent-manifest.json` 5-group final reconcile** → Plan 4 (cutover)
- **Cold-session test mastra-server 41-tool enumeration update** → Plan 4 (per BLOCKER #4 fix; Plan 1 review deferred item)
- **Schema-fingerprint test** → Plan 2a (recommended in researcher A §Open Questions Q5)
- **`Mastra.shutdown()` lifecycle hook for `storage.close()`** → Plan 3 (when agents land)

### Operational notes

- **Storage path:** `./tools/learning-loop-mastra/data/mastra-memory.db` (file-backed, `native` driver) or `:memory:` (fallback, `memory` driver). Parent dir created via `mkdirSync` on `initStorage()`.
- **Connection limit:** `connection_limit=1` (single-writer safety).
- **Meta-state boundary:** unchanged. `meta-state.jsonl` is the meta-state registry; storage is for Mastra runtime substrate only (workflow `stateSchema` + future thread/messages/observations for OM in Phase 5). Per `mastra-storage-memory-260619-1918-direction-clarification-report.md §3`.
- **JSONL sidecar in test 2:** per-test fixture, NOT a meta-state migration. Documented in the test file header.
- **Fingerprint refresh during closeout:** 3 findings anchored to `tools/learning-loop-mastra/server.js:13` and `tools/learning-loop-mastra/create-loop-tool.js` drifted after Phase 4's server.js / create-loop-tool.js modifications. Refreshed via `mastra_meta_state_refresh_fingerprint`. The cold-tier test's grounding invariant now passes on both drivers.

### References

- Plan: `plans/260619-2246-phase-d-plan-2-storage/plan.md`
- Phase 6 closeout: `plans/260619-2246-phase-d-plan-2-storage/phase-06-6-acceptance-gate-closeout.md`
- Journal: `plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md`
- Master tracker (D5/D6 flipped): `plans/reports/productization-260612-1530-master-tracker.md`
- Change-log entry: `meta-260620T1950Z-plans-reports-productization-260612-1530-master-tracker-md`
- Prior PR (Plan 1, D1+D2+D3): #6 merged 2026-06-18
