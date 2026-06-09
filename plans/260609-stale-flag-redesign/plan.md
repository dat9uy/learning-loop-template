---
title: >-
  Stale-flag redesign: close TTL recursion, ship re_verify and supersede MCP
  tools
description: >-
  Adds a new `stale` status to the meta-state registry (replacing the broken
  `resolved_by: 'auto-resolve'` semantics on TTL expiry), ships 2 new MCP tools
  (`meta_state_re_verify` and `meta_state_supersede`), extracts a
  `core/verification-runner.js` module, and backfills 2 affected findings.
  Closes the recursion where the TTL finding
  `meta-260608T0847Z-ttl-expire-system-...` was auto-resolved by its own
  critic'd system. Also fixes the second auto-resolve-by-clock path in
  `meta_state_list` (which stamps `resolved_by: 'auto-resolve'` on past-TTL
  entries on every list call). 15+ new TDD tests; 1 new status; 1 new core
  module; 1 cmd-allowlist; 2 new MCP tools; 1 loop-design entry; 1
  implementation change-log; 1 journal.
status: completed
priority: P1
branch: main
tags:
  - meta
  - mcp-tools
  - meta-state
  - ttl
  - staleness
  - re-verify
  - supersede
  - tdd
blockedBy: []
blocks: []
created: '2026-06-09T12:12:07.056Z'
createdBy: 'ck:plan'
source: skill
related:
  - >-
    plans/reports/brainstorm-260609-stale-flag-redesign.md (design source; full
    redesign narrative)
  - >-
    meta-260608T0847Z-ttl-expire-system-has-the-wrong-action-for-expiry-current-se
    (expired; motivation finding; target of Phase 6 supersede)
  - >-
    meta-260606T1500Z-closeout-script-idempotency-bug (expired; motivation
    finding; target of Phase 6 supersede)
  - >-
    meta-260609T1817Z-meta-state-jsonl-finding-lifecycle (active; change-log
    this plan addresses; gets `consolidates` field in Phase 6)
  - >-
    loop-design-cross-reference-fields (active; related design; not superseded
    by this plan)
  - >-
    tools/learning-loop-mcp/core/meta-state.js#checkExpiry (TTL helper that
    currently returns 'expired'; updated to 'stale' for the reported-past-TTL
    path in Phase 2)
  - >-
    tools/learning-loop-mcp/tools/meta-state-sweep-tool.js (sweep tool;
    rewritten in Phase 2 to flag stale instead of auto-resolve)
  - >-
    tools/learning-loop-mcp/tools/meta-state-list-tool.js#handler (second
    auto-resolve-by-clock path; fixed in Phase 2)
  - >-
    tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js#runTest
    (extracted to core/verification-runner.js in Phase 2)
  - >-
    tools/learning-loop-mcp/core/derive-status.js#computeRecommendation (gains
    new `re_verify` branch in Phase 2)
  - >-
    tools/learning-loop-mcp/core/patterns.json (adds
    `meta-state-verify-cmd-allowlist` in Phase 2)
  - >-
    tools/learning-loop-mcp/tools/meta-state-patch-tool.js#IMMUTABLE_PATCH_FIELDS
    (deny-list reason; the new supersede tool bypasses it for
    finding->change-log consolidation)
  - >-
    tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js (idempotency
    check returns `already_exists_by_addresses_and_proposed_design_for`; Phase 7
    closeout uses meta_state_patch to flip status)
  - >-
    plans/260608-1015-meta-state-patch-tool-and-wire-format-fix/plan.md
    (precedent for 3-phase TDD structure with red/green/refactor)
  - >-
    plans/260608-2255-index-extractor-optimization/plan.md (precedent for
    manifest registration of multiple new MCP tools in one plan)
---

# Stale-flag redesign: close TTL recursion, ship re_verify and supersede MCP tools

## Overview

