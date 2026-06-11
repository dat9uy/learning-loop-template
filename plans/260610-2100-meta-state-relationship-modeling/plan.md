---
title: "Meta-state relationship modeling: agent affordance + legacy migration"
description: "Closes 2 gaps from session c319eb97 (reopens field propagation, expired-findings legacy migration). Adds 2 MCP tools (meta_state_migrate_expired_to_stale, meta_state_relationship_validate), reopens field on meta_state_report, and rewires meta_state_resolve cascade to delegate to the migration primitive. 5-phase TDD layout, ~440 lines."
status: pending
priority: P2
branch: "main"
tags: ["meta-state", "mcp-tools", "discoverability", "tdd", "self-model"]
blockedBy: ["260610-1535-meta-state-reopen-path"]
blocks: []
created: "2026-06-11T03:44:48.401Z"
createdBy: "ck:plan"
source: skill
---

# Meta-state relationship modeling: agent affordance + legacy migration

## Overview

Two gaps surfaced in session `c319eb97-a5d7-44ee-a7e1-fe39e56baf6e` (meta-state refresh-loop circuit-breaker plan) and confirmed by gap report 2026-06-11:

1. **Agent affordance gap.** The agent reads user prompts that say "X is related to Y" and stuffs cross-references into `description` prose instead of the structured `reopens` field. The cold-tier `reopens_inverse` index misses them; `meta_state_relationships` returns `reopened_by: []`; operator querying "is finding X still relevant?" gets a partial answer. **Root cause**: `meta_state_report`'s handler at `tools/learning-loop-mcp/tools/meta-state-report-tool.js` destructures only 8 fields and silently drops `reopens` on input, even though `core/meta-state.js:75-77` accepts it.

2. **Legacy migration gap.** 13 `expired` findings predate the `stale` status redesign (plan `260609-stale-flag-redesign`). `stale` is the new re-verifiable open status; `expired` is legacy terminal. There is no path from `expired` to `stale`: `meta_state_resolve` rejects `expired` (line 51 of resolve tool), `meta_state_re_verify` operates on `stale`, `meta_state_sweep` does not touch `expired`. The 13 entries cannot be re-verified or closed through the new lifecycle.

**Approved approach** (per `plans/reports/brainstorm-260610-2100-meta-state-relationship-modeling-report.md`, APPROVED 2026-06-10): ship 2 new MCP tools + 1 new field + 1 cascade delegation + 1 discoverability hint. KISS. ~440 lines added, 5 files modified, 7 files added (2 tools + 4 test files + 1 runbook), 0 new dependencies.

## Goals

- Agent can pass `reopens: ['meta-...']` on `meta_state_report` and have it persist + populate `reopens_inverse` + appear in `meta_state_relationships({direction: "inbound"}).reopened_by`.
- Operator can migrate any of the 13 `expired` findings to `stale` via a single-id tool, enabling `meta_state_re_verify` and `meta_state_resolve` paths.
- `meta_state_relationship_validate` is a read-only lint that surfaces orphan-id warnings before the agent files a finding, making the cross-reference gap mechanically catchable.
- `meta_state_resolve`'s cascade branch (line 105 of resolve tool) is rewired to delegate to the new migration primitive. The 2-step path (`expired → stale → resolved`) is documented in tool descriptions and discoverability hints.
- Hook mirror `.factory/hooks/loop-surface-inject.cjs` is backfilled from 6 to 11 hints, matching canonical `core/loop-introspect.js`. The drift is a known correctness gap (the hook hasn't kept up since plan 260610-1535's hint bump).
- E2E cold-session replay test exercises the full "X is related to Y" script end-to-end against the live registry, gated on `META_STATE_E2E=1` opt-in.

## Non-Goals

- Removing `expired` from the schema enum (backward-compat, separate plan if/when count = 0).
- Auto-sweeping `expired` to `stale` (operator authority on self-learning).
- Adding `addresses` / `source_refs` to `meta_state_report` input (they have their own tools).
- Blocking `meta_state_report` when description references orphan ids (warn only; agentic, not deterministic).
- Bulk migration tool (operator chose individual on touch).

