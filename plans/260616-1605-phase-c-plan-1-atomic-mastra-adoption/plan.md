---
title: "Phase C Plan 1 — Atomic Mastra Adoption (C1+C2+C3+C5)"
description: "Add @mastra/core + @mastra/mcp as a peer MCP server (tools/learning-loop-mastra/) that registers the 29 deterministic meta-surface tools via createLoopTool(). Ship the createLoopTool factory (z.preprocess + unwrapItem + MAX_RECURSION_DEPTH=2) that reproduces legacy coerceParamsToSchema behavior, port the 4 wire-format regression tests, and add a stdio peer entry in both .mcp.json files. Plan 1 mirrors Phase B's atomic-unit pattern: ship the smallest useful unit (peer server with working factory), defer byte-identical parity (Plan 2 / C4) and cut-over (Plan 3 / C6+C7) to separate PRs."
status: pending
priority: P1
branch: "260616-1605-phase-c-plan-1-atomic-mastra-adoption"
tags: [meta-surface, phase-c, mastra, mcp, codegen-adjacent, tdd, parity-adjacent, atomic-adoption]
blockedBy: ["260614-1259-phase-b-codegen-adoption"]
blocks: ["phase-c-plan-2-parity", "phase-c-plan-3-cut-over"]
created: "2026-06-16T09:23:32.593Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md (3-plan stack decision; C1+C2+C3+C5 assigned to Plan 1)
  - plans/reports/productization-260612-1530-master-tracker.md#Phase C (canonical Phase C state; 2026-06-16 namespace anchor + 1/6 C5 probe verdict)
  - plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md (Mastra contract; §2.1 createTool, §2.4 MCPServer, §3.7-§3.10 phase mapping, §8 Q3 wire-format coercion resolution)
  - plans/reports/research-260616-1605-mastra-createtool-and-mcpserver-api.md (per-package migration spec; 29-tool subset, mastra_ prefix, 10th test namespace)
  - plans/reports/research-260616-1605-wire-format-coercion-and-test-porting.md (factory spec; 6 wire-format cases; 4-test porting plan; MAX_RECURSION_DEPTH=2)
  - plans/260614-1259-phase-b-codegen-adoption/ (Phase B 3-plan pattern this plan mirrors)
  - tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema (lines 77-137; source of truth the C5 factory reproduces)
  - tools/learning-loop-mcp/tool-registry.js#installWireFormatCoercion (lines 197-237; legacy wire-format patch)
  - tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js (C5 port target 1/4)
  - tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js (C5 port target 2/4)
  - tools/learning-loop-mcp/__tests__/wire-format-meta-state-optional-fields.test.js (C5 port target 3/4)
  - tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js (C5 port target 4/4 — the leaf-recursion case)
  - tools/learning-loop-mcp/agent-manifest.json (29-tool C2 source list)
  - tools/learning-loop-mcp/tools/manifest.json (29 file→export entries for the C2 register loop)
  - .mcp.json + .factory/mcp.json (C3 stdio peer config targets)
---

# Phase C Plan 1 — Atomic Mastra Adoption (C1+C2+C3+C5)

## Overview

**This is Plan 1 of the 3-plan Phase C stack** (decided 2026-06-16, see `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md`). Plan 1 absorbs C1 + C2 + C3 + C5 — the smallest *useful* atomic unit. C4 (byte-identical parity harness against the legacy server) ships as Plan 2; C6 + C7 (cut over + agent-manifest rename) ship as Plan 3.

**Why C1+C2+C3+C5 must ship together** (lock from 2026-06-16 runtime probe, recorded in `meta-260616T0201Z-plans-reports-productization-260612-1530-master-tracker-md`): the C5 probe ran `@mastra/core#createTool({ inputSchema })` against 6 wire-format cases. **1 of 6 PASS** (string→`ZodArray` only). The factory's `z.preprocess()` + `unwrapItem` step are mandatory for the other 5. C4 (parity gate) cannot pass without C5. C1+C2+C3 without C5 = a peer server that fails 5/6 stdio transport cases = not shippable.

**Scope (5 phases, 1 branch, ~5-6h total):**