The meta-state TTL/expiry system has a recursion bug. When a `status: "reported"` finding passes its `expires_at`, the sweep tool (and the list tool on every call) transition it to `status: "expired"` with `resolved_by: "auto-resolve"`. The finding disappears from the active set. The original problem is never re-verified. The TTL finding that documented this design flaw (`meta-260608T0847Z-ttl-expire-system-...`) was itself auto-resolved by the very sweep it described — a recursion: the critic was silenced by the system. The proof case is `meta-260606T1500Z-closeout-script-idempotency-bug`: the bug was fixed in code, but the finding was auto-resolved by TTL before the fix could be referenced from a live registry.

This plan ships a structural fix:

1. **New `stale` status** (non-terminal; can re-transition to `active` after re-verify). Replaces the broken `resolved_by: "auto-resolve"` path. Findings past their clock now stay in the registry and remain discoverable.
2. **Two stale-transition paths** in `meta_state_sweep`: (a) `reported` past `expires_at` → `stale`; (b) `active` past `STALENESS_WINDOW_MS` (default 7 days, env-var-configurable) → `stale`. Auto-resolve is preserved only for the file-modification case (active finding whose `evidence_code_ref` file mtime > `last_verified_at`).
3. **New `meta_state_re_verify` MCP tool** (Phase 3.1): runs the `verification.steps` from a stale entry, appends to `verification.history` (FIFO cap 50), updates `last_verified_at` on any pass, transitions `stale → active` on full pass, keeps `stale` on any failure. Gated on `META_STATE_VERIFY_EXEC=1` (default off). Cmd-allowlist enforced (`core/patterns.json#meta-state-verify-cmd-allowlist`).
4. **New `meta_state_supersede` MCP tool** (Phase 4): the canonical writer of `consolidated_into` for findings transitioning to `status: "superseded"`. Closes the gap that `meta_state_patch`'s `IMMUTABLE_PATCH_FIELDS` deny-list blocks. Gated on `OPERATOR_MODE=1`.
5. **`core/verification-runner.js`** (Phase 3.0): extracted from `meta-state-check-grounding-tool.js#runTest`. Both `meta_state_check_grounding` and `meta_state_re_verify` call it.
6. **`re_verify` recommendation in `derive-status.js#computeRecommendation`** (Phase 2): makes stale findings visibly actionable in `meta_state_query_drift` output.
7. **Backfill** (Phase 5): 2 prior `auto-resolve`d findings (`meta-260608T0847Z-ttl-...` and `meta-260606T1500Z-closeout-...`) are transitioned to `status: "superseded"` with `consolidated_into` pointing to the implementation change-log. The change-log (`meta-260609T1817Z-...`) gets a `consolidates` field.
8. **Fix `meta_state_list` auto-resolve-by-clock path** (Phase 2; expansion on the brainstorm): every list call currently stamps `resolved_by: "auto-resolve"` on past-TTL entries. Replaced with the same `stale` transition.

**Plan mode:** `--hard --tdd`. 3 TDD phases, ~16 new test cases across 4 new test files + 1 added assertion. 2 new MCP tools + 1 new core module + 1 cmd-allowlist + 2 schema changes.

## Phases

| Phase | Name | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| 1 | [Red (TDD tests first)](./phase-01-red-tdd-tests-first.md) | Completed | ~2.5h | n/a |
| 2 | [Green (implementation)](./phase-02-green-implementation.md) | Completed | ~3h | Phase 1 |
| 3 | [Refactor and closeout](./phase-03-refactor-and-closeout.md) | Completed | ~1.5h | Phase 2 |

**Total effort:** ~7h

## Phasing Rationale

3-phase TDD structure matches the workspace's most recent precedent plans (260605-superseded, 260606-rule-loop-design, 260606-cold-session-test-rule, 260608-1015-meta-state-patch, 260608-2255-index-extractor). The 8 phases in the brainstorm collapse naturally:

