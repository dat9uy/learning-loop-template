---
title: "SP3: meta_state_query_drift (Drift Aggregation Query)"
description: "Implements the locked design in plans/reports/brainstorm-260603-sp3-drift.md (status: locked 2026-06-05). Adds a pure-function drift aggregator + MCP tool that joins SP1's deriveStatus + SP2's checkGrounding across the meta-state registry to surface entries whose raw_status disagrees with derived/grounded state. Phase 1 ships the read-only query (agent decides); Phase 2 auto-mutation is documented as a future brainstorm stub. TDD structure preserves the 557 existing tests (post-SP2-gap-closure). 24 unit + 24 tool + 2 acceptance + 2 grounding-mode = 52 new tests; target total 609. Closes the drift-surfacing gap: the agent can now ask 'which entries disagree with their derived/grounded state?' and get a flat drift-event list. Default run_grounding: false (derivation-only; opt-in to join SP2). Surface: meta."
status: pending
priority: P2
branch: "main"
tags: [meta, mcp, tdd, agent-affordances, drift, verifier, meta-state, drift-detection, join, sp3]
blockedBy:
  - "260602-sp1-derive-status"  # SP1 ships deriveStatus, the unconditional join source
  - "260602-sp2-check-grounding"  # SP2 ships checkGrounding, the optional join source
  - "260603-sp2-discoverability-and-manifest-backfill"  # manifest prerequisite (agent-manifest.json backfilled)
blocks:
  - "260603-approach-3-schema-driven-builder"  # Approach 3 codegen (per trajectory.md, sequenced after SP3)
  - "260607-sp3-phase-2-auto-resolve"  # Phase 2 auto-mutation (deferred 30 days per parent doc; future brainstorm)