1. **Phase 0** — Branch off `main`, install `@mastra/core` + `@mastra/mcp` to root `package.json#dependencies`, create the `tools/learning-loop-mastra/` package skeleton (empty `server.js` + `package.json` + 10th test glob). Verify `MCPServer` can boot a single stub tool.
2. **Phase 1 (C5)** — Ship `tools/learning-loop-mastra/create-loop-tool.js` factory. Port the 4 wire-format regression tests (5 + 6 + 5 + 4 = 20 tests) to namespace 10. Lock the leaf-recursion case against legacy `MAX_RECURSION_DEPTH = 2`.
3. **Phase 2 (C2)** — Register the 29 deterministic meta-surface tools via `createLoopTool` (data-driven from `tools/learning-loop-mastra/tools/manifest.json`). Each tool's `inputSchema` is the legacy `schema` (source of truth); the `execute` wraps the legacy `handler`.
4. **Phase 3 (C3)** — Add `learning-loop-mastra` peer entry to `.mcp.json` + `.factory/mcp.json`. Verify both servers boot in parallel; check for tool-name collisions in `tools/list`; apply `mastra_` prefix if needed.
5. **Phase 4** — Plan 1 acceptance gate: all 9 legacy namespaces pass against the legacy server, all 20 ported tests pass in namespace 10 against the Mastra factory, both `.mcp.json` files enumerate both servers. Commit + tracker update + meta-state log.

**Acceptance gate (single sentence, the durable anchor):** *"All 9 legacy test namespaces pass against the legacy server, AND all 20 ported `wire-format-*.test.js` tests pass in namespace 10 against the Mastra factory."* The 9-namespace anchor is preserved unchanged (per master tracker 2026-06-16); namespace 10 is additive.

**Out of scope (deferred to Plan 2 / Plan 3):** byte-identical parity harness (Plan 2 / C4), runtime gate re-implementation (per `research-260611-2216` §3.9, not needed in Mode 1), workflow-tool migration (Phase D), agent-manifest group rename (Plan 3 / C7), cut-over (Plan 3 / C6).

**Cross-references:** the `Loop-Describe` introspection test, the `mcp-protocol-e2e-test` cold-session test, and the consult-gate `rule-cold-session-test-must-pass-before-resolution` all reference the legacy `learning-loop-mcp` server. Plan 1 keeps the legacy server as primary; the peer is additive. No change to consult-gate patterns.

## Phases

| Phase | Name | Status | Effort | TDD Color | Dependencies |
|-------|------|--------|--------|-----------|--------------|
| 1 | [Phase 0 — Branch + Mastra install + server skeleton](./phase-01-phase-0-branch-mastra-install-server-skeleton.md) | Pending | ~1h | n/a (install + skeleton) | Phase B (shipped 2026-06-14) |
| 2 | [Phase 1 — C5 factory + 4 ported wire-format tests](./phase-02-phase-1-c5-factory-4-ported-wire-format-tests.md) | Pending | ~2h | RED → GREEN (20 tests, 1 stub tool) | Phase 0 |
| 3 | [Phase 2 — C2 register 29 deterministic tools via createLoopTool](./phase-03-phase-2-c2-register-29-deterministic-tools-via-createlooptoo.md) | Pending | ~1-2h | Per-tool RED → GREEN via parity contract test | Phase 1 |
| 4 | [Phase 3 — C3 stdio peer config in .mcp.json + .factory/mcp.json](./phase-04-phase-3-c3-stdio-peer-config-in-mcp-json-factory-mcp-json.md) | Pending | ~30min | `tools/list` enumeration test | Phase 2 |
| 5 | [Phase 4 — Plan 1 acceptance gate](./phase-05-phase-4-plan-1-acceptance-gate.md) | Pending | ~30min | Full `pnpm test` + meta-state log + tracker flip | Phase 3 + green CI |

**Total effort:** ~5-6 hours. One session. Single PR (the 4 sub-phases ship together as the atomic unit).

## Dependencies

**Blocked by:**
- `260614-1259-phase-b-codegen-adoption` (Phase B shipped 2026-06-14; provides `buildPatchSchemaFor` + the 9-namespace test anchor + the per-tool migration pattern that Phase 2 of this plan mirrors)

