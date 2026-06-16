---
title: "Phase C Plan 2 — Parity Gate (C4)"
description: "Build a dual-server parity harness that calls both learning-loop-mcp and learning-loop-mastra with identical inputs and asserts byte-identical output (inputSchema via z.toJSONSchema() + tools/call content via JSON.parse). Ship per-field type-name parity (F7), use z.toJSONSchema() (F11), parallel cold-session test for the mastra manifest (F9), and an automated tools/list collision test (M-C5). M-C1 schemas.js header is the first commit. Replaces the shape-only parity-schema-shape.test.js with the full structural comparison. Plan 1 is unblocked (the legacy server keeps running during coexistence); Plan 3 (C6+C7 cut-over) is blocked on this plan passing."
status: completed
priority: P1
branch: "260616-2200-phase-c-plan-2-parity"
tags: [meta-surface, phase-c, mastra, mcp, parity, tdd, atomic-gate]
blockedBy: ["260616-1605-phase-c-plan-1-atomic-mastra-adoption"]
blocks: ["phase-c-plan-3-cut-over"]
created: "2026-06-16T15:26:55.605Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md (3-plan stack decision; C4 assigned to Plan 2; D-1 to D-7 deferred items this plan addresses)
  - plans/reports/productization-260612-1530-master-tracker.md#Phase C (canonical Phase C state; C1/C2/C3/C5 [x]; C4 [ ])
  - plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md (Plan 1; provides the peer server + createLoopTool factory + 55 namespace-10 tests + 29 mastra_* tools + .mcp.json + .factory/mcp.json peer config)
  - plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/reports/from-code-reviewer-to-planner-phase-c-plan-1-post-implementation-review.md (5 medium deferred items: M-C1 schemas.js header; M-C3 per-field typeName; M-C5 collision test)
  - plans/reports/research-260616-1605-mastra-createtool-and-mcpserver-api.md (Mastra API surface; createTool inputSchema + startStdio)
  - plans/reports/research-260616-1605-wire-format-coercion-and-test-porting.md (factory spec; 6 wire-format cases; 4 ported tests; MAX_RECURSION_DEPTH=2)
  - tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema (lines 77-137; legacy source of truth; Plan 1 factory reproduces this)
  - tools/learning-loop-mcp/tool-registry.js#installWireFormatCoercion (lines 197-237; legacy wire-format patch — replaced by z.preprocess in factory)
  - tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs (cold-session E2E pattern Plan 2 mirrors for the mastra server)
  - tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js#withMcpServer (stdio spawn helper Plan 2 extends to dual-server)
  - tools/learning-loop-mastra/__tests__/parity-schema-shape.test.js (Plan 1's shape-only contract test; Plan 2 replaces with full z.toJSONSchema() comparison)
  - tools/learning-loop-mastra/create-loop-tool.js (the factory whose inputSchema wrapping is the parity-harness's main comparison target)
  - tools/learning-loop-mastra/schemas.js (M-C1 patched in this plan's first commit)
  - tools/learning-loop-mastra/tools/manifest.json (29 entries; C2 register loop input)
  - tools/learning-loop-mcp/tools/manifest.json (40 entries; 11 workflow_* excluded from parity)
  - tools/learning-loop-mcp/agent-manifest.json (25 tools, missing 4 per M-C4; parity compares what's registered, not what manifest.json claims)
  - .mcp.json + .factory/mcp.json (C3 peer config; the harness validates 40 + 29 = 69 distinct tool names)
  - zod `4.4.3` (exact pin, no caret) — `z.toJSONSchema()` is version-sensitive; CI drift check is D-16 follow-up
  - meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ (F4 finding; 24h TTL; Plan 3 owner; parity gate does not need to resolve it)
---

# Phase C Plan 2 — Parity Gate (C4)

## Overview

**This is Plan 2 of the 3-plan Phase C stack** (decided 2026-06-16, see `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md`). Plan 1 (C1+C2+C3+C5) shipped 2026-06-16 — peer server with `createLoopTool` factory, 29 `mastra_*` tools, `.mcp.json` + `.factory/mcp.json` peer config, 55 namespace-10 tests pass. Plan 2 absorbs **C4** — the byte-identical parity harness — plus 6 deferred items the Plan 1 post-impl review cataloged (D-1 to D-7). Plan 3 (C6+C7 cut-over) is blocked on this plan passing.

**Why C4 must be its own plan:** the parity gate is the only reviewable moment that proves the migration is safe. If both servers pass byte-identical parity on the 29 deterministic tools, Plan 3's cut-over is operationally simple. If parity fails, Plan 1 (peer with factory) is still shippable as a coexistence artifact — the legacy server keeps running. This is the whole point of "coexistence first, cut over second."

**Scope (8 phases, 1 branch, ~5-7h):**

1. **Phase 1 — Patch M-C1.** 1-line commit: add "Plan 3 cut-over note" to `tools/learning-loop-mastra/schemas.js` header (the missed F8 action item from Plan 1). Frees Plan 3 to cut over without a rebase.
2. **Phase 2 — Parity harness module.** Ship `tools/learning-loop-mastra/__tests__/parity-harness.js` with two helpers: `toolsListParity` (compare legacy vs mastra `tools/list` after JSON-Schema normalization) and `toolsCallParity` (compare `content[0].text` JSON for the migrated subset).
3. **Phase 3 — Dual-server spawn loop.** Extend the `withMcpServer` pattern from `wire-format-top-level-coercion.test.js` to spawn BOTH `learning-loop-mcp` and `learning-loop-mastra` in the same test process; share a temp `GATE_ROOT` so both servers read/write the same registry.
4. **Phase 4 — Output comparison with `z.toJSONSchema()`.** Per F7 + F11: replace `parity-schema-shape.test.js` (shape-key-only) with `parity-zod-to-json-schema.test.js` that runs `z.toJSONSchema(legacySchema, { target: "draft-7" })` and `z.toJSONSchema(mastraSchema, { target: "draft-7", io: "input" })`, asserts `deepEqual`. The `io: "input"` is required because `z.preprocess` wrappers (the factory's output) are input-only — output type is the inner schema. `target: "draft-7"` matches the legacy `McpServer` JSON Schema output (verified at `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs:78-79`).
5. **Phase 5 — Parallel cold-session test for mastra manifest.** F9 deferred: spawn the mastra server, call `tools/list`, assert 29 tool names match `tools/learning-loop-mastra/tools/manifest.json`. Mirrors `mcp-protocol-e2e.test.cjs` for the legacy server. New test: `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` (parallel structure to the legacy E2E).
6. **Phase 6 — `tools/list` collision test.** M-C5 deferred: spawn both servers via MCP `Client` in the same test, assert the union has 40 + 29 = 69 distinct tool names (40 legacy + 29 mastra, with the `mastra_` prefix). Replaces the manual smoke test from Plan 1's closeout.
7. **Phase 7 — Acceptance gate.** All 9 test namespaces pass for the legacy server (durable anchor) AND all 9 pass for the mastra server (Plan 2's new requirement). 55 namespace-10 tests already pass. New parity test suite (Phases 2-6) passes. C4 flips to `[x]`.
8. **Phase 8 — Closeout.** Master tracker flip, `meta_state_log_change`, journal entry, PR body with parity matrix.

**Acceptance gate (the single sentence, durable anchor):** *"All 9 test namespaces pass against `learning-loop-mcp` (durable anchor) AND byte-identical `inputSchema` for all 29 deterministic tools via `z.toJSONSchema()` (F7 + F11 resolved) + byte-identical `tools/call` content for the 4-tool read-only subset (`meta_state_list`, `loop_describe`, `runtime_state_read`, `check_runtime_agnostic`) via `JSON.parse(content[0].text)` deepEqual + 29 tools enumerated by the parallel mastra cold-session E2E matching `tools/learning-loop-mastra/tools/manifest.json` + the dual-server `tools/list` returns 40 + 29 = 69 distinct names with no collisions."* — **Note:** 25/29 tools are schema-only parity; only 4 are full content parity. `gate_check` is excluded from content parity because it records a ledger event in `runtime-state.jsonl` and is therefore not read-only. Write-side tools are excluded from content parity to avoid registry mutation races. The 25/29 split is honest about what the gate proves.

**Out of scope (deferred to Plan 3 / C6+C7):** cut-over to the mastra server (C6), `agent-manifest.json` group-name rename (C7), F4 gate-bypass resolution (D-10), M-C2 fail-fast on manifest errors (D-17), M-C4 reconcile 4 missing tools in `agent-manifest.json` (D-11), Phase D workflow tools, Phase G skill migration.

**Why this is hard (and the risk surface):** byte-identical parity between two MCP implementations is the kind of claim that breaks in surprising ways — the legacy server may serialize JSON with whitespace the mastra server strips; the mastra server may add `description` fields the legacy omits; `z.toJSONSchema()` for the factory's `z.preprocess`-wrapped input may not match the legacy unwrapped Zod v3 schema. **Mitigation: 5 invariant tests in Phase 4 first (TDD-style), then expand.** Phase 2's `toolsListParity` is the canary.

## Phases

| Phase | Name | Status | Effort | TDD Color | Dependencies |
|-------|------|--------|--------|-----------|--------------|
| 1 | [Phase 1 — Patch M-C1 (schemas.js header)](./phase-01-patch-m-c1.md) | Pending | ~5min | n/a (1-line doc patch) | Plan 1 (shipped 2026-06-16) |
| 2 | [Phase 2 — Parity harness module](./phase-02-parity-harness.md) | Pending | ~1h | RED → GREEN (5 invariant tests first) | Phase 1 |
| 3 | [Phase 3 — Dual-server spawn loop](./phase-03-spawn-loop.md) | Pending | ~1h | Extend `withMcpServer`; share GATE_ROOT | Phase 2 |
| 4 | [Phase 4 — Output comparison (z.toJSONSchema + content JSON)](./phase-04-output-comparison.md) | Pending | ~1-2h | Replace parity-schema-shape.test.js | Phase 3 |
| 5 | [Phase 5 — Parallel cold-session test (F9)](./phase-05-cold-session.md) | Pending | ~1h | Mirror legacy mcp-protocol-e2e.test.cjs | Phase 2 + Phase 3 |
| 6 | [Phase 6 — tools/list collision test (M-C5)](./phase-06-collision-test.md) | Pending | ~1h | Dual-spawn + set comparison | Phase 3 |
| 7 | [Phase 7 — Acceptance gate (all 9 namespaces for both servers)](./phase-07-acceptance-gate.md) | Pending | ~30min | Full `pnpm test` + namespace verification | Phases 2-6 + green CI |
| 8 | [Phase 8 — Closeout (tracker + meta-state + PR body)](./phase-08-closeout.md) | Pending | ~15min | n/a (metadata + journal) | Phase 7 |

**Total effort:** ~5-7 hours. One session. Single PR (8 commits, one per phase, stacked on a feature branch off `main`).

## Pre-flight Checklist (per R-15 acceptance)

Gated paths and required environment per phase:

| Phase | Gated Path | Tool / Env | Notes |
|-------|-----------|------------|-------|
| 1 | `tools/learning-loop-mastra/schemas.js` | none (no `product/**` write) | doc-only patch; no preflight required |
| 2 | `tools/learning-loop-mastra/__tests__/parity-harness.js` + `.test.js` | none (test files; not `product/**`) | TDD red-first; gate does not fire |
| 3 | `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js` + `.test.js` | none | test files |
| 4 | `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` | none | replaces `parity-schema-shape.test.js` (delete OK without preflight) |
| 5 | `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` | none | parallel to legacy E2E |
| 6 | `tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs` | none | uses Phase 3's helper |
| 7 | `package.json#scripts.test` (verify-only; no change) | none | just runs `pnpm test` |
| 8 | `plans/reports/productization-260612-1530-master-tracker.md` (tracker flip) | `OPERATOR_MODE=1` | gated; flip is the closeout contract |
| 8 | `meta-state.jsonl` (6 `meta_state_log_change` calls) | `OPERATOR_MODE=1` | gated; closeout |
| 8 | `meta-state.jsonl` (1 `meta_state_ack` for F4 per R-06) | `OPERATOR_MODE=1` | gated; closeout |

**No `gate_mark_preflight` calls required** — no `product/**` writes in Plan 2 (test files + plan files + meta-state registry). The `OPERATOR_MODE=1` env var is required for Phase 8's registry calls.

## Dependencies

**Blocked by:**
- `260616-1605-phase-c-plan-1-atomic-mastra-adoption` (Plan 1 shipped 2026-06-16; provides the peer server, factory, 29 `mastra_*` tools, 55 namespace-10 tests, and the `mastra_` prefix convention Plan 2 builds on)

**Blocks:**
- `phase-c-plan-3-cut-over` (Plan 3 / C6 + C7 — operational flip; cannot start until Plan 2 passes parity. The 4 Plan 3 deferred items D-8 to D-11 + D-13 ride on this plan's success.)

**Out of scope (separate tracks, NOT this plan):**
- **D-10 / F4 gate-bypass** — Plan 3 owns; this plan does NOT touch it
- **D-11 / M-C4 reconcile 4 missing tools in `agent-manifest.json`** — Plan 3 / C7
- **D-12 / Runtime gate re-implementation in Mastra** — Plan 3 (Mode 1 → Mode 2 decision)
- **D-16 / D-17** — CI drift check, fail-fast on manifest; future hardening
- **D-18 / D-19** — Phase G skill migration, LIM hardening
- **Phase D workflow + agent + storage** — separate phase
- **Phase E cut-over + embed in Mastra Code** — Plan 3
- **Phase F Bridge 7** — post-meta-surface

## Whole-Plan Consistency Sweep

- **Files reread during authoring:** `plan.md`, `phase-01` through `phase-08` (8 files).
- **Decision deltas from brainstorm + post-impl review:**
  - M-C1 (schemas.js header) lifted to **Phase 1** (smallest first commit; matches the operator's "1-line patch in Plan 2's first commit" disposition).
  - F7 (per-field `_def.typeName`) + F11 (`z.toJSONSchema()`) merged into **Phase 4** (one structural test, not two).
  - F9 (parallel cold-session test) → **Phase 5**.
  - M-C5 (collision test) → **Phase 6**.
  - **NEW:** dual-server spawn loop (Phase 3) is the load-bearing primitive Phases 4-6 all depend on. Without it, the harness can't talk to both servers in one process.
- **Test count math (per R-02 + R-07 acceptance + validation):** Plan 1's namespace 10 baseline is 55 tests = 5 (wire-format-coercion-fix) + 6 (wire-format-top-level-coercion) + 5 (wire-format-meta-state-optional-fields) + 4 (wire-format-patch-recursion) + 29 (parity-schema-shape) + 6 (mcp-config-peer). Phase 4 **deletes** the 29-test `parity-schema-shape.test.js` (per validation) and adds `parity-zod-to-json-schema.test.js` with **29 schema tests + 4 read-only `tools/call` tests + 3 invariant probes = 36 tests** (one `test()` block per tool; multiple `assert` calls inside). Net namespace 10 = 55 - 29 + 36 = **62 tests**, NOT 117 as the prior draft claimed. Phase 5 adds 5 cold-session tests. Phase 6 adds 3 collision tests. Total mastra-specific = 62 + 5 + 3 = **70 tests**. The "126" anchor in the prior draft is wrong; the correct count is **70 mastra-specific + 9 legacy namespaces = 79 distinct test scopes** (the 9-namespace anchor is durable; per-test counts drift).
- **Reconciled stale references:**
  - "5/6 wire-format cases fail against raw `createTool`" — this is the C5 probe verdict, NOT a parity issue. Plan 1's factory fixes it. Plan 2 verifies the fix holds against the legacy server, end-to-end.
  - "MCP client-side namespacing" (D-7) — re-evaluated in Plan 3, not this plan. The `mastra_` prefix stays; the dual-server collision test in Phase 6 confirms it.
  - Tool count: 40 legacy + 29 mastra = 69 distinct. `tools/learning-loop-mcp/tools/manifest.json` has 40 (29 deterministic + 11 workflow). `tools/learning-loop-mastra/tools/manifest.json` has 29 deterministic only. `tools/learning-loop-mcp/agent-manifest.json` is a grouped manifest (5 tool groups: gate=5, workflow=11, meta_state=16, introspection=3, runtime_agnostic=1; 4 missing per M-C4 deferred to C7). The collision test compares what's REGISTERED (the live `tools/list` response), not what the manifest files claim.
- **Unresolved contradictions:** 0. All D-1 to D-7 deferred items are assigned to a specific phase. M-C2 (fail-fast on manifest) is NOT in scope; deferred to future hardening per D-17.

## Key Risks Addressed

- **`z.toJSONSchema()` on `z.preprocess`-wrapped input may produce a different shape than the legacy unwrapped schema.** Risk: the factory's `wrapSchema` (line 128-137 of `create-loop-tool.js`) reconstructs `z.object(shape)` for plain shape objects; this MAY or MAY NOT match the legacy's direct `ZodObject`. Mitigation: 5 invariant tests in Phase 2 RED first; the first failure surfaces the shape delta in CI. If shapes diverge, the `z.toJSONSchema()` comparison is the canary — adjust the comparison (e.g., normalize field order, drop `additionalProperties: false` from the mastra output) BEFORE the gate closes.
- **`McpServer`'s JSON Schema output uses Draft 7 (per `mcp-protocol-e2e.test.cjs:78-79`); `z.toJSONSchema()` defaults to Draft 2020-12.** Risk: comparing Draft 7 vs Draft 2020-12 JSON Schema may surface `additionalProperties`, `$schema`, or `format` deltas that look like parity failures but are spec drift. Mitigation: Phase 4 explicitly sets `target: "draft-7"` on both sides.
- **Dual-server spawn with shared `GATE_ROOT`.** Risk: both servers writing to the same `meta-state.jsonl` simultaneously produces interleaved JSON that breaks `readRegistry`. Mitigation: the spawn loop uses independent `GATE_ROOT` per test (mkdtempSync per test invocation), but a single shared root for cross-server tool calls; sequentialize the writes.
- **M-C5 collision test depends on MCP `Client` correctly enumerating both servers.** Risk: the test runner only sees one server's `tools/list` if the client is misconfigured. Mitigation: spawn each server in a separate `withMcpServer` block, capture both `tools/list` results, then `assert.equal(new Set([...legacy, ...mastra]).size, 69)`. No client-side namespacing assumption.
- **F4 finding TTL expires 2026-06-17 14:23:34Z.** If Plan 2 is not green by then, the finding enters `stale` status. **Mitigation (default per R-06 disposition):** Plan 2's closeout (Phase 8) calls `meta_state_ack({ id: "meta-260616T2123Z-...-peer-mcp-server-registers-29-determ", reason: "Acknowledged as part of Plan 2 closeout; resolution path is Plan 3 (D-10) cut-over." })` to extend the active lifetime. Resolution remains Plan 3's responsibility (D-10). **Alternative:** `meta_state_supersede` to consolidate into the Plan 2 change-log; operator's call.

## References

- `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` § Deferred Tasks (D-1 to D-7)
- `plans/reports/productization-260612-1530-master-tracker.md` § Phase C (C4 [ ] entry)
- `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md` (the parent plan this extends)
- `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/reports/from-code-reviewer-to-planner-phase-c-plan-1-post-implementation-review.md` § M-C1, M-C3, M-C5
- `tools/learning-loop-mcp/tool-registry.js` (lines 4, 6-22, 24-46, 58-75, 77-137, 197-237)
- `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs` (cold-session E2E pattern)
- `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js#withMcpServer` (stdio spawn helper)
- `tools/learning-loop-mastra/__tests__/parity-schema-shape.test.js` (Plan 1's shape-only test; replaced by Phase 4)
- `tools/learning-loop-mastra/create-loop-tool.js` (the factory whose `z.preprocess` wrapping is the structural comparison target)
- `tools/learning-loop-mastra/schemas.js` (M-C1 patched in Phase 1)
- `tools/learning-loop-mastra/tools/manifest.json` (29 entries; Phase 5 cold-session enumerates this)
- `tools/learning-loop-mcp/agent-manifest.json` (5 tool groups: gate=5, workflow=11, meta_state=16, introspection=3, runtime_agnostic=1; total = 36 entries; missing 4 per M-C4: `meta_state_propose_design`, `meta_state_relationships`, `meta_state_re_verify`, `meta_state_supersede`; flat tool list is `tools/manifest.json` = 40 entries = 29 deterministic + 11 workflow)
- `zod` `4.4.3` exact pin `z.toJSONSchema()` (built-in; signature verified 2026-06-16; F11 acceptance)
- `meta-260616T2123Z-the-learning-loop-mastra-peer-mcp-server-registers-29-determ` (F4 finding; Plan 3 owner; Plan 2 does not resolve)