| Brainstorm phase | TDD phase | What it ships |
|---|---|---|
| Phase 0 (loop-design) | Phase 1 (test) + Phase 2 (green) | Test for new `re_verify` recommendation + loop-design entry as a test-time fixture (operator creates the live entry after Phase 1 ships tests). |
| Phase 1 (schema) | Phase 1 (test) + Phase 2 (green) | 3 schema tests in `meta-state-stale-flag.test.js` (status enum, optional fields, summarize field). |
| Phase 2 (sweep + derive) | Phase 1 (test) + Phase 2 (green) | 3 sweep-stale-transition tests + 1 derive-status test + 1 list-tool regression test. |
| Phase 3.0 (verification-runner) | Phase 1 (test) + Phase 2 (green) | 1 verification-runner test (cmd-allowlist). |
| Phase 3.1 (re_verify tool) | Phase 1 (test) + Phase 2 (green) | 1 re_verify round-trip test. |
| Phase 3.2 (grounding delegation) | Phase 2 (green) | No new test (delegation is a 1-line refactor; existing `meta-state-check-grounding-tool.test.js` covers the contract). |
| Phase 3.3 (patterns.json allowlist) | Phase 2 (green) | No new test (consumed by verification-runner test). |
| Phase 4 (supersede tool) | Phase 1 (test) + Phase 2 (green) | 1 supersede test. |
| Phase 5 (TDD tests) | Phase 1 (test) | All ~16 tests live here. |
| Phase 6 (backfill) | Phase 3 (refactor+closeout) | Live registry mutation via `meta_state_batch` after tests pass. |
| Phase 7 (implementation change-log + loop-design closeout) | Phase 3 (refactor+closeout) | Live registry mutation + journal. |
| Phase 8 (verify + journal) | Phase 3 (refactor+closeout) | Full test run + smoke probes + journal write. |

The split keeps the design surface (tests) in Phase 1, the implementation in Phase 2, and all live-registry mutations + journaling in Phase 3 — so an implementer running `pnpm test` in Phase 1 sees clean red, and Phase 2 turns them green with no live-registry side effects.