**Blocks:**
- `phase-c-plan-2-parity` (Plan 2 / C4 — byte-identical parity harness; cannot start until Plan 1 ships)
- `phase-c-plan-3-cut-over` (Plan 3 / C6 + C7 — operational flip; cannot start until Plan 2 passes parity)

**Unfinished cross-plan candidates (scanned 2026-06-16):**
- `plans/260614-1856-GH-1259-fix-stale-records-references/` (status: pending, all phases completed in commit 58b77f8; status field is stale). Not blocking Plan 1; the work is done.

**Out of scope (separate tracks):**
- **Phase D** (workflow + agent + storage migration) — deferred, parallel dimension
- **Phase G** (skill migration) — parallel dimension, independent of A-F
- **LIM-3 / LIM-4 / LIM-5 / LIM-6 / LIM-8 / LIM-9** (hardening LIMs from Phase B) — separate security/quality audit, not part of this plan
- **C6 / C7** (cut over + agent-manifest rename) — Plan 3

## Red Team Review

**Session: 2026-06-16** — 5 personas (correctness, security, performance, UX, maintainability). Full report: `reports/from-code-reviewer-to-planner-phase-c-plan-1-red-team-report.md`. Summary: 1 critical, 5 high, 8 medium, 4 low. **Status: DONE_WITH_CONCERNS.**

**Adjudication (operator 2026-06-16):**

| # | Sev | Disposition |
|---|-----|-------------|
| F1 | CRITICAL | **RESOLVED**: updated master tracker `plans/reports/productization-260612-1530-master-tracker.md:183` from "~36" to "29 (post-Phase-A: 5 gate + 20 meta_state + 3 introspection + 1 runtime_agnostic)". The 4 missing-from-agent-manifest tools are a known inconsistency deferred to Plan 3 / C7. |
| F2 | HIGH | **RESOLVED**: `coerceScalar` returns original value on no-op (matches legacy `coerceValue`); `coerceShape` uses `next !== value` to detect changes. Updated `phase-02` pseudocode and `research-260616-1605-wire-format-coercion-and-test-porting.md` §3.1. |
| F3 | HIGH | **RESOLVED**: keep 2-tool stub through Phase 1; all 20 ported tests GREEN at Phase 1's commit. The leaf-recursion stdio test is proven at Phase 1, not deferred to Phase 2. Updated `phase-02` Step 5. |
| F4 | HIGH | **RESOLVED** (operator decision): ship peer + document gap. Phase 4 PR commit message includes a "Security note" line documenting the gate-bypass. Journal entry (`meta_state_report` finding) flags the gap. |
| F5 | HIGH | **RESOLVED**: corrected "three-way alignment" prose to "two-way alignment" (object key + `mastra_` prefix; `id` is decorative). Updated `phase-03`. |
| F6 | HIGH | **RESOLVED** (operator decision): 1 stacked PR (5 commits). Atomic-unit pattern matches Phase B's strategy. |
| F7 | MEDIUM | **ACCEPTED** (deferred to Plan 2): extend parity test to per-field `_def.typeName`. Plan 2's parity harness uses `z.toJSONSchema()`. |
| F8 | MEDIUM | **ACCEPTED**: add "Plan 3 cut-over note" to `schemas.js` header in Phase 1 Step 1. |
| F9 | MEDIUM | **ACCEPTED** (deferred to Plan 2): Plan 2 adds parallel cold-session test for mastra manifest. |
| F10 | MEDIUM | **ACCEPTED** (deferred to journal): no SoT for ported tests. Accept with journal entry; future plan may add CI diff check. |
| F11 | MEDIUM | **ACCEPTED** (deferred to Plan 2): use `z.toJSONSchema()` in parity harness. |
| F12 | MEDIUM | **COVERED by F4**: gate-bypass documentation in PR + journal. |
| F13 | MEDIUM | **ACCEPTED**: cosmetic. `MAX_TYPE_NAME_UNWRAP = 5` matches legacy inline `for` bound. |
| F14-F18 | LOW | **NOTED** in plan risk tables. |

## Whole-Plan Consistency Sweep