## Phases

| Phase | Name | Status | Effort | TDD |
|-------|------|--------|--------|-----|
| 1 | [Schema + Tool: reopens field on meta_state_report](./phase-01-schema-tools.md) | Pending | 1h | RED → GREEN |
| 2 | [Migrate Tool: meta_state_migrate_expired_to_stale](./phase-02-migrate-tool.md) | Pending | 1.5h | RED → GREEN |
| 3 | [Lint Tool: meta_state_relationship_validate](./phase-03-lint-tool.md) | Pending | 1.5h | RED → GREEN |
| 4 | [Cascade Rewire + Discoverability Hint + Hook Backfill](./phase-04-cascade-sweep.md) | Pending | 1.5h | RED → GREEN |
| 5 | [Backfill + E2E Cold-Session Replay + Closeout](./phase-05-backfill-closeout.md) | Pending | 1.5h | E2E gated |

## Touchpoints (per brainstorm §Final Recommended Solution)

### Modify
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js` — destructure + persist `reopens`; update description. (+8 lines)
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` — cascade branch delegates to `meta_state_migrate_expired_to_stale` (not direct `expired → resolved`); update cascade description. (+6 / -2)
- `tools/learning-loop-mcp/core/loop-introspect.js` — 11th discoverability hint (reopens + migration script). (+5 lines)
- `.factory/hooks/loop-surface-inject.cjs` — backfill hints #7–#10 (currently drifted) + add 11th hint. (+30 lines)
- `tools/learning-loop-mcp/agent-manifest.json` — register 2 new tools in `meta_state` group. (+2 lines)

### Create
- `tools/learning-loop-mcp/tools/meta-state-migrate-expired-to-stale-tool.js` — single-id `expired → stale` operator tool. (~60 lines + tests)
- `tools/learning-loop-mcp/tools/meta-state-relationship-validate-tool.js` — read-only lint. (~80 lines + tests)
- `__tests__/meta-state-report-tool-extension.test.js` — T11–T13 for reopens field. (~50 lines)
- `__tests__/meta-state-migrate-expired-to-stale-tool.test.js` — 5 scenarios. (~90 lines)
- `__tests__/meta-state-relationship-validate-tool.test.js` — 5 scenarios (L1–L5). (~80 lines)
- `__tests__/meta-state-reopen-e2e-cold-session.test.cjs` — gated E2E replay. (~75 lines)
- `plans/260610-2100-meta-state-relationship-modeling/runbooks/expired-migration.md` — operator backfill runbook. (~50 lines)

### Test Updates
- `__tests__/loop-describe-warm-tier.test.js` — bump hint count 10 → 11. (+3 / -1)
- `__tests__/cold-session-discoverability.test.cjs` — same hint-count bump. (+2 / -1)
- `__tests__/meta-state-resolve-cascade.test.js` (or existing) — assert cascade delegates to migration primitive. (+20 lines)

**Total: ~440 lines added, 5 files modified, 7 files added (2 tools + 4 test files + 1 runbook), 0 new dependencies.**

## Constraints (non-negotiable, from brainstorm §Non-negotiable constraints)

1. **No new entry kinds** — the 4-member discriminated union is frozen.
2. **JSONL remains the only writer** — no SQLite migration in this round.
3. **Backward compat** — existing entries without `reopens` must validate (`.optional()` on the zod schema).
4. **Operator remains the authority on self-learning** — no auto-sweep that migrates `expired → stale` without an operator tool call.
5. **KISS** — 2 new tools, 1 new field, 1 cascade delegation, 1 hint. No super-tool, no consult-gate block, no Bridge 1 ambition.

## Key design decisions (locked at plan-time)

1. **Cascade branch is a behavior change, not layering.** The existing `validateAndApplyCascade` (`meta-state-resolve-tool.js:200`) transitions `expired → resolved` directly. The new behavior transitions `expired → stale` via delegation, and the operator must call `meta_state_resolve` again to close. The 2-step path is documented in the tool description and the 11th hint. The 1-step `expired → resolved` path is no longer reachable through cascade.

