---
title: "SP0: meta_state_log_change (Self-Modification Affordance)"
description: "Implements the design in plans/reports/brainstorm-260602-sp0-log-change.md. Adds a new MCP tool for the agent to log system changes (schema, rule, tool, policy, surface, lifecycle, manifest) as a first-class entry kind in meta-state.jsonl. Five TDD phases ship the discriminated-union schema, the new tool, an entry_kind filter on meta_state_list, the manifest registration, and the first real self-modification log entry. TDD structure preserves the 16 existing tests in core/meta-state.test.js."
status: pending
priority: P2
branch: "main"
tags: [meta, mcp, tdd, agent-affordances, self-modifying, change-log, meta-state, discriminator]
blockedBy: []
blocks: []
related:
  - plans/reports/brainstorm-260602-sp0-log-change.md
  - plans/reports/brainstorm-260602-meta-state-agent-affordances.md
  - plans/260602-self-enforcing-loop/plan.md
  - plans/260602-strict-mcp-call-rules/plan.md
  - plans/260602-sp0-log-change/reports/red-team-260602-sp0.md (2 CRITICAL findings + 4 lower-severity; structural Phase 1 changes)
  - tools/learning-loop-mcp/core/meta-state.js
  - tools/learning-loop-mcp/core/meta-state.test.js
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js
  - tools/learning-loop-mcp/tools/manifest.json
  - meta-state.jsonl
created: "2026-06-02T13:00:00Z"
createdBy: "ck:plan --tdd (ck CLI blocked by G8 false positive on `ck plan create`; created via Create tool per AGENTS.md fallback)"
source: skill
---

# SP0: meta_state_log_change (Self-Modification Affordance)

## Overview

Implements the design locked in `plans/reports/brainstorm-260602-sp0-log-change.md` (status: locked 2026-06-02). The parent doc `brainstorm-260602-meta-state-agent-affordances.md` decomposes the "agent self-management of meta-state" question into 4 sub-projects (SP0-SP3). This plan ships **SP0 only**: the self-modification affordance that lets the agent log any system change as a first-class entry in `meta-state.jsonl`.