## Key Design Decisions (locked in brainstorm + operator clarifications)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backfill mechanism for the 2 affected findings | New `meta_state_supersede` tool | `meta_state_patch`'s `IMMUTABLE_PATCH_FIELDS` deny-list (meta-state-patch-tool.js#12-23) blocks `consolidated_into` and `resolved_at/by` writes. The new supersede tool takes a narrow `id + consolidated_into + resolution` shape and atomically stamps `status: "superseded" + superseded_at + superseded_by + consolidated_into`. Also makes the underutilized `superseded` status operationally usable for future agents. |
| `STALENESS_WINDOW_MS` default | 7 days | Matches the compaction window (`COMPACTION_AGE_MS` in `core/meta-state.js#8`); less noise than 24h. Module-load env-var pattern, mirroring `META_STATE_BATCH_LIMIT` at `core/meta-state.js#383`. |
| `verification` field shape | Loose outer / object-form inner / cmd allowlist | Outer field is required `verification: object`; inner shape is JSDoc-typed but **not zod-enforced** (mid-plan field changes are the historical source of `loop-design.proposed_design_for` drift). Inner shape: `{ steps: Array<{cmd, args?, cwd?, timeout_ms?, expect?}>, history?: Array<{at, status, signal}> }`. |
| `meta_state_re_verify` exec surface safety | 3 layered defenses | (1) `META_STATE_VERIFY_EXEC=1` env-var gate; (2) `core/patterns.json#meta-state-verify-cmd-allowlist`; (3) `spawnSync` with `shell: false, timeout: 10_000` per step. |
| Verification-runner refactor | Extract `core/verification-runner.js` | Exports `runVerification(root, step)` returning `{ status, signal }`. Both `meta_state_check_grounding` and `meta_state_re_verify` call it. Phase 3.0 prerequisite; does not change the contract of `meta_state_check_grounding`. |
| `derive-status.js#computeRecommendation` for stale | Add `re_verify` to `META_STATE_RECOMMENDATIONS` | New branch: `kind=mechanism-shipped + status=stale → recommendation: re_verify`. |
| Terminal-set discipline | `stale` added ONLY to `meta-state-sweep-tool.js`'s local `TERMINAL_STATUSES` | It is non-terminal; it can re-transition to `active`. Must NOT be added to `core/meta-state.js#7` (TERMINAL_STATUSES), `core/derive-status.js#22` (TERMINAL_RAW_STATUSES), or `core/loop-introspect.js#139` (terminal-status check). Adding to those would suppress drift detection on stale entries — the opposite of what we want. |
| Two stale-transition paths | Both in `meta_state_sweep` | (a) `reported` past `expires_at` → `stale` (currently the only path, but with broken `auto-resolve`); (b) `active` past `STALENESS_WINDOW_MS` → `stale` (NEW). Sweep calls both helpers and dedupes by entry id. Auto-resolve is preserved for the file-modification case only. |
| `meta_state_resolve` untouched | The tool's local TERMINAL_STATUSES stays `["auto-resolved", "expired", "resolved"]` | Operators should be able to resolve a stale finding (it's not terminal). The new status is `superseded` (via the new tool), `resolved` (via `meta_state_resolve`), or `active` (via `meta_state_re_verify`). |
| `meta_state_re_verify` only operates on `stale` entries | A `reported` finding must first be swept to `stale` before re-verify is meaningful (otherwise the clock is still ticking and the next sweep will re-flag it). | The tool schema and handler enforce this: returns `{ re_verified: false, reason: "wrong_status" }` for any non-stale entry. |
| `meta_state_list` auto-resolve path | Fixed in same plan (scope expansion) | Lines 47-53 of `meta-state-list-tool.js` stamp `resolved_by: "auto-resolve"` on past-TTL entries on every list call — a SECOND path that closes the critic. Replaced with the same `stale` transition; operator confirmed in scope question 1. |
| History cap is a tool responsibility | The 50-entry FIFO cap on `verification_history` is enforced in the `meta_state_re_verify` tool handler (in-memory trim before write). The schema accepts any-length array. | 2-line change in the tool; avoids a v2 migration on the schema. |
| Single plan, single commit, single PR | All 3 phases ship together | Per project convention. The implementation change-log and the loop-design closeout are in the same commit as the code changes. |

## Critical Files

### Create

- `tools/learning-loop-mcp/core/verification-runner.js` (~80 lines; new; exports `runVerification(root, step)` with cmd-allowlist + `spawnSync` + 10s timeout; returns `{ status: "passed" | "failed" | "error", signal: string }`)
- `tools/learning-loop-mcp/tools/meta-state-re-verify-tool.js` (~150 lines; new; gates on `META_STATE_VERIFY_EXEC=1`; CAS-safe; `meta_state_re_verify`)
- `tools/learning-loop-mcp/tools/meta-state-supersede-tool.js` (~110 lines; new; gates on `OPERATOR_MODE=1`; CAS-safe; `meta_state_supersede`)
- `tools/learning-loop-mcp/__tests__/meta-state-stale-flag.test.js` (~250 lines; new; 10 tests covering schema, summarize, derive-status re_verify, terminal-set discipline, verification-runner allowlist, re_verify round-trip, supersede)
- `tools/learning-loop-mcp/__tests__/meta-state-sweep-stale-transition.test.js` (~120 lines; new; 3 tests for sweep stale transitions + idempotency)
- `tools/learning-loop-mcp/__tests__/index-validate-smoke.test.js` (~50 lines; new; 1 smoke test asserting registry validates against new schema)
- `docs/journals/260609-stale-flag-redesign.md` (~80 lines; new; written in Phase 3)

### Modify