2. **`checkExpiry` reuse is the math, not the function.** `checkExpiry` (`core/meta-state.js:482-492`) only fires for `status: "reported"`. The migrate tool's precondition is `status: "expired" AND expires_at is non-null AND Date.now() > new Date(expires_at).getTime()` — the same math, but applied to a different status. The implementation re-uses the inline `Date.now() > new Date(entry.expires_at).getTime()` check, not `checkExpiry()` itself. A brief code comment notes why.

3. **Cascade bypass of the `resolution-evidence-required` consult-gate is correct, but the gate runs BEFORE the cascade branch in `meta_state_resolve`.** The migration primitive itself is a state-machine transition (not a resolve), so it sidesteps the gate. But `meta_state_resolve` consults the gate at lines 67-103 of `meta-state-resolve-tool.js` BEFORE the cascade branch at line 105. The cascade only fires if the gate passes. **Implication**: if a `resolution-evidence-required` rule gates the parent, the operator must satisfy the rule BEFORE the cascade is reachable. The plan's 2-step path is therefore really a 3-step path in the gated case: (1) satisfy the gate, (2) `meta_state_resolve({cascade_from})` → migrate to `stale`, (3) `meta_state_resolve({id})` → apply gate again → close. Tool description and 11th hint must document the 3-step gated path alongside the 2-step ungated path.

4. **E2E test gating matches 260610-1535's pattern.** The E2E test is gated on `META_STATE_E2E=1` opt-in (default off, opposite of `SKIP_REAL_REGISTRY_TESTS=1`). Before mutating the live registry, it asserts the 2 fixture IDs (`meta-260608T1522Z-...`, `meta-260608T1618Z-...`) do not already exist. After the test, it cleans up.

5. **Hint count delta: 10 → 11 (canonical); 6 → 11 (hook mirror).** Canonical already shipped 10 (260610-1535 added 1 `reopens` hint at index 6). The hook mirror has been at 6 since before 260610-1535 and has drifted. This plan backfills hints #7–#10 AND adds the 11th in one motion. The hook test in `cold-session-discoverability.test.cjs` (line 426) currently asserts `length === 10` against the warm tier, which reads from canonical — that assertion is correct and needs no change for canonical's count. The hook's `LOCAL_DISCOVERABILITY_HINTS` has its own audit (currently no test, which is the underlying drift problem); this plan adds an assertion to the cold-session test to verify hook == canonical at session-start time.

6. **Backlog completion criterion is operator-side work.** The plan's success metric is "the new tool is reachable for all 13 currently-expired findings." The operator's job is to invoke the tool 13 times (or batch-via-script). The plan ships the mechanism; the empty backlog is a follow-up. A `loop_describe` warm-tier advisory line is added when `expired_count > 0` AND `expired.oldest_age > 7d` to surface the backlog every session.

7. **Wire-format safety on `reopens`.** Top-level arrays on tool calls may get wrapped by the MCP SDK (per `meta-260606T2202Z`). The fix for arrays in the input is in `tool-registry.js#coerceParamsToSchema` (line 108: `unwrapItemWrap`). For `reopens: z.array(z.string()).optional()`, the shape at the handler level receives the unwrapped value, so persistence works. A regression test asserts `meta_state_report({reopens: ['meta-X-...']})` round-trips the array as an array, not a stringified blob.

8. **Naming deviation from peer verb family is preserved.** The peer verbs (`re_verify`, `check_grounding`, `refresh_fingerprint`, `sweep`, `archive`) all follow a verb-led pattern. `meta_state_migrate_expired_to_stale` is a noun phrase. The destination (`stale`) is load-bearing for the operator's mental model, and the deviation is documented in the brainstorm and the tool's JSDoc.

## Plan-time decisions log (per `meta_state_propose_design` for new design entries)