**Core change:** the existing flat `metaStateEntrySchema` (which all 5 existing meta-state tools share) is **renamed** to `metaStateFindingEntrySchema` and gains `entry_kind: z.literal("finding").default("finding")` (a `z.object` — has `.shape`). A new `metaStateChangeEntrySchema` is added as a sibling (`z.object`, has `.shape`). A thin `metaStateEntrySchema = z.union([finding, change-log])` is added for cross-cutting validation. The 5 existing finding tools update to use `metaStateFindingEntrySchema.shape` (not the union's, which has no `.shape`). The 9 existing test cases in `__tests__/meta-state-schema.test.js` that pass input without `entry_kind` are updated to either set `entry_kind: "finding"` or use the more specific `metaStateFindingEntrySchema.safeParse(...)`. The 15 legacy entries in `meta-state.jsonl` (no `entry_kind` field) are coerced to `entry_kind: "finding"` on read by `readRegistry()`.

**Why TDD:** the schema change touches the shared `metaStateEntrySchema` that all 5 existing meta-state tools import. The 16 tests in `core/meta-state.test.js` and the 12 tests in `__tests__/meta-state-schema.test.js` are the contract that must not regress. Tests-first locks the contract before any code changes.

**Surface:** `meta` (changes to the loop's own machinery, not `product/**`).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 0 | [G8 Observation + Plan Scaffolding](./phase-00-g8-observation-and-scaffolding.md) | pending |
| 1 | [Core Schema Change: Discriminated Union (TDD)](./phase-01-core-schema-change.md) | pending |
| 2 | [`meta_state_log_change` Tool (TDD)](./phase-02-log-change-tool.md) | pending |
| 3 | [`meta_state_list` `entry_kind` Filter (TDD)](./phase-03-list-entry-kind-filter.md) | pending |
| 4 | [Manifest Registration + `slugify` Refactor](./phase-04-manifest-and-slugify-refactor.md) | pending |
| 5 | [First Real Change-Log Entry (Self-Modification Log)](./phase-05-first-real-change-log-entry.md) | pending |

## Cross-Plan Dependencies

| Relationship | Plan | Status | Note |
|---|---|---|---|
| Builds on | `260602-self-enforcing-loop` | completed | Provides `metaStateEntrySchema` and the 5 existing meta-state tools |
| Builds on | `260602-meta-state-lifecycle-tidy` | completed | Provides `meta_state_sweep` and the auto-resolve machinery SP0 deliberately bypasses for change-log entries |
| Builds on | `260602-strict-mcp-call-rules` | completed | Documents the G8 false-positive fallback (Create tool directly) used in Phase 0 |
| Required for (future) | SP1 derivation, SP2 grounding, SP3 drift (parent doc) | not started | SP1 will read `entry_kind` to skip change-log entries from finding-lifecycle treatment |

## Resolved Decisions (from locked design)

1. **Role:** `meta_state_log_change` is agent-callable (matches `meta_state_report` / `meta_state_list`).
2. **CAS interaction:** log-only — `writeEntry` appends a new entry; `updateEntry` is not called. CAS not relevant.
3. **Auto-hook:** dropped from SP0 (YAGNI/KISS). Revisit if drift measurement shows agents forget to log.
4. **Change model:** 3-bucket `change_dimension` (`semantic` / `mechanical` / `surface`) + open `change_target` (string) + structured `change_diff` (`added` / `removed` / `changed`).
5. **Entry shape:** Approach A — discriminator field `entry_kind: "finding" | "change-log"` on every entry. Single registry, typed via a thin `z.union` for cross-cutting validation. Branch-specific `z.object` schemas with `.shape` available. Backward-compat coercion in `readRegistry`.
6. **Entry status:** `active` from creation; no TTL, no auto-resolve, immutable audit log.
7. **Schema protection:** tool-only for SP0. Write-gate extension for `meta-state.jsonl` direct edits is deferred to a future SP.
8. **Backwards compat:** legacy entries (no `entry_kind` field) coerced to `entry_kind: "finding"` on read. Tested explicitly in Phase 1.
9. **Schema structure (post-red-team):** `metaStateEntrySchema` is **renamed** to `metaStateFindingEntrySchema` (a `z.object` with `.shape`); a new `metaStateChangeEntrySchema` is added (a `z.object` with `.shape`); a thin `metaStateEntrySchema = z.union([finding, change-log])` is the cross-cutting validator. This is structurally equivalent to the original "discriminated union" design but keeps `.shape` available on the branch schemas.

## Red-Team Findings (see `reports/red-team-260602-sp0.md`)

2 CRITICAL findings + 4 lower-severity findings. All addressed in this plan update:
- CRITICAL-1: `.shape` access on `metaStateEntrySchema` is used in 3 places. Fix: rename the finding schema to `metaStateFindingEntrySchema` (has `.shape`); add a thin `z.union` as the new `metaStateEntrySchema` for cross-cutting use.
- CRITICAL-2: existing tools build entries without `entry_kind`; 9 existing test cases pass input without it. Fix: update tools to set `entry_kind: "finding"` explicitly; update test cases to use the branch-specific schema (or add `entry_kind` to input).
- MEDIUM-1: manifest placement should be in the `meta-state-*` group. Fix in Phase 4.
- MEDIUM-2: `updateEntry` compaction invariant should be documented. Fix in Phase 1.
- LOW-1: Phase 5 "first change-log entry" assertion is brittle. Fix in Phase 5.
- LOW-2: test coverage gaps in Phase 2 (edge cases). Optional, not blocking.
- LOW-3: `applyPromotedRules` interaction with `entry_kind` — already in lock report; cross-referenced in Phase 1 risk assessment.

## Architecture (TDD-Relevant, post-red-team)

```
core/meta-state.js
  - metaStateFindingEntrySchema   [RENAMED from metaStateEntrySchema] z.object with entry_kind: "finding" default; has .shape
  - metaStateChangeEntrySchema    [NEW] z.object for change-log shape; has .shape
  - metaStateEntrySchema          [REFACTORED] z.union([finding, change-log]) for cross-cutting validation; no .shape (by design)
  - readRegistry()                [MODIFIED] coerce legacy entries to entry_kind: "finding"
  - filterEntries()               [MODIFIED] accept entry_kind filter
  - writeEntry()                  [UNCHANGED] append-only, schema validates
  - updateEntry()                 [MODIFIED in doc only] add comment about change-log compaction invariant
  - generateId()                  [UNCHANGED] reused for change-log entry ids

tools/meta-state-report-tool.js      [MODIFIED] use metaStateFindingEntrySchema.shape; set entry_kind: "finding" on entry built
tools/meta-state-list-tool.js        [MODIFIED] use metaStateFindingEntrySchema.shape; add entry_kind filter
tools/meta-state-ack-tool.js         [MODIFIED] use metaStateFindingEntrySchema.shape if applicable
tools/meta-state-resolve-tool.js     [MODIFIED] use metaStateFindingEntrySchema.shape if applicable
tools/meta-state-promote-rule-tool.js [MODIFIED] use metaStateFindingEntrySchema.shape if applicable
tools/meta-state-sweep-tool.js       [MODIFIED] use metaStateFindingEntrySchema.shape if applicable
tools/meta-state-log-change-tool.js  [NEW] uses metaStateChangeEntrySchema.shape
tools/manifest.json                  [MODIFIED] register the new tool in the meta-state-* group
core/slugify.js                      [NEW] shared util (extracted from 2 tool files)

__tests__/meta-state-schema.test.js  [MODIFIED] update 9 existing safeParse cases + 1 .shape comparison test
__tests__/meta-state-log-change.test.js (new)  [NEW]
__tests__/meta-state-list-entry-kind.test.js (new)  [NEW]
__tests__/sp0-change-log-self-log.test.js (new)  [NEW]
```

## Test Plan (Consolidated, post-red-team)

| File | Updated | New | Total after |
|---|---|---|---|
| `core/meta-state.test.js` | 0 | 0 | 16 (untouched, regression-safety floor) |
| `__tests__/meta-state-schema.test.js` | 10 (9 safeParse + 1 .shape) | 12 (discriminator + legacy-coerce + filter) | 24 |
| `__tests__/meta-state-log-change.test.js` (new) | 0 | 8 (tool contract) | 8 |
| `__tests__/meta-state-list-entry-kind.test.js` (new) | 0 | 4 (entry_kind filter) | 4 |
| `__tests__/sp0-change-log-self-log.test.js` (new) | 0 | 1 (smoke: shape match) | 1 |
| `__tests__/g8-subcommand-class-entry.test.js` | 0 | 0 | 1 (unchanged) |
| **Total updated tests** | **10** | | |
| **Total new tests** | | **25** | |
| **Total after plan** | | | **54** in the relevant test surface |

Plus the existing 16 tests in `core/meta-state.test.js` must continue to pass without modification. This is the regression-safety floor for the schema change.

## What This Plan Does NOT Do

- No SP1-SP3 work (derivation, grounding, drift query)
- No write-gate extension for `meta-state.jsonl` direct edits
- No auto-detection of schema changes
- No mutation of existing entries from the change tool
- No auto-resolution, expiry, or compaction of change-log entries
- No promotion of change-log entries to rules (the `meta_state_promote_rule` category guard stays as `loop-anti-pattern` only)
- No changes to `loop_describe` response shape

## Success Metrics

- [ ] All 16 existing tests in `core/meta-state.test.js` still pass without modification (regression-safety floor).
- [ ] All 12 existing tests in `__tests__/meta-state-schema.test.js` updated to use the new schema names and still pass.
- [ ] 12 new tests in `__tests__/meta-state-schema.test.js` pass (discriminator, legacy-coerce, filter).
- [ ] 8 new tests in `__tests__/meta-state-log-change.test.js` pass (tool contract).
- [ ] 4 new tests in `__tests__/meta-state-list-entry-kind.test.js` pass (filter).
- [ ] 1 new smoke test in `__tests__/sp0-change-log-self-log.test.js` passes (shape match, not "first").
- [ ] The 15 legacy entries in `meta-state.jsonl` load correctly via `readRegistry()` (coercion works).
- [ ] The 5 existing finding tools (`meta_state_report`, `meta_state_list`, etc.) work after their file updates.
- [ ] The new tool is registered in `tools/learning-loop-mcp/tools/manifest.json` (in the `meta-state-*` group).
- [ ] `meta_state_list` returns both kinds by default; filters by `entry_kind` when asked.
- [ ] A real change-log entry with the SP0 self-modification shape exists in `meta-state.jsonl`.
- [ ] `pnpm test` passes (full suite, 54 in the relevant test surface).
- [ ] `pnpm validate:records` passes.
- [ ] `pnpm validate:plan-loop` passes.

## Risks

| Risk | Mitigation |
|---|---|
| Discriminated union breaks the 5 existing meta-state tools | Rename `metaStateEntrySchema` → `metaStateFindingEntrySchema` (has `.shape`); add `z.union` for cross-cutting use; update 5 tool files explicitly. (Per red-team CRITICAL-1.) |
| Existing tools build entries without `entry_kind`; 9 test cases pass input without it | Update 9 test cases to use `metaStateFindingEntrySchema.safeParse`; update `meta-state-report-tool.js` to set `entry_kind: "finding"` on the entry built. (Per red-team CRITICAL-2.) |
| Legacy entry coercion fails for malformed entries | Round-trip tests in Phase 1 + smoke test in Phase 5 |
| Tool proliferation (now 6+ meta-state tools) | SP1-SP3 add 3 more; consolidation is a separate concern |
| `entry_kind` discrimination fails in mixed registry | Discriminated union + tests for both branches + round-trip test |
| Schema evolution path unclear when meta-state schema itself changes | SP0 IS the affordance for logging its own schema change — recursive but principled |
| Agents forget to log changes (no auto-detect) | Defer to drift-measurement SP; current evidence shows zero drift |
| G8 subcommand-class false positive recurs on `ck plan create` | Phase 0 records a fresh meta-state entry documenting the recurrence; smoke test in `g8-subcommand-class-entry.test.js` continues to pass |
| Manifest placement out of group | Place new line at end of `meta-state-*` group (per red-team MEDIUM-1) |
| Compaction invariant undocumented | Add comment in `updateEntry` documenting the change-log invariant (per red-team MEDIUM-2) |
| `applyPromotedRules` doesn't match change-log entries | Documented in lock report as known limitation; cross-referenced in Phase 1 risk assessment (per red-team LOW-3) |