- `tools/learning-loop-mcp/core/meta-state.js` — schema additions (status enum, `last_verified_at`, `verification`, `superseded_at`, `superseded_by`); constant `STALENESS_WINDOW_MS`; status-count comment in `loop-introspect.js#summarize`
- `tools/learning-loop-mcp/core/derive-status.js` — `META_STATE_RECOMMENDATIONS` enum gains `re_verify`; new branch in `computeRecommendation`
- `tools/learning-loop-mcp/core/loop-introspect.js` — `summarize` includes `last_verified_at`; status-count comment (5 → 6)
- `tools/learning-loop-mcp/core/patterns.json` — new `meta-state-verify-cmd-allowlist` key (top-level alongside `docker`/`sudo`/etc.)
- `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js` — new `checkStaleness` helper; new `## Stale Findings` section in `docs/registry-summary.md`; add `stale` to local `TERMINAL_STATUSES`; new `STALENESS_WINDOW_MS` import
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — lines 47-53 changed: replace `status: "expired"` + `resolved_by: "auto-resolve"` with `status: "stale"` (no `resolved_at/resolved_by`); remove the `newStatus` auto-resolve logic for the past-TTL case; the auto-resolve path is reserved for the sweep tool's file-modification case
- `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js` — 1-line refactor: delegate `runTest` to `core/verification-runner.js#runVerification` (no behavior change for `meta_state_check_grounding`)
- `tools/learning-loop-mcp/tools/manifest.json` — 2 new tool entries (`meta_state_re_verify`, `meta_state_supersede`)
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` — 1 added regression assertion: stale entries do NOT trigger the test's idempotency-key churn loop
- `meta-state.jsonl` — 2 supersede patches + 1 change-log + 1 loop-design via `meta_state_batch` (live mutation in Phase 3)

### Out of Scope (deferred to follow-up plans)

- TTL config field on `meta_state_report` at creation time (per-finding TTL).
- Pattern-based verification templates (e.g., "verify a `gate-logic-bug` by running the gate with the example command").
- `meta_state_sweep` SessionStart hook to auto-sweep on session start (hot-path concern).
- `stale_drift` drift kind in `meta_state_query_drift` to surface "stale entries that were auto-resolved anyway."
- Bridge 5 (yaml→zod pipeline).

## Acceptance Criteria

- [ ] `meta_state_sweep` no longer stamps `resolved_by: "auto-resolve"` on entries that are merely past TTL. The new `stale` transition replaces it for the reported-past-TTL and active-past-staleness-window paths.
- [ ] `meta_state_re_verify` exists; running it on a stale entry with intact `verification.steps` and passing `expect` returns `{ re_verified: true }` and the entry returns to `status: "active"`. Failure keeps the entry in `stale` and appends to `verification.history`.
- [ ] `meta_state_supersede` exists; the 2 prior `auto-resolve`d findings (TTL, closeout) are transitioned to `status: "superseded"` with `consolidated_into` pointing to the implementation change-log.
- [ ] The active-finding path is also covered: `status: "active"` past `STALENESS_WINDOW_MS` (default 7 days) → `stale`. This is a NEW path the original `checkExpiry` does not handle.
- [ ] `meta_state_list` no longer auto-resolves past-TTL entries on every call; it transitions them to `stale` instead.
- [ ] All tests pass (~840 existing + ~15 new = ~855 passing).
- [ ] The 4 churn-fixture `status: "expired"` references in `cold-session-discoverability.test.cjs` are updated to `status: "stale"`.
- [ ] The 3 `checkExpiry` test assertions in `core/meta-state.test.js` are updated to assert `"stale"` (1-2 line edits).
- [ ] The `DISCOVERABILITY_HINTS` array in `loop-introspect.js#92-106` is updated to reflect the new 6-status enum (adding `stale` to the "Findings have N statuses" hint).
- [ ] `index_validate` confirms registry is well-formed after the backfill.
- [ ] `loop_describe({ tier: "warm" })` surfaces the 2 new tools.
- [ ] The cold-session-discoverability test still passes (regression guard for the meta surface).
- [ ] `meta_state_relationships` on the implementation change-log shows `consolidates: [ttl-id, closeout-id]`.
- [ ] `meta_state_query_drift` no longer reports the 2 backfilled findings as drift (they are now `superseded`).