- **D1. Plan structure**: independent new plan at `plans/260610-2100-meta-state-relationship-modeling/`. 260610-1535 is closed; reopening it muddies the audit trail.
- **D2. E2E test scope**: real-registry gated with `META_STATE_E2E=1` opt-in; uses 2 live-registry fixture IDs that already exist.
- **D3. Hint surface**: 11th hint in BOTH `core/loop-introspect.js` AND `.factory/hooks/loop-surface-inject.cjs` mirror. Hook backfills hints #7–#10 in the same phase.
- **D4. Cascade resolve semantic for `expired` parent**: 2-step. Parent goes to `stale` via the new tool, then operator must call `meta_state_resolve` again to close. Tool description updated.
- **D5. Migration tool direction**: one-way. `expired → stale` only. No `stale → expired` reverse. Clears `expires_at`; stamps `last_verified_at: now`.
- **D6. `expired` enum deprecation**: stays in schema enum. Removal is a future, separate schema-breaking change.
- **D7. Plan completion**: when the new tool is shipped AND verified to be reachable for all 13 currently-expired findings. Operator decides when to actually invoke.
- **D8. TTL math**: reuses the past-TTL arithmetic from `checkExpiry` (Date.now() > new Date(entry.expires_at).getTime()), but does NOT call `checkExpiry()` itself (it only fires for `reported`).
- **D9. E2E test gating**: `META_STATE_E2E=1` opt-in; asserts 2 fixture IDs do not already exist; cleans up after.
- **D10. Naming**: `meta_state_migrate_expired_to_stale` (noun phrase) is locked despite the verb-family deviation.

## Dependencies

- **blockedBy**: `260610-1535-meta-state-reopen-path` (status: completed) — provides the `reopens` schema field, the `reopens_inverse` inverse index, the cascade `cascade_from` parameter, and the 9th discoverability hint. This plan layers the affordance + migration on top of that mechanism.
- **blocks**: none (this is a terminal plan for the 2 gaps; future plans may deprecate `expired` enum after count = 0).
- **No new packages**. Uses existing zod, json, fs, node:test patterns.
- **Operator preflight**: none required (no `product/**` writes).

## Out of Scope (per brainstorm §Scope boundary)

- `addresses` and `source_refs` on `meta_state_report` input.
- Bulk archive/migration tool for `expired` findings.
- `meta_state_sweep` auto-migration of `expired` to `stale`.
- New consult-gate that blocks report when relationship is missing.
- Adding `reopens` to `summarize()` compact view (YAGNI for this round; 1-line change at `core/loop-introspect.js:392` if needed later).

## Success Criteria (per brainstorm §Success metrics)

