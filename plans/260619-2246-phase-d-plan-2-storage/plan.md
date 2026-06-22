---
title: "Phase D Plan 2 — Mastra LibSQL Storage (D5+D6)"
description: "Wire @mastra/libsql@1.13.0 as the runtime substrate for Mastra persistence. Ships storage.js factory + 2 storage-touching workflows + storage-parity.test.cjs (6 tests). Plan 1 (workflows) and Plan 2 ship in parallel; Plan 3 (agents) and Plan 4 (cutover) are blocked on this. Storage is Mastra runtime substrate only; meta-state stays JSONL per mastra-storage-memory-260619-1918-direction-clarification-report.md §3. Bumps tools/list count 39→41 (adds 2 run_workflow_storage_*). 1-PR delivery with 6-9 hours total effort, mirroring Plan 1's 6-phase rhythm. Q1.A LOCKED 2026-06-19: storage.js exports BOTH getMastraStorage() (LibSQLStore, for future Mastra runtime domains) AND getParityDb() (direct createClient from @libsql/client, used by the 2 storage workflows for app-level records)."
status: completed
priority: P2
branch: "main"
tags: [meta-surface, phase-d, mastra, storage, libsql, parity, tdd, atomic-gate]
blockedBy: ["260617-1950-phase-c-plan-3-cut-over"]
blocks: ["phase-d-plan-3-agents", "phase-d-plan-4-cutover"]
created: "2026-06-19T22:46:00.000Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md (4-plan stack; Plan 2 row D5+D6; Plan 2 Scope Clarification)
  - plans/reports/researcher-A-260619-2246-mastra-libsql-install-api-report.md (install probe + LibSQLStore API + wiring pattern)
  - plans/reports/general-purpose-260619-2251-storage-parity-harness-design-report.md (11-test harness design + 2-workflow integration seam; supersedes the original 6-test design per BLOCKER #2)
  - plans/reports/mastra-storage-memory-design-260619-1907-meta-state-ledger-report.md (3-layer model: Storage/Memory/Meta-state)
  - plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md (meta-state stays JSONL; Storage is Mastra runtime substrate)
  - plans/reports/productization-260612-1530-master-tracker.md#Phase D (D5, D6 checkboxes — flip after Plan 2 closeout)
  - plans/260618-1911-phase-d-plan-1-workflows/plan.md (6-phase rhythm; patterns to mirror; Q1 conflict resolution shape)
  - plans/260618-1911-phase-d-plan-1-workflows/phase-05-workflow-parity-harness.md (parity harness shape; TDD-per-concern; shared before for MCP tests)
  - plans/260616-2200-phase-c-plan-2-parity/plan.md (withBothMcpServers serializer mutex + parity harness pattern)
  - tools/learning-loop-mastra/server.js (registration point; adds storage + 2 workflows)
  - tools/learning-loop-mastra/create-loop-workflow.js (factory pattern the 2 storage workflows reuse)
  - tools/learning-loop-mastra/workflows-manifest.json (grows 8→10)
  - tools/learning-loop-mastra/__tests__/with-mcp-server.js (connectMcpServer reused; defaults to MASTRA_STORAGE_DRIVER=memory per plans/260621-2223-GH-2246-mcp-stdio-sdk-conversion)
  - tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs (bump 39→41 assertion at line 159)
  - package.json (root — add @mastra/libsql@1.13.0; no tools/learning-loop-mastra/package.json exists)
  - .gitignore (add tools/learning-loop-mastra/data/, **/*.db, **/*.db-wal, **/*.db-shm)
  - "@mastra/core 1.42.0 + @mastra/mcp 1.10.0 (pinned; @mastra/libsql@1.13.0 peer-compatible)"
---

# Phase D Plan 2 — Mastra LibSQL Storage (D5+D6)

## Overview

**Plan 2 of the 4-plan Phase D stack** (decided 2026-06-18, see `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md`). Wires `@mastra/libsql@1.13.0` as the runtime substrate for Mastra persistence. Ships **D5+D6** from the master tracker. Plans 1 + 2 ship in parallel (different files, different reviewers); Plan 3 (agents) and Plan 4 (cutover) are blocked on both.

**Why D5/D6 must be its own plan:** the storage layer introduces a new runtime dependency (`@mastra/libsql` + native binding via `@libsql/linux-x64-gnu`), a new factory (`storage.js`), a `Mastra` instance wiring change (storage is the first consumer of the `Mastra` constructor), 2 new workflows needed to exercise storage end-to-end (since Plan 1's 8 workflows are parity-faithful thin and do not touch storage), and an 11-test parity harness (4 substrate direct + 2 MCP integration + 5 workflow-direct unit per BLOCKER #2 fix). Per the operator preference for per-feature parity, this concern gets its own plan.

**Canonical boundary (locked):** meta-state stays at `./meta-state.jsonl`. Storage is for Mastra runtime substrate only (workflow `stateSchema` + suspend/resume snapshots; future thread/messages/observations for Observational Memory in Phase 5). The 2 new workflows access storage via `getParityDb()` (a direct `createClient` from `@libsql/client`, per Q1.A lock); they do NOT touch `meta-state.jsonl`. See `plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md` §3.

**Scope (6 phases, 1 branch, ~6-9h):**

1. **Phase 1 — Install probe.** `pnpm add '@mastra/libsql@1.13.0' -w` at root (corrects the brainstorm's `tools/learning-loop-mastra/package.json` typo — that file does not exist; deps inherit from root). Verify native binding resolves on WSL2; add `.gitignore` entries; set `MASTRA_STORAGE_DRIVER` env var (`native` | `web` | `memory`).
2. **Phase 2 — `storage.js` factory.** TDD: 5 invariant tests RED, then GREEN. Ships `tools/learning-loop-mastra/storage.js` exporting `storage` (LibSQLStore singleton) + `getMastraStorage()` + `getParityDb()` (direct libsql client for app-level records per Q1.A lock) + `getParityDDL()` + `initStorage()`. Parent dir `mkdirSync` before constructor (SQLITE_CANTOPEN errno 14 mitigation); `import.meta.url` for absolute path (CWD-relative path is fragile via MCP stdio); URL `file:${absPath}/mastra-memory.db?connection_limit=1` (single-writer safety); `id: "mastra-storage"` (matches Mastra docs convention).
3. **Phase 3 — 2 storage workflows + 5 direct unit tests.** TDD-per-workflow. `workflow-storage-round-trip.js` writes a record via `getMastraStorage()`; `workflow-storage-read.js` reads by id. Both thin `stateSchema = input` (parity-faithful, per Plan 1's Q1 resolution). 5 direct unit tests (no MCP): round-trip, missing-key, JSON serialization of complex payload, schema drift guard (id is primary key), and `createdAt` timestamp round-trip.
4. **Phase 4 — `server.js` wiring + manifests.** Wire `Mastra` instance with `storage` in `server.js` (Pattern A2a from researcher A — build `LoopMCPServer` first, then `new Mastra({ storage, mcpServers: { 'learning-loop-mastra': server } })`; `Mastra` constructor calls `server.__registerMastra(mastra)` via the `mcpServers` config; `MCPServerConfig` does NOT accept a `mastra` field, verified at `node_modules/@mastra/core/dist/mcp/types.d.ts:220-285`). Add 2 entries to `workflows-manifest.json` (grows 8→10). Bump `workflow-parity.test.cjs:159` assertion 39→41. Update `server.js` description string (39 → 41 tools).
5. **Phase 5 — `storage-parity.test.cjs` (11 tests).** Mixed mode (4 substrate-direct + 2 MCP-spawn + 5 workflow-direct unit; per BLOCKER #2 fix, the 5 Phase 3 tests fold into this file as Tests 7-11). Shared `before` for Tests 4 + 6 halves CI time. Per-test `withTempStorageRoot()` helper (~30 LOC) for substrate isolation. `MASTRA_STORAGE_DRIVER=memory` → Test 3 skips (cross-restart requires file-backed) AND the MCP `before` block skips Test 4 + Test 6 (per MINOR #4 fix; cross-process persistence is impossible under `:memory:`). JSONL sidecar (Test 2) is a per-test fixture, NOT a meta-state migration — call this out in the test file header comment.
6. **Phase 6 — Acceptance gate + closeout.** Full `pnpm test` (native: 1109 pass / 0 fail / 1 skipped — 1 pre-existing; memory: 1108 pass / 0 fail / 2 skipped — 1 pre-existing + 1 storage-skip group); cold-session passes (legacy 31-entry manifest verified; scope unchanged by Plan 2); `workflow-parity.test.cjs:159` asserts 41 (the SEPARATE 41-tool enumeration gate per BLOCKER #4); tracker D5/D6 flip `[x]`; `meta_state_log_change` filed (semantic, D5+D6 closure); journal entry; PR body with count matrix.

**Acceptance gate (the single durable anchor):** *"All 11 test namespaces pass (was 10; storage-parity adds one); storage factory `initStorage()` succeeds on cold start and is idempotent on restart; 11 storage-parity tests GREEN under `native` driver (4 substrate direct + 2 MCP integration + 5 workflow-direct unit; shared server spawn for the 2 MCP tests); 9 GREEN + 2 skips on `memory` driver (Test 3 substrate-direct + the MCP `before` block skipping Test 4 + Test 6 together; documented per MINOR #4 fix); the 2 new `run_workflow_storage_*` workflows persist and read back records via `getMastraStorage()` across server restart; tools/list enumeration = 41 tools total (31 `mastra_*` + 8 `run_workflow_*` + 2 `run_workflow_storage_*`); cold-session discoverability test passes against the legacy 31-entry manifest (the 41-tool enumeration is checked by `workflow-parity.test.cjs:159`, the cold-session test is a separate gate). Whole-suite count: 1109 pass / 0 fail / 1 skipped (1 pre-existing). After BLOCKER #3 glob fix: existing 15 .cjs tests (workflow-parity + mcp-protocol-e2e) join the suite, bringing the baseline from 1083 → 1098; +11 from storage-parity = 1109."*

**Count math (verified 2026-06-19 against `workflows-manifest.json` + Plan 1's closeout):**

| Source | Pre-Plan 2 | Post-Plan 2 |
|---|---|---|
| `tools/learning-loop-mastra/tools/manifest.json` | 31 entries | 31 entries (no change) |
| `tools/learning-loop-mastra/workflows-manifest.json` | 8 entries | **10 entries** (+2 storage) |
| `mastra_*` tools registered at runtime | 31 | 31 (unchanged) |
| `run_workflow_*` tools registered at runtime | 8 | 8 (unchanged) |
| `run_workflow_storage_*` tools registered at runtime | 0 | **2 (NEW)** |
| **Total tools registered** | **39** | **41** (+2) |
| Test namespaces | 10 | **11** (storage-parity is new) |
| Tests pass (native driver) | 1083 | **1109** (+15 existing .cjs + +11 from storage-parity) |
| Tests skipped (native driver) | 1 | **1** (no change; Test 4 + Test 3 only skip on `memory`) |
| Tests pass (memory driver) | 1083 | **1108** (+15 existing .cjs + +10 from storage-parity) |
| Tests skipped (memory driver) | 1 | **2** (1 pre-existing + Test 4 skip on `memory`) |

**Out of scope (separate tracks, NOT this plan):**
- **Meta-state migration JSONL → SQLite.** Locked out by `mastra-storage-memory-260619-1918-direction-clarification-report.md` §3. `meta_state_*` MCP tools continue reading `meta-state.jsonl` unchanged.
- **Per-agent `memory` config (Observational Memory).** Phase 5; not in this plan. The 2 storage workflows exercise `storage` directly, not `memory`.
- **Multi-step `stateSchema` restructuring for `self_improvement` / `runtime_probe`.** Plan 3 / Plan 1a (operator's call at Plan 3 author time). Plan 2 ships 2 thin `stateSchema = input` workflows consistent with Plan 1's parity-faithful default.
- **Turso remote backend.** Local file only.
- **`Mastra.shutdown()` lifecycle hook for storage `close()`.** Add when wiring agents in Plan 3.
- **Schema-version fingerprint test.** Recommended in researcher A §"Open Questions" Q5; deferred to **Plan 1a item 1.5** (the next plan after this one merges) per `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` §"Plan 1a candidates" — see also validate decision 2026-06-19.
- **Updating `cold-session-discoverability.test.cjs` to enumerate the mastra server's 41 tools.** Plan 1 review deferred item; Plan 4 owns (per `plans/260618-1911-phase-d-plan-1-workflows/plan.md` §"Process patterns" #6). Plan 2 keeps the cold-session test's scope as-is: it verifies the legacy 31-entry `tools/learning-loop-mcp/tools/manifest.json` tool registration shape. The mastra server's 41-tool enumeration is checked by `workflow-parity.test.cjs:159` (the bumped assertion per Phase 4 step 5).

## Phases

| Phase | Name | Status | Effort | TDD Color | Dependencies |
|-------|------|--------|--------|-----------|--------------|
| 1 | [Phase 1 — Install probe](./phase-01-1-install-probe.md) | Pending | ~30min | n/a (mechanical: install + gitignore + env var) | Plan 2 parent |
| 2 | [Phase 2 — `storage.js` factory](./phase-02-2-storage-factory.md) | Pending | ~1h | RED → GREEN (5 invariant tests: 4 factory + 1 `getParityDb()` per Q1.A lock) | Phase 1 |
| 3 | [Phase 3 — 2 storage workflows + 5 direct unit tests](./phase-03-3-storage-workflows.md) | Pending | ~1-2h | TDD per workflow (draft 5 direct tests; tests live in storage-parity.test.cjs per Phase 5) | Phase 2 |
| 4 | [Phase 4 — `server.js` wiring + manifests](./phase-04-4-server-wiring-manifest.md) | Pending | ~1h | n/a (config + manifest updates) | Phase 3 |
| 5 | [Phase 5 — `storage-parity.test.cjs` (11 tests)](./phase-05-5-storage-parity-harness.md) | Pending | ~2h | TDD per test (4 substrate + 2 MCP + 5 workflow-direct unit) | Phase 4 |
| 6 | [Phase 6 — Acceptance gate + closeout](./phase-06-6-acceptance-gate-closeout.md) | Pending | ~30min | n/a (full `pnpm test` + tracker flip + closeout) | Phase 5 |

**Total effort:** ~6-9 hours. One session. Single PR (6 commits, one per phase, stacked on a feature branch off `main`).

## Q1 Conflict Resolution (storage API surface)

The brainstorming + research surfaced **two scope conflicts** about storage's external API. Both resolved in this plan:

**Q1.A — Storage API surface (locked 2026-06-19 at planning time per validate decision):**
Researcher B's §"Open Questions" Q1 noted the installed `@mastra/libsql` may expose either direct `set/get` or domain-routed `stores.<table>.save/get`. **Resolution: lock the API surface as direct `createClient` from `@libsql/client`** (bypasses the Mastra storage abstraction; the abstraction is for Mastra runtime domains, not app-level records).

Verified against https://mastra.ai/reference/storage/libsql (fetched 2026-06-19): `LibSQLStore` exposes domain stores via `getStore('<domain>')` only; no generic CRUD API. The 2 storage workflows (Phase 3) need to write/read app-level records (id/kind/payload/createdAt) which don't fit any Mastra domain. The cleanest path: `createClient` from `@libsql/client`, with the DDL `CREATE TABLE IF NOT EXISTS parity_records` (in storage.js). The 2 storage workflows use a `getParityDb()` factory from `storage.js`.

The `getMastraStorage()` export is retained for future Mastra runtime use (workflow snapshots, threads, etc.) but is NOT used by the 2 storage workflows. Both point to the same `mastra-memory.db` file but use disjoint tables.

**Q1.B — In-memory fallback wording:**
Brainstorm risk #2 says "fall back to in-memory SQLite via `@libsql/client` `file::memory:?`". Researcher B §5.2 verified per `https://mastra.ai/reference/storage/libsql` (fetched 2026-06-19) that the correct format is `url: ':memory:'` (no `file:` prefix when using LibSQLStore directly). **Resolution:** Phase 1 install probe documents the corrected format; Phase 2 factory uses `:memory:` for the env-var-driven fallback path.

## Pre-flight Checklist (per R-15 acceptance)

| Phase | Gated Path | Tool / Env | Notes |
|-------|-----------|------------|-------|
| 1 | `package.json` (root) | `pnpm add '@mastra/libsql@1.13.0' -w` | modifies deps; no product/** write |
| 1 | `package.json` (root) — `scripts.test` glob | none (text edit) | adds `tools/learning-loop-mastra/__tests__/*.test.cjs` per BLOCKER #3 fix |
| 1 | `.gitignore` | none | adds storage entries |
| 1 | env var `MASTRA_STORAGE_DRIVER` | shell | sets in `~/.bashrc` or CI env; documented in Phase 1 |
| 2 | `tools/learning-loop-mastra/storage.js` | none | new factory file |
| 2 | `tools/learning-loop-mastra/__tests__/storage-factory-direct.test.js` | none | 5 invariant tests (4 factory + 1 `getParityDb()` per Q1.A lock) |
| 3 | `tools/learning-loop-mastra/workflows/workflow-storage-round-trip.js` | none | new createWorkflow wrapper |
| 3 | `tools/learning-loop-mastra/workflows/workflow-storage-read.js` | none | new createWorkflow wrapper |
| 3 | `tools/learning-loop-mastra/__tests__/storage-workflow-direct.test.js` | none | 5 direct unit tests for the 2 storage workflows (added to storage-parity.test.cjs as Tests 7-11 in Phase 5) |
| 4 | `tools/learning-loop-mastra/server.js` | none | adds `Mastra` instance + storage wiring |
| 4 | `tools/learning-loop-mastra/workflows-manifest.json` | none | grows 8 → 10 |
| 4 | `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` | none | bumps line 159: 39 → 41 |
| 5 | `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` | none | 11 tests (4 substrate + 2 MCP + 5 workflow-direct unit) |
| 6 | `plans/reports/productization-260612-1530-master-tracker.md` (D5/D6 flip) | `OPERATOR_MODE=1` | gated; closeout contract |
| 6 | `meta-state.jsonl` (`meta_state_log_change`) | `OPERATOR_MODE=1` | gated; closeout |

**No `gate_mark_preflight` calls required** — no `product/**` writes in Plan 2 (test files + plan files + meta-state registry + mastra package source + storage factory).

## Dependencies

**Blocked by:**
- `260617-1950-phase-c-plan-3-cut-over` (Phase C Plan 3 closed 2026-06-17; legacy server deleted; mastra canonical). Plan 2 builds on the same mastra server that Plan 1 wraps; the `LoopMCPServer` class registered in Plan 1's server.js is the surface Plan 2 extends.

**Blocks:**
- `phase-d-plan-3-agents` (Plan 3 — 3 `createAgent` wrappers + agent parity harness; depends on Plan 2's `getMastraStorage()` factory pattern + `storage.js` exports + the proven substrate round-trip).
- `phase-d-plan-4-cutover` (Plan 4 — final manifests + master-tracker flip + §3.10 reconciliation; depends on Plan 1's `workflows-manifest.json` shape + Plan 2's `workflows-manifest.json` 10-entry shape + both parity gates proven).

**Out of scope (separate tracks, NOT this plan):**
- Plan 3 (agents) — blocked on Plan 1 + Plan 2; ships after both PRs merge.
- Plan 4 (cutover) — blocked on Plans 1 + 2 + 3.
- Plan 1a — atomic fix for multi-step `stateSchema` restructuring if Plan 3 author time surfaces the need.
- Phase E cutover to Mastra Code Mode 1 — separate phase.
- Phase G skill migration — separate phase.

## Whole-Plan Consistency Sweep

- **Files reread during authoring:** `plan.md`, `phase-01` through `phase-06` (6 files).
- **Decision deltas from brainstorm + research reports:**
  - **File path correction (Q1.B in brainstorm):** deps go in **root** `package.json` (verified: `tools/learning-loop-mastra/` contains no `package.json`; all `.js`, `.json`, `.cjs` files; deps inherit from root via the workspace import map at root `package.json:6-10`). Brainstorm's Touchpoints row says `tools/learning-loop-mastra/package.json` — corrected.
  - **In-memory fallback wording (Q1.B above):** corrected to `url: ':memory:'` per Mastra docs.
  - **`Mastra` instance wiring pattern:** researcher A's §3.3 recommends Pattern A2a (build `LoopMCPServer` first; `new Mastra({ storage, mcpServers: { ... } })` wires storage via `Mastra` constructor's `__registerMastra(server)` call). **Locked in Phase 4.** `MCPServerConfig` does NOT accept a `mastra` field (verified at `node_modules/@mastra/core/dist/mcp/types.d.ts:220-285`), so the wiring must be Pattern A2a, not "pass `mastra` to `LoopMCPServer` constructor." This pattern is forward-compatible with Plan 3's `agents: { ... }` field.
  - **2 new storage workflows required:** researcher B's §4.2 documents that Plan 1's 8 workflows don't touch storage (thin `stateSchema = input`). The 2 new workflows are the minimum viable end-to-end proof for the integration test. **Locked in Phase 3 file list.**
  - **Tools/list count bump:** 39 → 41 (added 2 `run_workflow_storage_*`). Update `workflow-parity.test.cjs:159` in Phase 4 step 4. **Locked in count math above.**
  - **JSONL sidecar boundary:** Test 2's JSONL file is a per-test fixture (`records.jsonl` in temp dir), not a meta-state migration. **Documented in Phase 5 test file header.**
  - **`MASTRA_STORAGE_DRIVER` env var:** set in Phase 1; consumed in Phase 5 (Test 3 skips when `memory`). **Locked in Phase 1 step 3.**
- **Test count math:** Plan 2 adds 11 tests in `storage-parity.test.cjs` (4 substrate-direct + 2 MCP integration + 5 workflow-direct unit). Phase 2 ships **5 invariant tests** in `storage-factory-direct.test.js` (4 existing + 1 new for `getParityDb()` per Q1.A lock). Phase 3 writes the 2 workflow files plus the 5 direct unit tests via TDD-first; Phase 5 adds Tests 1-6 (substrate + MCP) and Tests 7-11 (workflow-direct unit, mirroring Tests 1-5 from Phase 3's draft, consolidated into the same file). The 5 Phase 3 tests do NOT live in a separate `storage-workflow-direct.test.js` file — they fold into `storage-parity.test.cjs` (matches Plan 1's `workflow-parity.test.cjs` which combines direct + MCP). Net: **11 tests in 1 file (storage-parity.test.cjs), 11 namespaces total.**
- **Reconciled stale references:**
  - Brainstorm §"Touchpoints Plan 2" lists `tools/learning-loop-mastra/package.json` — file does not exist; replaced with root `package.json`.
  - Brainstorm risk #2's `file::memory:?` — corrected to `:memory:`.
  - Researcher A §6.5 says "defer to plan-author" for wiring pattern — locked to Pattern A2a in this plan.
- **Unresolved contradictions:** 0. Q1.A (storage API surface) is documented as a Phase 2 verification step, not a blocker.

## Key Risks Addressed

- **Native binding fails on WSL2.** Risk: very low (researcher A verified on WSL2 x86_64). **Mitigation:** Phase 1 install probe; Phase 5 Test 3 skips on `MASTRA_STORAGE_DRIVER=memory`; fallback URL `':memory:'` always works.
- **SQLITE_CANTOPEN errno 14 when parent dir missing.** Risk: medium if `mkdirSync` forgotten. **Mitigation:** Phase 2 factory does `mkdirSync(DATA_DIR, { recursive: true })` before `new LibSQLStore(...)`; invariant test 4 verifies.
- **Wiring pattern (Mastra parent vs setStorage post-hoc) breaks MCPServer.** Risk: medium. **Mitigation:** Phase 4 documents Pattern A2a (build `LoopMCPServer` first; `new Mastra({ storage, mcpServers: { ... } })` wires storage via `Mastra` constructor's `__registerMastra(server)` call). `MCPServerConfig` does NOT accept a `mastra` field (verified at `node_modules/@mastra/core/dist/mcp/types.d.ts:220-285`), so passing `mastra` to the constructor would silently drop the reference and break storage wiring downstream. Pattern A2a is the only viable shape against `@mastra/core@1.42.0`. Test 4 (MCP integration) is the gate.
- **Storage API surface differs between `@mastra/libsql` versions.** Risk: low after version pin (`1.13.0`). **Mitigation:** Q1.A is LOCKED at planning time (2026-06-19) — Plan 2 uses `createClient` from `@libsql/client` directly for app-level records; the Mastra `LibSQLStore` abstraction is not used by the 2 storage workflows. No runtime API surface verification needed. Phase 5 Test 1 (substrate round-trip) is the load-bearing substrate test.
- **`tools/list` count drift.** Risk: low (Plan 1 added this guard). **Mitigation:** Phase 4 step 4 bumps `workflow-parity.test.cjs:159` assertion 39→41; Phase 5 Test 6 enumerates and asserts the 2 new `run_workflow_storage_*` tools.
- **Meta-state confusion.** Risk: low after locked boundary. **Mitigation:** Phase 5 test file header comment explicitly states "JSONL sidecar is a per-test fixture, not a meta-state migration." Plan 1's `LoopMCPServer` is unchanged (no `storage` field on MCPServer; reads via `mastra.getStorage()`).
- **Cold-session test breaks.** Risk: low. The cold-session test (`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:67-77`) reads the LEGACY `tools/learning-loop-mcp/tools/manifest.json` (the 31-entry manifest), NOT the mastra server's `tools/list`. Plan 1's red team BLOCKER #2 closed the legacy-manifest gap by updating the legacy manifest to 31 entries. Plan 2 does NOT change the cold-session test (its scope is unchanged: verify the legacy 31-entry manifest's tool registration shape). The mastra server's 41-tool enumeration is checked separately by `workflow-parity.test.cjs:159` (bumped from 39 → 41 in Phase 4 step 5). **Out of scope:** updating the cold-session test to also enumerate the mastra server's 41 tools — Plan 1 review deferred item; Plan 4 owns.
- **Two-server race in Phase 5 Test 4.** Risk: low. **Mitigation:** Phase 5 shares one server spawn across Tests 4 + 6 via top-level `before`; cross-restart assertion uses `cleanup()` + fresh `connectMcpServer` to the same `tempRoot`.

## References

- `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (4-plan stack; Plan 2 row; Plan 2 Scope Clarification; Process patterns)
- `plans/reports/researcher-A-260619-2246-mastra-libsql-install-api-report.md` (install + API surface; constructor; URL semantics; wiring pattern recommendation)
- `plans/reports/general-purpose-260619-2251-storage-parity-harness-design-report.md` (11-test harness per BLOCKER #2; helpers; 2-workflow integration seam; `:memory:` correction)
- `plans/reports/mastra-storage-memory-design-260619-1907-meta-state-ledger-report.md` (3-layer model)
- `plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md` (locked boundary: meta-state stays JSONL)
- `plans/reports/productization-260612-1530-master-tracker.md` §Phase D (D5, D6 checkboxes)
- `plans/260618-1911-phase-d-plan-1-workflows/plan.md` (6-phase rhythm; Q1 conflict resolution shape)
- `plans/260618-1911-phase-d-plan-1-workflows/phase-02-create-loop-workflow-factory.md` (factory shape to mirror)
- `plans/260618-1911-phase-d-plan-1-workflows/phase-03-8-createworkflow-wrappers.md` (TDD-per-workflow pattern)
- `plans/260618-1911-phase-d-plan-1-workflows/phase-04-server-js-wiring-manifests.md` (wiring + manifest updates)
- `plans/260618-1911-phase-d-plan-1-workflows/phase-05-workflow-parity-harness.md` (parity harness shape; shared `before`)
- `plans/260618-1911-phase-d-plan-1-workflows/phase-06-acceptance-gate-closeout.md` (closeout pattern)
- `plans/260616-2200-phase-c-plan-2-parity/plan.md` (withBothMcpServers mutex; per-plan meta_state_log_change)
- `tools/learning-loop-mastra/server.js` (registration point; extends with `Mastra` instance)
- `tools/learning-loop-mastra/create-loop-workflow.js` (factory pattern reused by 2 storage workflows)
- `tools/learning-loop-mastra/workflows/workflow-classify-prompt.js` (workflow structure the 2 storage wrappers mirror)
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js:55-109` (connectMcpServer reused unchanged)
- `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:159` (bump assertion 39→41)
- `package.json` (root — add `@mastra/libsql@1.13.0` exact pin)
- `.gitignore` (add storage entries)
- `node_modules/@mastra/libsql/dist/storage/index.d.ts` (verification target for Q1.A API surface)
- `node_modules/@mastra/core/dist/mcp/types.d.ts:220-285` (`MCPServerConfig` interface — confirmed no `mastra` field; Pattern A2a is the only viable shape)
- `node_modules/@mastra/core/dist/mcp/index.d.ts:81` (`__registerMastra(mastra: Mastra)` on `MCPServerBase`; called by `Mastra` constructor via `mcpServers` config)
- `node_modules/@mastra/core/dist/mastra/index.d.ts:78-90` (`Mastra` constructor example with `storage: new LibSQLStore(...)`; field at line 83: `storage?: MastraCompositeStore`)
- `node_modules/@mastra/core/dist/mastra/index.d.ts:1661-1680` (`mcpServers` config example on `Mastra` — Pattern A2a wires MCP server via this config; constructor calls `__registerMastra` for each entry)
- `https://mastra.ai/reference/storage/libsql` (constructor + URL formats — fetched 2026-06-19)
- `@mastra/libsql@1.13.0` + `@mastra/core@1.42.0` + `@mastra/mcp@1.10.0` (pinned compatibility)

## Validation Log

### Session 1 — 2026-06-19 (plan authoring)

**Trigger:** plan author invocation after researcher A + researcher B reports completed. Plan 2 is the storage-substrate slice of the 4-plan Phase D stack; author consolidates findings into 6 self-contained phase files.

**Verification tier:** Medium (1 role, 8 high-value claims sampled)

#### Verification Results

- **Claims checked:** 8
- **Verified:** 7
- **Failed:** 0
- **Unverified (deferred to implementation):** 1

**Unverified (deferred to implementation):**

1. **Q1.A — `storage.set/get` vs `storage.stores.<table>.save/get` exact API.** Researcher B §"Open Questions" Q1 defers verification to author time. Resolution: Phase 2 step 1 (TDD invariant test) reads `node_modules/@mastra/libsql/dist/*.d.ts` before writing the 4 invariant tests; the 5 direct unit tests in Phase 3 cover both API shapes via integration; Phase 5 Test 1 is the load-bearing substrate round-trip gate.

#### Questions Asked

None. All open questions in researcher A §"Open Questions" and researcher B §"Open Questions" resolved in this plan (Q1.A → Phase 2 verification step; Q1.B → documented correction; Q2-Q5 → locked decisions in the Whole-Plan Consistency Sweep section).

#### Confirmed Decisions

- **Mastra wiring pattern:** Pattern A2a (build `LoopMCPServer` first; `new Mastra({ storage, mcpServers: { 'learning-loop-mastra': server } })` wires storage via `Mastra` constructor's `__registerMastra(server)` call). Phase 4 documents the exact diff and the verification commands (against `node_modules/@mastra/core/dist/mcp/types.d.ts:220-285` and `index.d.ts:81`).
- **Tools/list count:** bump 39→41 in `workflow-parity.test.cjs:159`. Phase 4 step 4 owns the bump.
- **JSONL sidecar boundary:** per-test fixture only; test file header comment documents.
- **`MASTRA_STORAGE_DRIVER` env var:** Phase 1 sets it; Phase 5 Test 3 reads it.

#### Action Items

None. All Plan 2 phases are self-contained for a junior dev to execute.

#### Impact on Phases

No phase changes after the consistency sweep. Plan is internally consistent across all 7 files.

### Whole-Plan Consistency Sweep

- **Files reread:** `plan.md`, `phase-01-1-install-probe.md`, `phase-02-2-storage-factory.md`, `phase-03-3-storage-workflows.md`, `phase-04-4-server-wiring-manifest.md`, `phase-05-5-storage-parity-harness.md`, `phase-06-6-acceptance-gate-closeout.md`.
- **Decision deltas checked:** 5 (file path correction; in-memory fallback; Mastra wiring pattern; 2 new workflows; tools/list count bump). All documented in the Whole-Plan Consistency Sweep section above.
- **Reconciled stale references:** brainstorm's `tools/learning-loop-mastra/package.json` (does not exist); brainstorm's `file::memory:?` (corrected to `:memory:`); researcher A's "defer to plan-author" (locked to Pattern A2a).
- **Unresolved contradictions:** 0.

### Session 2 — 2026-06-19 (validate subcommand, post-red-team + post-Q1.A lock)

**Trigger:** validate subcommand invocation after red team found 4 BLOCKERs (all applied) + 16 MINORs (4 applied including MINOR #4 + #9; 12 deferred to Plan 1a, including the schema-fingerprint test as item 1.5). Operator answered 4 critical questions via AskUserQuestion.

**Verification tier:** Full (1 role, 8 high-value claims sampled)

#### Verification Results

- **Claims checked:** 8
- **Verified:** 7
- **Failed:** 0
- **Unverified (deferred to implementation):** 1

**Unverified (deferred to implementation):**

1. **`@libsql/client` exact version availability** when the operator runs `pnpm add '@libsql/client@0.17.4'`. Researcher A verified the version is pulled transitively by `@mastra/libsql@1.13.0`, but the operator may want to pin a different version. The Phase 1 step 2 install probe confirms the version that actually resolves.

#### Questions Asked

(See `AskUserQuestion` transcript below.)

#### Questions & Answers

1. **[API surface] Q1.A — lock at planning time or defer to author time?** Decision: **Lock at planning time.** The Mastra storage is domain-specific (`getStore('<domain>')`); no generic CRUD. Plan 2 uses `createClient` from `@libsql/client` (direct libsql client) for the 2 storage workflows. `storage.js` exports both `getMastraStorage()` (for future Mastra runtime domains) AND `getParityDb()`/`getParityDDL()` (used by the 2 storage workflows and the substrate-direct tests). Both point to the same `mastra-memory.db` file but use disjoint tables. Applied to plan.md, phase-01, phase-02, phase-03, phase-05.

2. **[Scope] BLOCKER #3 — Plan 2 owns the .cjs glob update or defer to Plan 1a?** Decision: **Plan 2 owns the glob update.** Closes a Plan 1 gap (workflow-parity.test.cjs was never run by `pnpm test`). Baseline: 1083 → 1098 (+15 existing .cjs tests); +11 from storage-parity = 1109.

3. **[Scope] Cold-session test update** — Plan 2 do it or Plan 4? Decision: **Defer to Plan 4.** Plan 2 keeps the cold-session test's scope unchanged (verifies the legacy 31-entry manifest). The mastra server's 41-tool enumeration is checked separately by `workflow-parity.test.cjs:159` (bumped assertion). Plan 4 owns the cold-session update when it lands.

4. **[Scope] Schema fingerprint test for `@mastra/libsql` schema drift** — Ship in Plan 2 or defer? Decision: **Add to Plan 1a** (per the existing `loop-design-phase-d-plan-1a-parity-tightening` design). Plan 2 ships 11 tests in `storage-parity.test.cjs`; the schema fingerprint is a 12th test, deferred to Plan 1a item 1.5 (added to the brainstorm's Plan 1a candidates table).

#### Confirmed Decisions

- **Q1.A storage API surface:** locked as `createClient` from `@libsql/client` for the 2 storage workflows; `getMastraStorage()` retained for future Mastra runtime use. Both point to the same `mastra-memory.db` file but use disjoint tables.
- **BLOCKER #3 glob update:** Plan 2 owns it. Phase 1 step 8 adds `'tools/learning-loop-mastra/__tests__/*.test.cjs'` to the `pnpm test` glob.
- **Cold-session scope:** unchanged in Plan 2. Plan 4 owns the mastra server enumeration update.
- **Schema fingerprint:** added to Plan 1a item 1.5 in the brainstorm. Plan 2 ships 11 tests; the 12th is deferred.

#### Action Items

- [x] **Q1.A lock:** update plan.md, phase-01, phase-02, phase-03, phase-05 with the locked API surface (`getParityDb` + `getParityDDL` factory exports; 5th invariant test for `getParityDb`; Phase 3 workflow code uses `getParityDb().execute(...)`). DONE in validation session.
- [x] **Schema fingerprint to Plan 1a:** add row 1.5 to the brainstorm's Plan 1a candidates table. DONE in validation session.
- [x] **`@libsql/client` dep:** add to Phase 1 step 2 (`pnpm add` command). DONE in validation session.
- [x] **Plan 1a `loop-design-phase-d-plan-1a-parity-tightening` design entry:** operator's call at Plan 1a author time.

#### Impact on Phases

- **Phase 1:** `@libsql/client@0.17.4` added as a direct dep (Q1.A lock); smoke test extended to verify both `LibSQLStore` and `createClient` resolve; pnpm test glob update step moved from BLOCKER #3 fix to Phase 1 step 8 (unchanged from previous fix).
- **Phase 2:** factory exports `getParityDb()` + `getParityDDL()` (Q1.A lock); 5 invariant tests (was 4); Q1.A verification step removed.
- **Phase 3:** 2 storage workflows use `getParityDb().execute(...)` with `INSERT OR REPLACE INTO parity_records` / `SELECT ... FROM parity_records` (Q1.A lock). The 5 direct unit tests use the same factory exports.
- **Phase 5:** 4 substrate-direct tests use `getParityDb()` + `getParityDDL()`; the 2 MCP integration tests use the 2 storage workflows (unchanged); the 5 workflow-direct unit tests from Phase 3 are added as Tests 7-11.
- **Phase 6:** no changes beyond the count math already applied in the BLOCKER fix session.
- **Plan 1a (separate plan, not in this directory):** 1.5 added to the candidates table.

### Whole-Plan Consistency Sweep

- **Files reread:** `plan.md`, `phase-01-1-install-probe.md`, `phase-02-2-storage-factory.md`, `phase-03-3-storage-workflows.md`, `phase-04-4-server-wiring-manifest.md`, `phase-05-5-storage-parity-harness.md`, `phase-06-6-acceptance-gate-closeout.md`, `brainstorm-260618-1538-phase-d-plan-split-report.md`.
- **Decision deltas checked:** 4 (Q1.A lock; BLOCKER #3 glob; cold-session scope; schema fingerprint Plan 1a). All applied.
- **Reconciled stale references:** phase-02's "Q1.A verification step" removed (now locked); phase-01's `pnpm add` command now includes both `@mastra/libsql@1.13.0` and `@libsql/client@0.17.4`; phase-03's workflow code uses `getParityDb`; phase-05's tests use `getParityDb` + `getParityDDL`; brainstorm's Plan 1a table has 5 rows (was 4).
- **Unresolved contradictions:** 0.