## Risks + Mitigations

- **Risk**: widening the status enum breaks existing entries with a non-stale status. **Mitigation**: enum widening is backward-compatible (no entry has `status: "stale"` today; missing `status` is allowed).
- **Risk**: `meta_state_re_verify` is an injection surface (runs shell from registry-stored strings). **Mitigation**: 3 layered defenses (`META_STATE_VERIFY_EXEC=1` env-var gate, cmd-allowlist, `spawnSync` with `shell: false` + 10s timeout).
- **Risk**: changing sweep + list behavior is observable in production telemetry. **Mitigation**: the implementation change-log (Phase 3) is the announcement; document the behavioral delta in the change-log's `reason` field.
- **Risk**: changing the 2 superseded findings' status from `expired` to `superseded` alters the audit trail's interpretation. **Mitigation**: the change-log's `consolidates` field names them; `meta_state_relationships` (1-hop) returns the lineage.
- **Risk**: `meta_state_batch` does not have a `supersede` op type (its `BATCH_OP_TYPES` is `["write", "update", "delete", "archive"]`). **Mitigation**: the 2 supersede operations are issued as individual `meta_state_supersede` calls (each is itself CAS-safe); the 1 change-log + 1 patch are wrapped in a single `meta_state_batch` for atomicity. The 3 ops in Phase 3 are NOT all in one batch — the 2 supersedes are sequential, the 1 batch contains the change-log write + the loop-design status patch.

## Non-Negotiable Constraints (from operator + project policy)

1. **No `decision` records for the meta surface** (per operator — meta-state.jsonl is the only record for the meta surface; decisions are for `product` only).
2. Schema lives hand-written in `core/meta-state.js` (Bridge 5 not shipped; no yaml→zod pipeline to refactor).
3. All `records/**` writes via MCP tools; direct I/O blocked.
4. All file writes go through the gate; preflight marker required for `product/**` (not needed here — meta changes only).
5. CAS via `_expected_version` on `meta_state_patch` and `meta_state_supersede`.
6. `meta_state_re_verify` uses `META_STATE_VERIFY_EXEC=1` (default off; mirrors `OPERATOR_MODE` pattern).
7. `meta_state_supersede` uses `OPERATOR_MODE=1` (matches `meta_state_sweep` and `meta_state_resolve` precedent).
8. Terminal-set discipline: `stale` added only to `meta-state-sweep-tool.js`'s local `TERMINAL_STATUSES`. It MUST NOT be added to `core/meta-state.js#7`, `core/derive-status.js#22`, or `core/loop-introspect.js#139`.
9. `meta_state_resolve` is untouched (its local TERMINAL_STATUSES stays as-is; `stale` entries can still be resolved manually).
10. The verification-runner refactor ships before the re_verify tool and the grounding delegation (hard prerequisite).
11. Tests are written first per the project convention; the test list IS the design surface.
12. Single plan, single commit, single PR.

## Out-of-Scope

See "Out of Scope" section above. The 4 deferred follow-ups are TTL config field, pattern-based verification templates, SessionStart auto-sweep, and `stale_drift` drift kind. None block this plan.

## Red Team Review

Self-executed (3 parallel `code-reviewer` subagents returned empty "Plan is up-to-date" with no findings; red team lenses applied directly by the planner). 3 lenses applied: Security Adversary, Failure Mode Analyst, Scope & Complexity Critic.

### Findings