- [ ] `meta_state_report({reopens: [...]})` persists `reopens` on the entry; cold-tier `reopens_inverse` reflects it; `meta_state_relationships` returns `inbound.reopened_by`.
- [ ] `meta_state_migrate_expired_to_stale({id})` works on the 13 currently-expired findings (operator invokes one-by-one; plan's bar is "reachable for all 13", not "0 remaining").
- [ ] `meta_state_relationship_validate` returns `warned: true` for the cold-session scenario from c319eb97 with both `meta-260608T1522Z-...` and `meta-260608T1618Z-...` as `orphans`.
- [ ] All 970+ existing tests pass; new tests bring total to ~1010.
- [ ] `pnpm test:cold-session` passes.
- [ ] No regressions to `meta_state_resolve` operator gate; normal-resolve path still runs through `resolution-evidence-required` consultation; cascade path bypasses it (delegated to state-machine transition, not a resolve).
- [ ] E2E cold-session replay test passes when `META_STATE_E2E=1`; documents the agent's script for "X is related to Y" prompt patterns.
- [ ] 11th discoverability hint present in BOTH `core/loop-introspect.js` AND `.factory/hooks/loop-surface-inject.cjs` mirror; hint count assertion in `loop-describe-warm-tier.test.js` and `cold-session-discoverability.test.cjs` updates from 10 to 11.
- [ ] The hook-mirror is backfilled to match canonical (drift closed). A regression assertion is added to the cold-session test to verify hook == canonical at session-start time.

## Risks + mitigations (per brainstorm §Risks)

| Risk | Mitigation |
|------|-----------|
| `meta_state_relationship_validate` warnings ignored by agent | Warm-tier hint + tool description + E2E test makes the script a pattern the agent is graded on. |
| Cascade `expired → stale` semantic shift breaks existing call sites | Tool description + 11th hint document the 2-step path. Normal cascade callers see `stale` instead of `resolved`; must call `meta_state_resolve` again to close. |
| `reopens` schema accepts arbitrary strings | Validate each entry on the report side: each id must exist in the registry. If not, return `warned: true` with `unknown_refs: [...]`. (Implementation: in handler, after writeEntry, call `meta_state_relationship_validate` internally; if any unknown_refs, return warnings in the response.) |
| 13 `expired` findings pile up because no agent touches them | `loop_describe` warm-tier advisory line when `expired_count > 0` AND `expired.oldest_age > 7d`. Operator sees it every session. |
| Hook-mirror drifts again after this plan | Regression assertion in cold-session test verifies hook == canonical count. (Light touch; doesn't validate hint text equality, just count.) |
| Wire-format coercion of top-level `reopens` array | `coerceParamsToSchema` handles it. Regression test asserts the array round-trips. |

## Reference

- Approved brainstorm: `plans/reports/brainstorm-260610-2100-meta-state-relationship-modeling-report.md` (status: APPROVED, 2026-06-10)
- Prior plan: `plans/260610-1535-meta-state-reopen-path/` (status: completed) — provides `reopens` schema, `reopens_inverse`, `cascade_from`
- Stale-flag redesign: `plans/260609-stale-flag-redesign/` (status: completed) — defines `stale` enum + `meta_state_re_verify`
- Original session bug: `c319eb97-a5d7-44ee-a7e1-fe39e56baf6e`

## Next Step

After operator approval, run Phase 1 (TDD red → green for reopens field on `meta_state_report`).

## Red Team Review

### Session — 2026-06-11
**Findings:** 8 (4 accepted, 1 documented as resolved, 3 minor/duplicate)
**Severity breakdown:** 0 Critical, 2 High, 4 Medium, 1 Low, 1 Resolved
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (3 lenses per the red-team workflow for 3-5 phase plans)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Consult-gate order contradicts plan claim (gate runs BEFORE cascade branch, so cascade only fires if gate passes; plan's "2-step path" is actually 3-step in the gated case) | High | Accept | plan.md D3, phase-04-cascade-sweep.md Architecture section |
| 2 | Hook drift prevention test is misnamed (the cited test reads canonical via `loopDescribeTool`, not the hook) | Medium | Accept | phase-04-cascade-sweep.md step 4 (test addition) |
| 3 | E2E cleanup does not explicitly require GATE_ROOT; risk of live-registry mutation | High | Accept | phase-05-backfill-closeout.md step 1b pre-flight assertion |
| 4 | `updateEntry` CAS conflict with explicit `version` increment in patch | Medium | Accept | phase-02-migrate-tool.md Architecture (add read-source step) |
| 5 | `meta_state_relationship_validate` regex false positives | Low | Reject (low severity, regex is tight) | n/a |
| 6 | Cascade test in Phase 4 missing `GATE_ROOT` isolation | Medium | Accept | phase-04-cascade-sweep.md step 1a (added before/after hooks) |
| 7 | Plan.md "8 files" vs "4 files added" inconsistency | Resolved | n/a (already fixed) | n/a |
| 8 | Plan.md Phase 4 line number corrections for `loop-describe-warm-tier.test.js` | Resolved | n/a (already fixed) | n/a |

### Whole-Plan Consistency Sweep

After applying the 4 accepted findings, re-read `plan.md` and every `phase-*.md`. Reconciled:
- The 2-step vs 3-step path distinction (Finding 1) is now consistent in plan.md D3, phase-04 Architecture, and the 11th hint text.
- The GATE_ROOT pattern (Findings 3, 6) is now consistent across all test files in the plan.
- The `updateEntry` CAS contract (Finding 4) is now flagged as a read-source step in Phase 2 Architecture, not a hard claim.
- The hook drift prevention (Finding 2) is now specifically called out as a NEW test (not the existing cold-session test).

No unresolved contradictions remain. Plan is ready for implementation.
