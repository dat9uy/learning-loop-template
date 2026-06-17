---
title: "Phase C Plan 1a — Atomic fix (2 findings + CR-1 + CR-2)"
description: "Fix 2 active meta-state findings (meta_state_list include_archived semantic unification; meta_state_relationships consolidated_into inbound traversal) and 2 PR #3 code-review gaps (zod exact pin in package.json; mutex reliability in parity-zod-to-json-schema.test.js). 4 stacked commits, 1 PR, 4-6h total. Prerequisite for Plan 1b (CR-3 to CR-6 hygiene) and Plan 3 (C6+C7 cut-over). Mirrors Phase B's atomic-fix pattern (B3+B4)."
status: complete
priority: P1
branch: "260617-1138-phase-c-plan-1a-atomic-fix"
tags: [meta-surface, phase-c, mastra, mcp, atomic-fix, tdd, parity-prerequisite]
blockedBy: ["260616-2200-phase-c-plan-2-parity"]
blocks: ["phase-c-plan-1b-hygiene", "phase-c-plan-3-cut-over"]
created: "2026-06-17T04:41:51.985Z"
createdBy: "ck:plan"
source: skill
related:
  - plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md (3-plan stack decision; Plan 1a scope = 2 findings + CR-1 + CR-2)
  - plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md (CR-1 to CR-6; CR-1/CR-2 = Plan 1a, CR-3 to CR-6 = Plan 1b)
  - plans/reports/productization-260612-1530-master-tracker.md#Phase C (canonical state; Plan 1a is unblocker for Plan 3)
  - plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md (Phase C Plan 1; the peer server this plan's fix propagates to)
  - plans/260616-2200-phase-c-plan-2-parity/plan.md (Phase C Plan 2; predecessor; C4 [x] shipped; PR #3 review flagged CR-1 + CR-2)
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js:14, 173-182 (finding 1; TERMINAL_STATUSES + include_archived filter)
  - tools/learning-loop-mcp/tools/meta-state-relationships-tool.js:56-79 (finding 2; inbound map missing consolidated_by)
  - tools/learning-loop-mcp/core/loop-introspect.js:248-309 (finding 2 inverse-index; buildInverseIndexes; 5 maps; no consolidated_into_inverse)
  - package.json line 28 (CR-1; zod caret pin in dependencies block; parity gate version-sensitive)
  - tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js:9, 79-80, 141-144, 166-169 (CR-2; bypasses withBothMcpServers mutex)
  - tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js:49-59 (mutex exists but bypassed by parity test)
  - tools/learning-loop-mastra/__tests__/with-mcp-server.js (CR-2 fix target; needs Promise queue for serialization)
  - meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when (active finding; expires 2026-06-17T06:52:16Z; Phase 1 resolves)
  - meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into (active finding; expires 2026-06-17T06:52:18Z; Phase 2 resolves)
---

# Phase C Plan 1a — Atomic fix (2 findings + CR-1 + CR-2)

## Overview

**This is Plan 1a of the 3-plan Phase C stack** (decided 2026-06-17, see `plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md`). The 3-plan stack (1a atomic fix → 1b hygiene → 3 operational flip) mirrors Phase B's proven pattern (B3+B4 → B5 → B6) and was operator-confirmed 2026-06-17.

**Why 1a must ship before Plan 1b + Plan 3:** Plan 3 (C6+C7 cut-over) ships the operational flip from legacy `McpServer` to Mastra `MCPServer`. Landing on top of 2 known tool-level bugs (the `meta_state_list` + `meta_state_relationships` findings) means the cut-over would propagate the bugs to both transports. CR-1 (zod caret) breaks the parity gate silently if a contributor runs `pnpm update zod`. CR-2 (mutex bypass) becomes a real race when Plan 3 adds write-side content parity (the 25 currently-skip tools). All 4 are correctness-class; landing them as a single atomic-fix PR is the same pattern Plan 1 used for the C1+C2+C3+C5 atomic adoption.

**Scope (5 phases, 1 branch, 1 PR with 4 stacked commits, ~4-6h):**

1. **Phase 1 — `meta_state_list` `include_archived` semantic unification (finding 1).** RED test + fix: `include_archived: true` surfaces the 3 non-archived terminal statuses (superseded, resolved, auto-resolved) in addition to archived entries. Single-flag unification (operator decision 2026-06-17; Open Q1 resolved). Resolves `meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when`.
2. **Phase 2 — `meta_state_relationships` `consolidated_into` inbound traversal (finding 2).** Add `consolidated_into_inverse` to `buildInverseIndexes` (5 maps → 6 maps) + wire `consolidated_by` into the inbound map. RED test: querying a change-log's relationships shows `inbound.consolidated_by: [<finding-id>]`. Resolves `meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into`.
3. **Phase 3 — `zod` exact pin (CR-1).** Remove caret from `package.json:28`. 1-character change + 1-line README/comment. RED test: `package.json` zod pin is exact (no caret) — locks the parity gate's version-sensitivity.
4. **Phase 4 — Mutex reliability in `connectMcpServer` (CR-2).** Per code-reviewer disposition (option b, robust): push the in-process serializer into `connectMcpServer` itself so the mutex is always active when both servers share `GATE_ROOT`. The `withBothMcpServers` helper's mutex becomes a belt-and-suspenders. RED test: two parallel `callTool` invocations on the same `GATE_ROOT` produce serialized registry writes.
5. **Phase 5 — Acceptance gate + closeout.** Full `pnpm test` (all 10 test namespaces); 2 `meta_state_resolve` calls; 1 `meta_state_log_change` for the plan; master tracker flip for "Plan 1a [x]"; closeout journal.

**Acceptance gate (single sentence, durable anchor):** *"All 10 test namespaces pass (per `package.json#scripts.test`; per-file counts drift) AND 0 regressions AND `meta_state_list({include_archived: true})` returns at least one superseded entry (RED→GREEN finding 1) AND `meta_state_relationships({id: <change-log-id>, direction: 'inbound'})` returns `consolidated_by: [<finding-id>]` (RED→GREEN finding 2) AND `package.json` zod pin is `4.4.3` exact (RED→GREEN CR-1) AND two parallel `callTool` calls on shared `GATE_ROOT` produce serialized registry writes (RED→GREEN CR-2)."*

**Out of scope (deferred to Plan 1b / Plan 3):** CR-3 to CR-6 hygiene items (cold-session test isolation, test count math, commit squashing lesson, plan.md R-09 arithmetic) are Plan 1b. C6 cut-over + C7 manifest rename + D-8 to D-13 + F4 resolution are Plan 3. Phase D workflow tools, Phase G skill migration, LIM hardening are parallel/separate tracks.

**Why TDD (per `--tdd` flag):** each fix is RED-first. The 4 RED tests live in `tools/learning-loop-mcp/__tests__/meta-state-list-tool.test.js` (or extend the existing), `tools/learning-loop-mcp/__tests__/meta-state-relationships-tool.test.js` (or extend the existing), `tools/learning-loop-mcp/__tests__/package-json-zod-pin.test.js` (new), and `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js` (new). Phase 5's acceptance gate re-runs all RED tests to confirm GREEN.

## Phases

| Phase | Name | Status | Effort | TDD Color | Dependencies |
|-------|------|--------|--------|-----------|--------------|
| 1 | [fix-meta-state-list](./phase-01-fix-meta-state-list.md) | Pending | ~1-2h | RED → GREEN | Plan 2 (shipped 2026-06-17) |
| 2 | [fix-meta-state-relationships](./phase-02-fix-meta-state-relationships.md) | Pending | ~1-2h | RED → GREEN | Phase 1 (independent; commit order) |
| 3 | [zod-pin](./phase-03-zod-pin.md) | Pending | ~5min | RED → GREEN (assertion test) | Phase 1 + Phase 2 (commit order; tests should be independent) |
| 4 | [parity-mutex](./phase-04-parity-mutex.md) | Pending | ~1h | RED → GREEN (race test) | Phase 1 + Phase 2 + Phase 3 (commit order; mutex touches test infra) |
| 5 | [acceptance-gate](./phase-05-acceptance-gate.md) | Pending | ~30min | Full `pnpm test` + meta-state log + tracker flip | Phases 1-4 + green CI |

**Total effort:** ~4-6 hours. One session. Single PR (4 stacked commits, one per fix). Commit order: Phase 1 → Phase 2 → Phase 3 → Phase 4 (easiest → hardest; bisect-friendly).

## Pre-flight Checklist (per R-15 acceptance)

| Phase | Gated Path | Tool / Env | Notes |
|-------|-----------|------------|-------|
| 1 | `tools/learning-loop-mcp/tools/meta-state-list-tool.js` | none (no `product/**` write) | no preflight |
| 1 | `tools/learning-loop-mcp/tools/meta-state-list-tool.test.js` (extend) | none (test file) | no preflight |
| 2 | `tools/learning-loop-mcp/core/loop-introspect.js` | none (core lib; not `product/**`) | no preflight |
| 2 | `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js` | none | no preflight |
| 2 | `tools/learning-loop-mcp/core/loop-introspect.test.js` (extend) | none (test file) | no preflight |
| 3 | `package.json` | none (root config; not `product/**`) | no preflight |
| 3 | `tools/learning-loop-mcp/__tests__/package-json-zod-pin.test.js` (new) | none (test file) | no preflight |
| 4 | `tools/learning-loop-mastra/__tests__/with-mcp-server.js` | none (test infra; not `product/**`) | no preflight |
| 4 | `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js` (new) | none | no preflight |
| 5 | `plans/reports/productization-260612-1530-master-tracker.md` (tracker flip) | `OPERATOR_MODE=1` | gated; closeout contract |
| 5 | `meta-state.jsonl` (2 `meta_state_resolve` + 1 `meta_state_log_change`) | `OPERATOR_MODE=1` | gated; closeout |

**No `gate_mark_preflight` calls required** — no `product/**` writes in Plan 1a (test files + plan files + meta-state registry). The `OPERATOR_MODE=1` env var is required for Phase 5's registry calls.

## Dependencies

**Blocked by:**
- `260616-2200-phase-c-plan-2-parity` (Plan 2 / C4 shipped 2026-06-17; all 10 test namespaces pass (durable anchor); mastra namespace contains 75 tests per Plan 2 baseline; parity gate is the regression envelope for Plan 1a)

**Blocks:**
- `phase-c-plan-1b-hygiene` (Plan 1b / CR-3 to CR-6; cannot start until Plan 1a merges; small 2-3h batched PR)
- `phase-c-plan-3-cut-over` (Plan 3 / C6+C7+D-8 to D-13+F4; the operational flip; cannot start until Plan 1a + Plan 1b merge; the cut-over lands on a clean parity surface)

**Unfinished cross-plan candidates (scanned 2026-06-17):**
- `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/` — `[x]` (shipped 2026-06-16)
- `plans/260616-2200-phase-c-plan-2-parity/` — `[x]` (shipped 2026-06-17)
- `plans/260617-0900-learning-loop-skill-coordinator/` — separate track (Phase G mechanics)
- `plans/260517-1600-state-machine-for-irreversible-operations/` — Phase D candidate
- No active blockers from other plans for Plan 1a.

**Out of scope (separate tracks, NOT this plan):**
- **CR-3 to CR-6** — Plan 1b (next plan)
- **D-8 to D-13 + F4** — Plan 3 (C6+C7 cut-over)
- **Phase D workflow + agent + storage** — separate phase
- **Phase G skill migration** — parallel dimension, independent of A-F
- **LIM-3 / LIM-4 / LIM-5 / LIM-6 / LIM-8 / LIM-9** — hardening LIMs from Phase B; separate security/quality audit
- **Coerce layer technical debt** — separate brainstorm (`brainstorm-260617-0212-coerce-layer-zod-native-migration.md`)

## Whole-Plan Consistency Sweep

- **Files reread during authoring:** `plan.md`, `phase-01` through `phase-05` (5 files).
- **Decision deltas from brainstorm (operator 2026-06-17):**
  - Open Q1 (semantic unification vs separation) → **semantic unification** (single `include_archived: true` flag surfaces superseded + resolved + auto-resolved in addition to archived).
  - Plan scope → **Plan 1a only** (2 findings + CR-1 + CR-2); 1b stays separate.
  - PR structure → **1 PR with 4 stacked commits** (Phase B pattern); commit order = easiest → hardest (Phase 1 → Phase 2 → Phase 3 → Phase 4) for bisect-friendly rollback.
- **Test count math (Plan 1a RED tests):** 4 fixes produced +5 new test files / +11 new tests. The 2 existing tool test files (if they exist) get extended with 1 assertion each. Net test count delta = +5 new test files / +11 new tests, +0 RED-to-GREEN churn in other test files. Acceptance gate re-runs the full suite (all 10 test namespaces, durable anchor; mastra namespace contains 75 tests per Plan 2 baseline) to confirm 0 regressions.
- **Reconciled stale references:**
  - "McpServer" vs "MCPServer" naming — Plan 1a touches legacy `meta_state_*` tools (legacy `McpServer`); does NOT touch the mastra peer. The fix propagates to the mastra peer via the legacy-handler-adapter (the mastra server wraps the legacy handlers).
  - "The 4 tools missing from `agent-manifest.json`" (D-11) — NOT this plan; Plan 3 / C7.
  - "F4 finding lifecycle" — NOT this plan; F4 was acked 2026-06-16; resolution is Plan 3 (D-10).
- **Unresolved contradictions:** 0. All 4 items have a clear fix path; the 2 active findings have a `~3h until TTL` constraint (expires 2026-06-17T06:52:16Z); Plan 1a should land before TTL or call `meta_state_ack` to extend.

## Key Risks Addressed

- **Finding 1 fix changes wire format → breaks 75-test mastra suite.** Risk: the `include_archived` semantic change could surface new test cases that fail on the mastra peer (where the same handler is wrapped). Mitigation: the mastra peer wraps the legacy `metaStateListTool` handler (per `legacy-handler-adapter.js`); the fix in the legacy tool propagates to both transports. Phase 5's full `pnpm test` is the regression envelope.
- **Finding 2 fix adds a 6th map to `buildInverseIndexes` → all 5 existing map callers must still work.** Risk: the addition could change the return shape. Mitigation: extend the existing test (or add a new assertion in `loop-introspect.test.js`) that asserts all 6 maps exist with the correct shapes; pre-flight read all 6 maps in a unit test before shipping.
- **CR-1 (zod pin) breaks `pnpm install` if 4.4.3 is no longer in registry.** Risk: low — zod 4.4.3 was published 2026-05-12; pnpm cache should have it; CI installs from lockfile. Mitigation: run `pnpm install` after the change to confirm lockfile resolves.
- **CR-2 (mutex in `connectMcpServer`) breaks existing tests that depend on parallel calls.** Risk: medium — `parity-zod-to-json-schema.test.js` and `with-both-mcp-servers.test.js` both use `connectMcpServer` directly. Adding a queue changes the timing of these tests. Mitigation: the queue is FIFO and in-process; sequential vs parallel timing is only ~10ms difference per call. If a test fails, it's likely a `Promise.all` order assumption that should be made explicit. Pre-flight: run `tools-list-collision.test.js` and `with-both-mcp-servers.test.js` to confirm GREEN after the fix.
- **Plan 1a slips past the 2 findings' TTL (2026-06-17T06:52:16Z, ~3h from plan author).** Risk: medium — if Plan 1a author takes longer than 3h, findings enter `stale` status. Mitigation: Phase 5 calls `meta_state_resolve` on both findings after the fix lands; if Phase 5 happens after TTL, the fix is already in `main` and the resolution note cites the shipped PR. Alternatively, Phase 1 author can call `meta_state_ack` at RED-time to extend the active lifetime.

## References

- `plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md` (the parent 3-plan stack decision)
- `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md` § GAP-1 (CR-1) + GAP-2 (CR-2)
- `plans/reports/productization-260612-1530-master-tracker.md` § Phase C (canonical state)
- `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md` (the peer server this plan's fix propagates to)
- `plans/260616-2200-phase-c-plan-2-parity/plan.md` (the parity gate this plan's fix preserves)
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (finding 1; lines 14, 173-182)
- `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js` (finding 2; lines 56-79)
- `tools/learning-loop-mcp/core/loop-introspect.js` (finding 2 inverse indexes; lines 248-309)
- `package.json` (CR-1; line 28; `zod` caret pin)
- `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` (CR-2; bypasses mutex)
- `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js` (mutex exists; lines 49-59)
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js` (CR-2 fix target)
- `meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when` (active finding; Phase 1)
- `meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into` (active finding; Phase 2)

## Validation Log

### Session 1 — 2026-06-17
**Trigger:** `/ck:plan validate` after plan authored via `--tdd` mode.
**Questions asked:** 4 (this session).
**Tier:** Standard (5 phases, 10 claims/phase spot-checked; 10 verified, 0 failed after line-range corrections).

#### Verification Results
- **Claims checked:** 10 (5 phases × 2 high-risk claims each)
- **Verified:** 10 (8 initial + 2 after line-range corrections)
- **Failed:** 0
- **Unverified:** 0
- **Tier:** Standard
- **Spot-checks:**
  - Claim 1 (zod pin): VERIFIED at `package.json:28` (`"zod": "^4.4.3"`)
  - Claim 2 (TERMINAL_STATUSES + filter): VERIFIED at `meta-state-list-tool.js:14, 173-182`
  - Claim 3 (5 maps in buildInverseIndexes): VERIFIED at `loop-introspect.js:248-309` (range corrected from 248-307; off-by-2)
  - Claim 4 (mutex at lines 49-59): VERIFIED at `with-both-mcp-servers.js:49-59`
  - Claim 5 (parity test bypasses mutex): VERIFIED at `parity-zod-to-json-schema.test.js:9, 79-80, 141-144, 166-169`
  - Claim 6 (inbound map): VERIFIED at `meta-state-relationships-tool.js:56-79` (range corrected from 38-79; off-by-18 — the `inbound` const actually starts at line 57, not 38)
  - Claim 7 (`consolidates` schema): VERIFIED — `meta-state.schema.json:84` has `{"type": "string"}` (CSV canonical)
  - Claim 8 (9-namespace test anchor): VERIFIED at `package.json:17` (9 globs in `test` script)
  - Claim 9 (cold-session test line 341): VERIFIED — `cold-session-discoverability.test.cjs:341` has the hook mirror test
  - Claim 10 (2 finding TTLs): VERIFIED — `meta-state.jsonl` shows `expires_at: 2026-06-17T06:52:16.966Z` and `2026-06-17T06:52:18.291Z`
- **Failures corrected:**
  - `loop-introspect.js` line range: `248-307` → `248-309` (closing `};` at 309)
  - `meta-state-relationships-tool.js` line range: `38-79` → `56-79` (inbound const at 57, not 38)

#### Plan terminology note
- The 2 active findings are technically `status: "reported"` (not `status: "active"`). The brainstorm uses "active" loosely; the F4 finding (separately listed) IS `status: "active"` (acked). The plan uses "active" consistent with the brainstorm; the meta-state source of truth is "reported" with TTL. No change needed.

#### Validation Decisions
1. **Mutex scope (Architecture):** Module-level queue. Confirmed; Phase 4 ships as planned.
2. **TTL handling (Risk):** Phase 5 resolves. Confirmed; no pre-emptive `meta_state_ack` needed.
3. **CSV vs array (Architecture):** Handle both. Confirmed; Phase 2 tolerates both forms.
4. **Test baseline (Scope):** 9-namespace anchor. Confirmed; per-file counts (e.g., 75 mastra tests) demoted to "snapshot" context, not regression criterion. All `pnpm test` success criteria in Phases 1-5 updated.

#### Impact on Phases
- Phase 1: test-baseline criterion updated (line 78).
- Phase 2: test-baseline criterion updated (line 112).
- Phase 3: test-baseline criterion updated (line 69).
- Phase 4: test-baseline criterion updated (line 92).
- Phase 5: 4 test-baseline references + 1 meta_state_log_change reason text updated.
- Plan.md overview: 2 test-baseline references updated.

#### Confirmed Decisions
- Mutex scope: module-level `inFlight` queue in `with-mcp-server.js`.
- TTL handling: Phase 5 calls `meta_state_resolve`; no pre-emptive ack.
- CSV/array: Phase 2 tolerates both forms in `buildInverseIndexes`.
- Test baseline: 9-namespace anchor (durable); per-file counts are snapshots.

#### Action Items
- [ ] All test-baseline references in plan.md + 5 phase files updated (DONE this session).

#### Whole-Plan Consistency Sweep
- **Files re-read:** plan.md, phase-01 through phase-05.
- **Stale terms removed:** "9 legacy namespaces + 75 mastra tests" → "all 10 test namespaces" (durable anchor; 75 demoted to snapshot).
- **Line-range corrections applied:** `loop-introspect.js:248-307` → `248-309`; `meta-state-relationships-tool.js:38-79` → `56-79`.
- **Unresolved contradictions:** 0.