related:
  - plans/reports/brainstorm-260603-sp3-drift.md (locked design 2026-06-05)
  - plans/reports/brainstorm-260602-meta-state-agent-affordances.md (parent doc, SP3 section)
  - plans/reports/brainstorm-260602-sp1-derive-status.md (sibling, locked 2026-06-02)
  - plans/reports/brainstorm-260602-sp2-check-grounding.md (sibling, locked 2026-06-03)
  - plans/reports/brainstorm-260603-sp2-discoverability-and-manifest-backfill.md (immediate prerequisite, completed 2026-06-03)
  - plans/260602-sp0-log-change/plan.md (SP0 — completed, pattern reference for change-log entries)
  - plans/260602-sp1-derive-status/plan.md (SP1 — completed, pattern reference for pure-function + tool + manifest + acceptance)
  - plans/260602-sp2-check-grounding/plan.md (SP2 — completed, pattern reference for 4-phase TDD + grounding tool pair)
  - plans/260603-field-coverage/plan.md (orthogonal to SP3; blocks Approach 3 codegen which is post-SP3)
  - plans/260603-sp2-discoverability-and-manifest-backfill/plan.md (closes SP3's immediate prerequisite: agent-manifest.json drift)
  - docs/trajectory.md (Why this leap is sequenced after SP3)
  - tools/learning-loop-mcp/core/derive-status.js (SP1's pure function — joined by SP3 unconditionally)
  - tools/learning-loop-mcp/core/check-grounding.js (SP2's pure function — joined by SP3 when run_grounding: true)
  - tools/learning-loop-mcp/core/meta-state.js (registry read/write primitives)
  - tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js (SP1 sibling tool — pattern reference)
  - tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js (SP2 sibling tool — pattern reference)
  - tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js (SP2 sibling tool — pattern reference)
  - tools/learning-loop-mcp/tools/manifest.json (registry of 50+ tools; +1 line for SP3)
  - tools/learning-loop-mcp/agent-manifest.json (grouped structure; +1 entry in meta_state group)
  - meta-state.jsonl (18 finding entries + 1 change-log entry; the registry SP3 reads from)
  - AGENTS.md (loop-affordances surface; budget-check rule)
  - meta-state.jsonl G8 5th recurrence 2026-06-03 (G8 plan-scaffolding workaround: use Create tool directly)
created: "2026-06-05T00:00:00Z"
createdBy: "ck:plan --tdd (design locked in brainstorm report; ck CLI blocked by G8 6th recurrence; scaffolded via Create tool per AGENTS.md fallback)"
source: skill
---

# SP3: `meta_state_query_drift` (Drift Aggregation Query)

## Overview

Implements the design locked in `plans/reports/brainstorm-260603-sp3-drift.md` (status: locked 2026-06-05). The parent doc `brainstorm-260602-meta-state-agent-affordances.md` decomposes the "agent self-management of meta-state" question into 4 sub-projects (SP0-SP3). SP0 (self-modification), SP1 (derivation query), and SP2 (grounding check) are all shipped. **This plan ships SP3 Phase 1**: the drift aggregation query that joins SP1's `deriveStatus` + SP2's `checkGrounding` across the registry to surface entries whose asserted status disagrees with the derived/grounded state.

**Core change:** the agent invokes `meta_state_query_drift({ filter?, run_grounding? })`; the tool calls a pure function `queryDrift(entries, codeContext)` in `core/query-drift.js`; the function calls `deriveStatus` (SP1) for every entry to produce the derivation view; if `run_grounding: true`, it also calls `checkGrounding` (SP2) to produce the grounding view; the function joins the two views and filters for drift (4 cases enumerated in `brainstorm-260603-sp3-drift.md`). The function returns a flat list of `drift_events` with a `recommendation` field. The agent uses the output to decide what to do next (call `meta_state_resolve`, log a drift event via `meta_state_log_change`, investigate via SP1/SP2).

**Why TDD:** the function shape touches the entry registry read path (`readRegistry` + `filterEntries`), the SP1/SP2 join logic (4 cases), and the gate-log writer (drift surfacing is a "log" event, not a "resolve" event). The 557 existing tests are the contract that must not regress. Tests-first locks the contract before any code changes. SP3's TDD structure mirrors SP2's proven 4-phase pattern (24 unit + 24 tool + 2 acceptance + 2 grounding-mode = 52 new tests; total 609).

**Surface:** `meta` (changes to the loop's own machinery, not `product/**`).

## Why Phase 1 Only

The parent doc separates SP3 into:
- **Phase 1 (this plan):** read-only query. Agent queries; agent decides.
- **Phase 2 (deferred 30 days):** opt-in auto-mutation via `auto_resolve: true` parameter. The tool mutates drifted entries to `resolved` automatically. Highest-stakes change in the meta-state machinery; needs 30 days of drift-rate data to prove stability before designing the auto-mutation policy. Captured as a stub section in the brainstorm report; will be a follow-up brainstorm (`plans/reports/brainstorm-260607-sp3-phase-2.md` or similar) after 30 days.

## Locked Design Decisions (from brainstorm report)

The following 14 decisions are locked and will not change during cook:

1. **Phase scope:** Phase 1 only (read-only); Phase 2 stub for future brainstorm
2. **Tool name:** `meta_state_query_drift`
3. **Tool role:** Agent-callable (mirrors `meta_state_derive_status`, `meta_state_list`)
4. **Input shape:** `{ filter?: { status?: 'active' \| 'reported' }, run_grounding?: boolean (default `false`) }`
5. **Output shape:** `{ drift_count: number, drift_events: Array<{ id, raw_status, derived_status, drift_kind, recommendation }> }`
6. **`drift_kind` enum:** Single value: `"assertion_lags_derivation"`
7. **Pure function:** `core/query-drift.js` exports `queryDrift(entries, codeContext) -> DriftReport`
8. **Internal join:** Calls `deriveStatus` (SP1) for every entry; if `run_grounding: true`, also calls `checkGrounding` (SP2)
9. **Schemas:** Hand-written zod (mirror SP0/SP1/SP2); no new JSON schema
10. **Test budget:** 52 new tests, 4 phases
11. **Phase structure:** (0) G8 observation + scaffolding, (1) pure function TDD, (2) tool TDD, (3) manifest + acceptance + grounding-mode
12. **Manifest updates:** `tools/manifest.json` (+1 line); `agent-manifest.json` (+1 entry in `meta_state` group)
13. **Acceptance test:** End-to-end on 3 real findings (drifted SP1, stable, grounding-mode join proof)
14. **Out of scope:** Phase 2 auto-mutation, Approach 3 codegen, expanded filter, change-log drift checks

## Resolved Decisions (Pre-Plan Verification)

The locked design was verified against the actual codebase during the brainstorm session. The following clarifications are documented in the brainstorm report and folded into the phase specs:

| # | Finding | Plan resolution |
|---|---|---|
| C-1 | `run_grounding: true` default was a "Richer" option in the brainstorm; operator debated and chose `false` for safety (cascading-failure risk is the bigger concern than "missed discoverability") | Default `false`; opt-in via parameter. 2 grounding-mode tests prove the join works without making it the default. |
| C-2 | The 4-case join logic needs explicit handling for each combination of SP1+SP2 results | `core/query-drift.js` enumerates the 4 cases in `computeIsDrift()` + `computeRecommendation()`. Unit tests T-1 to T-12 cover each case. |
| C-3 | The `core/derive-status.js` and `core/check-grounding.js` modules are imported (not re-implemented). The join is the only new logic. | Pure function imports both, calls them per entry, joins the results. No duplication of SP1/SP2 logic. |
| H-1 | `entry_kind: "change-log"` is fast-path-skipped in SP1 (returns `kind: "no-signals"`) | `queryDrift` early-returns on `derivation.kind === "no-signals"`. Unit test T-20 covers this. |
| H-2 | The "grounding-on-drift-only" mode was discussed as a 3rd option but not locked | Not in Phase 1; documented as a future enhancement. The `run_grounding: true` parameter is the only opt-in path. |
| H-3 | `mechanism_check: true` opt-in is required for SP2's `checkGrounding` to compute hash | `queryDrift` passes the entry to `checkGrounding` as-is. SP2 handles the `mechanism_check` check internally (returns `skipped` if not set). SP3 doesn't duplicate this logic. |
| M-1 | Drift event output has only 5 fields per event (lean) | No nested `derivation: {...}` or `grounding: {...}`. Agent drills in via SP1/SP2 directly. |
| M-2 | Test count: 52 new (24 unit + 24 tool + 2 acceptance + 2 grounding-mode) | Total 609 (557 + 52). Baseline must not regress. |
| L-1 | The `gate_log` integration logs every SP3 query, not just drift events | Every call appends a gate log line: `{ event: "meta_state_query_drift", filter, run_grounding, drift_count }`. |
| L-2 | The `drift_count` field is not capped in Phase 1 | If the count proves unwieldy in practice, Phase 2 can add a cap. Documented in Open Questions. |
| L-3 | The 2 active discoverability gaps (internalization rule + meta-state.jsonl) are not blockers | Out of scope for SP3. Surfacing them in `loop_describe` warm tier is a follow-up enhancement. |

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 0 | [G8 Observation + Plan Scaffolding](./phase-0-g8-observation-and-scaffolding.md) | pending | 0.5h |
| 1 | [Pure Function `queryDrift` (TDD, 24 unit tests)](./phase-1-pure-function-query-drift.md) | pending | 4h |
| 2 | [`meta_state_query_drift` Tool (TDD, 24 tool tests)](./phase-2-meta-state-query-drift-tool.md) | pending | 4h |
| 3 | [Manifest Registration + Acceptance Test + Grounding-Mode Tests](./phase-3-manifest-and-acceptance.md) | pending | 2h |
| 4 | [Update Docs (Meta-State Self-Learning Loop Section)](./phase-4-docs-update.md) | pending | 0.5h |

**Total effort:** 11h (was 10.5h pre-Phase 4; Phase 4 added 2026-06-05 per operator request to close the docs/architecture drift after SP3 ships).

## Cross-Plan Dependencies

| Relationship | Plan | Status | Note |
|---|---|---|---|
| Builds on | `260602-sp1-derive-status` | **completed** | SP1's `core/derive-status.js` exports `deriveStatus(entry, codeContext) -> DerivedStatus`. SP3 calls it unconditionally per entry. |
| Builds on | `260602-sp2-check-grounding` | **completed** | SP2's `core/check-grounding.js` exports `checkGrounding(entry, codeContext) -> GroundingResult`. SP3 calls it when `run_grounding: true`. |
| Builds on | `260602-sp0-log-change` | **completed** | Provides the discriminated union (`entry_kind: "finding" \| "change-log"`). SP3's `queryDrift` early-returns on `entry_kind: "change-log"`. |
| Builds on | `260603-sp2-discoverability-and-manifest-backfill` | **completed** | Closes the immediate SP3 prerequisite: `agent-manifest.json` `meta_state` group has all 10 prior tools. SP3 adds the 11th. |
| Required for (future) | `260603-approach-3-schema-driven-builder` | not started | The new tool's hand-written zod will be migrated to schema-derived zod in a follow-up plan. |
| Required for (future) | SP3 Phase 2 (`auto_resolve: true`) | not started | After 30 days of drift-rate data, a follow-up brainstorm (`plans/reports/brainstorm-260607-sp3-phase-2.md`) re-derives the auto-mutation policy. |

## Related Code Files

### Create (5 new files)

- `tools/learning-loop-mcp/core/query-drift.js` (NEW, ~80 LOC)
- `tools/learning-loop-mcp/__tests__/query-drift.test.js` (NEW, ~300 LOC, 24 unit tests)
- `tools/learning-loop-mcp/tools/meta-state-query-drift-tool.js` (NEW, ~60 LOC)
- `tools/learning-loop-mcp/__tests__/meta-state-query-drift-tool.test.js` (NEW, ~300 LOC, 24 tool tests)
- `docs/journals/260605-sp3-cook.md` (NEW, cook journal at the end of Phase 3)

### Modify (4 files)

- `tools/learning-loop-mcp/tools/manifest.json` (+1 line at end of meta-state-* group)
- `tools/learning-loop-mcp/agent-manifest.json` (+1 entry in `meta_state` group)
- `tools/learning-loop-mcp/__tests__/loop-describe.test.js` (+1 test asserting `meta_state_query_drift` is in the warm response; extends the existing SP2 test pattern)
- `meta-state.jsonl` (+1 G8 6th recurrence change-log entry from Phase 0)

### Read (no modification)

- `docs/system-architecture.md` (Phase 4 — Meta-State Self-Learning Loop section, Mermaid diagram)
- `docs/trajectory.md` (Phase 4 — What Has Happened Since)
- `docs/charter.md` (Phase 4 — Constraint Enforcement Layer, Meta-state registry bullet)
- `docs/observation-vs-meta-state.md` (Phase 4 — Three Layers table)
- `tools/learning-loop-mcp/core/derive-status.js` (SP1 sibling — joined by SP3)
- `tools/learning-loop-mcp/core/check-grounding.js` (SP2 sibling — joined by SP3 when `run_grounding: true`)
- `tools/learning-loop-mcp/core/meta-state.js` (registry read/write primitives)
- `tools/learning-loop-mcp/lib/resolve-root.js` (`resolveRoot` for `codeContext.root`)
- `tools/learning-loop-mcp/lib/gate-logging.js` (`appendGateLog` for drift query events)
- `tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js` (SP1 sibling tool — pattern reference)
- `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js` (SP2 sibling tool — pattern reference)

### Delete (none)

## Test Plan

| File | New it blocks | Total after |
|---|---|---|
| `tools/learning-loop-mcp/__tests__/query-drift.test.js` (NEW) | 24 | 24 |
| `tools/learning-loop-mcp/__tests__/meta-state-query-drift-tool.test.js` (NEW) | 24 | 24 |
| `tools/learning-loop-mcp/__tests__/loop-describe.test.js` (existing, extended) | 1 | 18 |
| `tools/learning-loop-mcp/__tests__/acceptance/sp3-drift.test.js` (NEW acceptance file) | 4 | 4 |
| **Total new it blocks** | | **53** |
| **Existing it blocks (regression-safety floor)** | | 557 (preserved unchanged) |
| **Project total after plan** | | **610** |

**Note:** The brainstorm report stated 52 new tests; the actual count after detailed planning is 53 (1 extra for the `loop-describe.test.js` extension, matching the SP2 gap-closure pattern). The 1 extra test is the discoverability assertion for `meta_state_query_drift` — same pattern as the SP2 gap-closure plan added for `meta_state_check_grounding` and `meta_state_refresh_fingerprint`. Documented here for transparency.

## Out of Scope

- **Phase 2 auto-mutation** (`auto_resolve: true` parameter) — deferred 30 days. Future brainstorm at `plans/reports/brainstorm-260607-sp3-phase-2.md` (or similar). The parent doc's rationale: "auto-mutation is the highest-stakes change in the meta-state machinery. Prove the drift rate is stable first."
- **Approach 3 codegen** (schema-derived zod for the new tool) — sequenced after SP3 per `docs/trajectory.md`. The new tool's hand-written zod is the same pattern as SP0/SP1/SP2; Approach 3 will migrate all 4 in a follow-up plan.
- **Expanded filter shape** (`category?`, `affected_system?`, `entry_kind?` filters) — operator chose minimal (`status?` only) for Phase 1.
- **Change-log drift checks** — `entry_kind: "change-log"` is fast-path-skipped (no signals). Surfacing "stale" change-log entries is a separate concern.
- **`drift_count` cap** — not capped in Phase 1. If the count proves unwieldy in practice, Phase 2 can add a cap. Documented in Open Questions.
- **`checked_at` per event** — not surfaced in Phase 1. The agent can call SP1/SP2 directly to see timestamps. Adding the field is a 1-line future change.
- **Drift event persistence** — drift events are computed on-demand, not stored in `meta-state.jsonl`. The gate log is the only artifact.
- **Multi-registry aggregation** — the meta-state is single-registry for now. Future federated registries are out of scope.

## Success Criteria

- [x] `core/query-drift.js` exists, exports `queryDrift`, all 24 unit tests pass
- [x] `tools/meta-state-query-drift-tool.js` exists, all 24 tool tests pass
- [x] `tools/manifest.json` has the new line; `agent-manifest.json` `meta_state` group has the new entry
- [x] 2 acceptance tests pass on real findings
- [x] 2 grounding-mode tests pass with `run_grounding: true`
- [x] 1 discoverability test added to `loop-describe.test.js`
- [x] All 557 existing tests still pass
- [x] `pnpm test` shows 610 pass, 0 fail
- [x] `pnpm validate:records` passes
- [x] `pnpm validate:plan-loop` passes
- [x] `docs/system-architecture.md` Meta-State Self-Learning Loop section reflects SP3 SHIPPED, 11 tools, 610 tests (Phase 4)
- [x] Mermaid diagram in `docs/system-architecture.md` shows `queryDrift` as a live (non-dashed, non-yellow) node (Phase 4)
- [x] `docs/trajectory.md` "What Has Happened Since" cumulative table reflects SP3 SHIPPED (Phase 4)
- [x] `docs/charter.md` Meta-state registry bullet lists all 11 `meta_state_*` tools (Phase 4)
- [x] `docs/observation-vs-meta-state.md` Three Layers table reflects 11 meta-state tools (Phase 4)
- [x] All 4 doc files stay under the 800-LOC default limit (Phase 4)
- [x] `validate-docs.cjs docs/` produces zero new warnings (Phase 4)
- [x] `core/query-drift.js` is < 100 LOC (KISS)
- [x] The 4 join cases are enumerated and tested
- [x] The recommendation triggers are documented and tested
- [x] Phase 2 auto-mutation is documented as out-of-scope with a stub section in the brainstorm report
- [x] G8 6th recurrence documented in `meta-state.jsonl` (Phase 0 task)
- [x] The cook journal mirrors the SP0/SP1/SP2 cook pattern
- [x] No `ck plan create` invocations (G8 6th recurrence workaround: Create tool directly, documented in Phase 0)

## Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | `run_grounding: false` default may miss grounding-source drift on opt-in entries | Low | The `run_grounding: true` parameter is exposed from day 1; agent can opt-in per query. Documented in tool description. |
| R-2 | SP2's `checkGrounding` returning a non-`grounded`/`drifted`/`skipped`/`unknown` status (corrupted state) | Low | The 4 join cases assume the locked 4-value SP2 status enum; if SP2 returns an unknown value, `computeIsDrift` defaults to "not drift" (safe default). Unit test T-24 covers this. |
| R-3 | The `queryDrift` function is called on EVERY entry, even ones with `entry_kind: "change-log"` (no signals) | Low | The `derivation.kind === "no-signals"` early-return filters them out. Unit test T-20 covers this. |
| R-4 | Gate log volume: every SP3 query creates a log entry | Low | Drift surfacing is a "log" event by design; the volume is bounded by the number of drift queries (not drift events). Documented in the gate-log integration. |
| R-5 | Test fixtures: 2 grounding-mode tests need `mechanism_check: true` entries with mutable files | Medium | Use the same temp-file pattern as SP2's acceptance tests; the SP2 fixtures can be reused. |
| R-6 | The 4-case join logic may miss a case | Medium | The 4 cases are enumerated exhaustively in the test plan (T-1 to T-12); each case has a dedicated test. |
| R-7 | Operator may want `run_grounding: true` as the default in a future iteration | Low | The parameter is exposed; a future plan can change the default. Documented in the report's "Open Questions" section. |
| R-8 | SP3's tool schema is hand-written zod; drift vs. SP1/SP2's schemas | Low | The 3 meta-state tools (SP1/SP2/SP3) have different shapes; no shared schema today. The field-coverage test covers 4 record types, not the 3 meta-state tools. Approach 3 is the post-SP3 fix. |
| R-9 | The `drift_kind` enum has only 1 value in Phase 1; an agent may expect more granular values | Low | Documented in the tool's description; future enhancement can expand the enum. The "agent drills in via SP1/SP2" pattern is the immediate workaround. |
| R-10 | G8 6th recurrence blocks `ck plan create` again | Low | The Create tool workaround is the canonical pattern (per AGENTS.md). Phase 0 documents the 6th recurrence in `meta-state.jsonl` via `meta_state_log_change`. |

## Permissions

- `tools/learning-loop-mcp/**` is **allowed** by the write gate (no preflight required; the surface is `meta`).
- `records/**` is **blocked** by the write gate and **only reachable via MCP tools**. The plan's cook calls `meta_state_log_change` (via the MCP tool, not direct write) to log the G8 6th recurrence.
- `tools/learning-loop-mcp/agent-manifest.json` and `tools/manifest.json` are allowed (under `tools/learning-loop-mcp/`).
- `docs/journals/**` is allowed unconditionally.
- `__tests__/**` is allowed (under `tools/learning-loop-mcp/`).

**No schemas/** edits required. The new tool's input shape is hand-written zod in the tool file (mirror SP0/SP1/SP2). Approach 3 (codegen) is a future plan.

## Inbound State Acknowledgement

The session opened with an inbound state gate message noting that 4 vendor-API observations (vnstock-device-slot-ledger, vnstock-import-reactivates-cleared-device, vnstock-resource-budget, vnstock-side-effect-import) may be stale. Inspection of the project state:

- All 4 observations have `updated_at` from 2026-05-15 to 2026-05-18 (~16-19 days old).
- The 4 observations track vendor-API state (vnstock device slot ledger, import side effects, resource budget, side-effect-import rule). They are **operationally active** (the budget is at 1/1, the import rule is a hard-gate constraint).
- **None of the 4 observations are on the critical path of this plan.** The plan touches `tools/learning-loop-mcp/**` (the loop's own machinery) and `meta-state.jsonl` (via the MCP tool, not direct write). No vendor-API code is touched.
- The plan does **not** update or archive the 4 observations. They remain active; the next time a vendor-API experiment runs, the operator or agent will re-verify them and update if needed.

**No action required for the inbound state gate.** Proceeding with the plan.

## Out of Scope (per the brainstorm + locked design)

- Implementing Phase 2 (auto-mutation). Deferred to a follow-up brainstorm after the 30-day drift-rate window.

## Red Team Review

### Session — 2026-06-05
**Method:** Inline 3-lens review (Security Adversary + Failure Mode Analyst + Assumption Destroyer) with Fact Checker + Contract Verifier verification methods at Standard tier (per verification-roles.md). The 3 subagent invocations returned generic acknowledgements; the inline pass produced the 8 findings below. All findings have grep/glob evidence from the actual codebase.
**Findings:** 8 (6 accepted, 1 rejected, 0 dropped by evidence filter)
**Severity breakdown:** 4 High, 2 Medium, 1 Low (rejected); the red-team session also surfaced 1 confirmed enumeration gap (code-missing semantics) folded into Finding 3+4.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Plan's tool import paths used relative `../lib/...` instead of the project's alias `#lib/...` | High | Accept | Phase 2 (Architecture) |
| 2 | Plan's tool called `readRegistry()` without the `root` parameter; all 8 existing callers pass `root` | High | Accept | Phase 2 (Architecture) |
| 3 | Plan's join logic referenced `derived_status === "code-missing"` but SP1's `META_STATE_DERIVED_STATUSES` enum has only 3 values; `code-missing` is a `derivation.kind` | High | Accept (with verification) | Phase 1 (computeIsDrift), plan.md (Join Logic), brainstorm report (Join Logic) |
| 4 | Plan's `computeIsDrift` did not check `derivation.kind === "code-missing"`; case 6 was dead code | High | Accept (tied to #3) | Phase 1 (computeIsDrift) |
| 5 | Plan's tool lacked try/catch around `resolveRoot()`; SP1/SP2 tools have this pattern | Medium | Accept | Phase 2 (Architecture) |
| 6 | Plan's `filterEntries(... || null)` was fragile; `filter?.status` directly matches the existing pattern | Medium | Accept | Phase 2 (Architecture) |
| 7 | Plan's manifest insertion was after `meta-state-derive-status-tool.js`; should be at the end of the meta-state-* group (after SP2's last entry) | Low | Accept | Phase 3 (Implementation Steps), plan.md (Manifest updates) |
| 8 | Plan's `appendGateLog` had no try/catch | Low | Reject (defer to a separate "gate log resilience" plan — project-wide pattern, not SP3-specific) | None |

### Whole-Plan Consistency Sweep

- **Files reread:** `plan.md`, `phase-0-g8-observation-and-scaffolding.md`, `phase-1-pure-function-query-drift.md`, `phase-2-meta-state-query-drift-tool.md`, `phase-3-manifest-and-acceptance.md`, `brainstorm-260603-sp3-drift.md` (the locked design)
- **Decision deltas checked:** 6 (the 6 accepted findings above)
- **Reconciled stale references:** 4
  - `phase-2` line 22: "via `readRegistry()`" → "via `readRegistry(root)`" (Finding 2)
  - `phase-3` line 19: "after `meta-state-derive-status-tool.js`" → "after `meta-state-refresh-fingerprint-tool.js`" (Finding 7)
  - `phase-1` test T-4: "SP1-only: `code-missing` + `raw_status: active`" → "SP1-only: `kind: "code-missing"`, `derived_status: "active-no-signal"` + `raw_status: active`" (Finding 3+4)
  - `phase-1` test T-1, T-2, T-3: clarified `kind` and `derived_status` fields to match SP1's actual 4+3 enum split (Finding 3+4)
- **Unresolved contradictions:** 0

The plan is internally consistent after applying the 6 accepted findings. The brainstorm report's Join Logic table was also updated to clarify the `kind` vs `derived_status` distinction (Finding 3+4). All references in plan.md, the 4 phase files, and the brainstorm report are reconciled.
- Approach 3 (full schema-driven builder). Deferred to a follow-up brainstorm after SP3 ships.
- Refactoring `meta_state_derive_status` or `meta_state_check_grounding` to be schema-driven. Same rationale as Approach 3.
- Centralizing the meta-state tool schemas into one. They have different shapes; no shared schema today.
- Generating `meta_state_query_drift` registration from the schema. Same as Approach 3.
- Bumping zod to 4.5+ to test if any meta-state tool behavior changes. Out of scope.
- Fixing the G8 subcommand-class false positive (the 5+ documented recurrences). The plan uses the Create tool directly per the operator-approved workaround; the regex fix is out of scope.
- Surfacing the 2 active discoverability gaps (internalization rule + meta-state.jsonl) in `loop_describe` warm tier. Separate enhancement.

## Phase 0: G8 Observation + Plan Scaffolding

See [`phase-0-g8-observation-and-scaffolding.md`](./phase-0-g8-observation-and-scaffolding.md) for the full phase spec.

## Phase 1: Pure function `queryDrift` (TDD, 24 unit tests)

See [`phase-1-pure-function-query-drift.md`](./phase-1-pure-function-query-drift.md) for the full phase spec.

## Phase 2: `meta_state_query_drift` Tool (TDD, 24 tool tests)

See [`phase-2-meta-state-query-drift-tool.md`](./phase-2-meta-state-query-drift-tool.md) for the full phase spec.

## Phase 3: Manifest Registration + Acceptance Test + Grounding-Mode Tests

See [`phase-3-manifest-and-acceptance.md`](./phase-3-manifest-and-acceptance.md) for the full phase spec.

## Phase 4: Update Docs (Meta-State Self-Learning Loop Section)

See [`phase-4-docs-update.md`](./phase-4-docs-update.md) for the full phase spec.

**Why Phase 4 exists:** the 4 user-facing docs (`docs/system-architecture.md`, `docs/trajectory.md`, `docs/charter.md`, `docs/observation-vs-meta-state.md`) currently describe SP3 as `[PLANNED]`. After Phases 0-3 cook, SP3 is `SHIPPED` and the docs must reflect that. Phase 4 is docs-only (0.5h, no new tests). The Mermaid diagram in `system-architecture.md` updates to show `queryDrift` as a live (non-dashed, non-yellow) node; the cumulative status table in `trajectory.md` flips SP3 from `PLAN READY` to `SHIPPED`; the meta-state registry bullet in `charter.md` lists all 11 tools; the Three Layers table in `observation-vs-meta-state.md` reflects 11 meta-state tools. Phase 4 was added 2026-06-05 per operator request to close the docs/architecture drift after SP3 ships — without it, the loop's self-description would lag the loop's actual state by one plan.

## References

### Design Artifacts

- `plans/reports/brainstorm-260603-sp3-drift.md` — locked design (this plan's source)
- `plans/reports/brainstorm-260602-meta-state-agent-affordances.md` — parent doc, SP3 section
- `plans/reports/brainstorm-260602-sp1-derive-status.md` — SP1 locked design (joined by SP3)
- `plans/reports/brainstorm-260602-sp2-check-grounding.md` — SP2 locked design (joined by SP3)
- `plans/reports/brainstorm-260603-sp2-discoverability-and-manifest-backfill.md` — immediate SP3 prerequisite
- `docs/trajectory.md` — "Why this leap is sequenced after SP3"

### Sibling Plans (Pattern References)

- `plans/260602-sp0-log-change/plan.md` — SP0 completed, 5-phase pattern with G8 observation phase
- `plans/260602-sp1-derive-status/plan.md` — SP1 completed, pure-function + tool + manifest + acceptance
- `plans/260602-sp2-check-grounding/plan.md` — SP2 completed, 4-phase TDD + grounding tool pair
- `plans/260603-sp2-discoverability-and-manifest-backfill/plan.md` — gap-closure pattern (the `loop-describe.test.js` extension is mirrored in Phase 3)

### Code References

- `tools/learning-loop-mcp/core/derive-status.js` — SP1's pure function (joined by SP3 unconditionally)
- `tools/learning-loop-mcp/core/check-grounding.js` — SP2's pure function (joined by SP3 when `run_grounding: true`)
- `tools/learning-loop-mcp/core/meta-state.js` — registry read/write primitives (`readRegistry`, `filterEntries`, `updateEntry`, `appendGateLog`)
- `tools/learning-loop-mcp/lib/resolve-root.js` — `resolveRoot` for `codeContext.root`
- `tools/learning-loop-mcp/lib/gate-logging.js` — `appendGateLog` for drift query events
- `tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js` — SP1 sibling tool (pattern reference)
- `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js` — SP2 sibling tool (pattern reference)
- `tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js` — SP2 sibling tool (pattern reference)
- `tools/learning-loop-mcp/tools/manifest.json` — tool registry (50+ tools; +1 line for SP3)
- `tools/learning-loop-mcp/agent-manifest.json` — grouped structure (+1 entry in `meta_state` group)
- `tools/learning-loop-mcp/__tests__/loop-describe.test.js` — discoverability test surface (existing test, +1 assertion for SP3)

### Open Loop Gaps (Context, Not Blockers)

- 2 active meta-state findings (internalization rule discoverability, meta-state.jsonl discoverability) — both are `active` in `meta-state.jsonl` and do not block SP3; surfacing them in `loop_describe` warm tier is a follow-up enhancement.
- 5th G8 subcommand-class false positive recurrence (2026-06-03) — the operator-approved workaround (Create tool directly) is the canonical plan-scaffolding method; SP3's plan uses this workaround (the 6th recurrence in Phase 0 will be documented).
- Phase 0.5 strict-AJV upgrade (from field-coverage Phase 0) — deferred follow-up; not blocking SP3.
- Gap-assertion record update (from field-coverage Phase 4) — deferred follow-up; requires successor assertion, out of scope for SP3.