- **Files reread:** `plan.md`, `phase-01`, `phase-02`, `phase-03`, `phase-04`, `phase-05`.
- **Decision deltas applied:**
  - Master tracker `~36` → `29` (F1)
  - Factory pseudocode: `coerceScalar` returns original value on no-op (F2)
  - Phase 1 Step 5: keep 2-tool stub; do NOT revert (F3)
  - Phase 3: corrected "three-way alignment" to "two-way" (F5)
  - Phase 4 PR commit message: "Security note" line for F4
  - Phase 4 Next Steps: file `meta_state_report` finding for F4
- **Reconciled stale references:** none remaining after edits.
- **Unresolved contradictions:** 0. All F1-F6 findings are adjudicated and applied. F7-F13 are deferred to Plan 2 (acceptable for Plan 1's atomic-unit scope).

## Validation Log

### Session 1 — 2026-06-16
**Trigger:** Red-team review surfaced 18 findings (1 critical, 5 high, 8 medium, 4 low). 4 findings needed operator decision (F1 tool count, F3 Phase 1 stdio, F4 gate bypass, F6 PR structure). 4 remaining open decisions validated in this session.
**Questions asked:** 8 (4 adjudication + 4 validation)

#### Questions & Answers

1. **[F4 — Security]** How should Plan 1 handle the mastra server's gate-bypass?
   - Options: Ship peer + document gap | Defer peer to Plan 3 | Add gate-check wrapper
   - **Answer:** Ship peer + document gap
   - **Rationale:** Lowest risk to Plan 1's atomic-unit pattern. Plan 3 (C6) decides cut-over.

2. **[F1 — Tool count]** Master tracker says ~36; plan ships 29. Source of truth?
   - Options: Update tracker to 29 | Add 4 missing to agent-manifest | Keep both, document
   - **Answer:** Update tracker to 29
   - **Rationale:** 29 is verifiable from `tools/manifest.json` (40 entries - 11 workflow). The 4 missing tools are a known inconsistency deferred to Plan 3 / C7.

3. **[F3 — Phase 1 stdio]** Phase 1 step 5 reverts server.js to stub, leaving 6 stdio tests RED. Keep 2-tool stub?
   - Options: Keep 2-tool stub | Revert to Phase 0 stub
   - **Answer:** Keep 2-tool stub
   - **Rationale:** Leaf-recursion stdio test is the contract for `MAX_RECURSION_DEPTH = 2`. Proven at Phase 1's commit, not deferred to Phase 2.

4. **[F6 — PR structure]** 1 stacked PR (5 commits) vs 2 PRs?
   - Options: 1 stacked PR | 2 PRs (Phase 0+1 + Phase 2+3)
   - **Answer:** 1 stacked PR
   - **Rationale:** Atomic-unit pattern matches Phase B's strategy. Reviewer can review commit-by-commit.

5. **[F9 — Cold-session test]** Legacy test ignores mastra manifest. Defer to Plan 2 or fix in Plan 1?
   - Options: Defer to Plan 2 | Plan 1 updates the test
   - **Answer:** Defer to Plan 2
   - **Rationale:** Cold-session is a separate concern from the 9-namespace + namespace-10 anchor. Plan 2 (C4) adds a parallel test.

6. **[Phase 1 server.js]** After F3 fix, Phase 1 has 2 tools registered via hand-rolled loop. Phase 2 replaces with 29-tool data-driven loop. Acceptable?
   - Options: Yes, ship as-is | Phase 1 ships 29 tools
   - **Answer:** Yes, ship as-is
   - **Rationale:** Each commit has clear scope (Phase 1: factory; Phase 2: register loop). Per-commit bisect affordance preserved.

7. **[Install fallback]** Plan 1 commits 5 changes to package.json. Risk of bash gate blocking install. How to handle?
   - Options: Document fallback, proceed | Pre-emptively split into PR-A + PR-B
   - **Answer:** Document fallback, proceed
   - **Rationale:** Fallback (install in /tmp + symlink) is reversible. Operator decides at runtime. Avoids 2-PR overhead.

8. **[Gate logging]** Factory pseudocode does NOT include `appendGateLog` calls. Acceptable?
   - Options: Skip gate logging | Factory logs events
   - **Answer:** Skip gate logging
   - **Rationale:** YAGNI per research §3.3. Tests assert output, not logs. Legacy gate log remains source of coercion events during coexistence.

#### Confirmed Decisions
- F1 tool count: 29 (post-Phase-A, excludes 11 workflow)
- F4 gate-bypass: ship + document gap
- F3 Phase 1 stdio: keep 2-tool stub
- F6 PR structure: 1 stacked PR
- F9 cold-session: defer to Plan 2
- Phase 1 server.js: 2-tool hand-rolled loop
- Install fallback: document + proceed
- Gate logging: skip in factory

#### Action Items
- [x] Update master tracker `~36` → `29` (DONE in this session)
- [x] Update phase-02 pseudocode for F2 (DONE in this session)
- [x] Update phase-02 Step 5 for F3 (DONE in this session)
- [x] Update phase-03 for F5 (DONE in this session)
- [x] Update phase-04 for F4 documentation (DONE in this session)
- [x] Update plan.md Red Team Review + Whole-Plan Consistency sections (DONE in this session)

#### Impact on Phases
- **Phase 0 (branch + install)**: no change; install fallback documented in Risk Assessment
- **Phase 1 (C5 factory + 4 tests)**: pseudocode updated for F2; Step 5 updated for F3
- **Phase 2 (C2 register 29 tools)**: prose updated for F5
- **Phase 3 (C3 peer config)**: risk table + next-steps updated for F4
- **Phase 4 (acceptance gate)**: no direct change; security note for PR commit message
- **No changes to** phase-01, phase-05

## Key Risks Addressed

- **29-tool porting is drift-prone** — every tool's `inputSchema` must equal the legacy `schema` exactly. Plan 2 (Phase 2 of this plan) includes a per-tool parity contract test: `deepEqual(legacy.schema, mastra.inputSchema)` for all 29. If any tool's schema drifts, the contract test fails before the integration tests run.
- **C5 leaf-recursion case is the highest-risk port** — `wire-format-patch-recursion.test.js` locks behavior against legacy `MAX_RECURSION_DEPTH = 2` recursion in `tool-registry.js:124-134`. The factory's `coerceShape` recursion must stop at `depth = 1` to match. The test fails fast if the bound is wrong.
- **Tool-name collisions in `tools/list`** — both servers enumerate globally; if both register `gate_check`, the client sees two tools with the same name. Plan 1 applies the `mastra_` prefix as the safe path (research report confidence 70%); C3 verifies whether MCP clients namespace by server name.
- **MCP client-side namespacing unknown** — Claude Code 1.x + Droid CLI behavior not fully verified. Plan 1 ships the prefix conservatively; Plan 3 (cut-over) re-evaluates.
- **5/6 wire-format coercion cases not handled by raw `createTool`** — the C5 probe confirmed. The factory's `z.preprocess()` + `unwrapItem` + `MAX_RECURSION_DEPTH = 2` are the only path to byte-identical behavior.

## References

- `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md`
- `plans/reports/productization-260612-1530-master-tracker.md` § Phase C
- `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §2.1, §2.4, §3.7-§3.10, §8
- `plans/reports/research-260616-1605-mastra-createtool-and-mcpserver-api.md`
- `plans/reports/research-260616-1605-wire-format-coercion-and-test-porting.md`
- `plans/260614-1259-phase-b-codegen-adoption/` (Phase B's 3-plan pattern)
- `tools/learning-loop-mcp/tool-registry.js#coerceParamsToSchema` (lines 77-137)
- `tools/learning-loop-mcp/tool-registry.js#installWireFormatCoercion` (lines 197-237)
- `tools/learning-loop-mcp/__tests__/wire-format-{coercion-fix,top-level-coercion,meta-state-optional-fields,patch-recursion}.test.js`
- `tools/learning-loop-mcp/agent-manifest.json` (29-tool C2 source list)
- `tools/learning-loop-mcp/tools/manifest.json` (29 file→export entries)
- `package.json#scripts.test` (9-namespace anchor; Plan 1 adds 10th)
- `.mcp.json` + `.factory/mcp.json` (C3 stdio peer config targets)
- `meta-260616T0201Z-plans-reports-productization-260612-1530-master-tracker-md` (C5 probe resolution change-log)