| # | Severity | Title | Lens | Disposition |
|---|----------|-------|------|-------------|
| 1 | **Critical** | `core/meta-state.test.js` has 3+ `checkExpiry` tests asserting `"expired"` return value | Failure Mode Analyst | In Progress |
| 2 | **High** | `cold-session-discoverability.test.cjs` has 4 fixture references to `status: "expired"` that the new model invalidates | Failure Mode Analyst | **Accept** — added sub-step 5.5 to update fixtures |
| 3 | **High** | `DISCOVERABILITY_HINTS` array in `loop-introspect.js#92-106` still says "Findings have 5 statuses" | Scope Critic | **Accept** — updated sub-step 1.3 to bump to 6 |
| 4 | **High** | T7 test in Phase 1 cannot be cleanly red (it asserts behavior that Phase 2 sub-step 1.1 also changes) | Scope Critic | **Accept** — split into sub-step 1.0 (test update) + 1.1 (schema + checkExpiry) for clarity |
| 5 | Medium | Test count inconsistency: Phase 1 says 16 new tests, Phase 2 says 854, Phase 3 journal says 855 | Scope Critic | **Accept** — reconciled to 15 new tests / ~855 total |
| 6 | Medium | `query-drift.test.js#345` and `gate-resolution-evidence.test.js#128` use `status: "expired"` as fixture; need to verify they don't break | Failure Mode Analyst | **Accept** — these tests use `expired` as a generic status for non-stale purposes (drift detection on resolved findings). Phase 1 sweep verifies; the tests are unaffected. Documented. |
| 7 | Medium | T6 test imports `TERMINAL_STATUSES` from `core/meta-state.js` (currently non-exported); test will fail at import time in Phase 1 (confusing red) | Scope Critic | **Accept** — the plan's sub-step 1.1 adds the export; the confusing red is acceptable |
| 8 | Low | Live-registry mutations in Phase 3 have no per-sub-step roll-back plan | Scope Critic | **Accept** — added roll-back note to Phase 3 sub-step 6 |
| 9 | Low | Journal template has placeholder values ("N = number of new tests") that the implementer must fill in | Scope Critic | **Accept** — the implementer runs tests first (sub-step 6.1) then writes the journal (sub-step 5) |
| 10 | Low | `loop-describe-warm-tier.test.js#37` asserts `statusLifecycle.includes("expired")`; needs verification it doesn't break | Failure Mode Analyst | **Accept** — verified: it just checks `"expired"` is in the array; adding `"stale"` is additive |

### Whole-Plan Consistency Sweep

Re-read `plan.md`, `phase-01-red-tdd-tests-first.md`, `phase-02-green-implementation.md`, `phase-03-refactor-and-closeout.md`. Searched for: stale terms ("expired" as the TTL return value), renamed APIs (`stale` status, `META_STATE_VERIFY_EXEC`, `OPERATOR_MODE`), rejected assumptions (the `meta_state_resolve` deny-list), superseded implementation details.

Reconciled:
- **Test count**: 15 new tests (~855 total) used consistently in plan.md, phase-01, phase-02, phase-03.
- **`checkExpiry` return value**: "stale" used consistently in plan.md, phase-02 sub-steps 1.1, 1.0, 2.1, 2.2.
- **`TERMINAL_STATUSES` set membership**: "stale" added ONLY to `meta-state-sweep-tool.js`'s local set; explicitly excluded from `core/meta-state.js`, `core/derive-status.js`, `core/loop-introspect.js` (plan.md Decision 7, phase-02 sub-step 1.3).
- **Discoverability hint count**: "6 statuses" used in plan.md and phase-02 sub-step 1.3.
- **Backfill mechanism**: `meta_state_supersede` used consistently in plan.md, phase-03 sub-step 2; never confused with `meta_state_patch`.
- **Loop-design closeout**: `meta_state_patch` (NOT `meta_state_propose_design`) used consistently in phase-03 sub-step 4 to flip status to `inactive`.

No unresolved contradictions. Plan is ready for cook.
