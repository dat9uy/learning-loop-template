---
title: "Superseded Status + Consolidated_into + Loop_describe Cold Tier + MCP Connection Discoverability"
description: "Closes 2 gap entries (meta-260605T1356Z-loop-describe-cold-tier-superseded-lineage-missing and meta-260605T1356Z-sp0-sp3-tools-require-live-mcp-server-connection) plus the underlying G8 supersede housekeeping. Phase 1 adds 'superseded' to the meta-state status enum + a `consolidated_into` field on findings + a `consolidates` field on change-logs + a `session_id` field for hook idempotency, and updates the SP3 drift filter to treat superseded as terminal. Phase 2 applies Option A to the 4 G8 finding entries (1st, 3rd, 4th, 5th recurrences) so the G8 bug stays visible in the audit trail (via a single change-log) without polluting the drift view. Phase 3 surfaces the superseded lineage in `loop_describe({ tier: 'cold' })` so agents can trace old findings to their canonical change-log without reading the registry directly. Phase 4 EXTENDS the existing `.factory/hooks/loop-surface-inject.cjs` hook (which already does a real MCP probe) to log a meta_state_report finding on probe failure + surface a banner, closing the discoverability gap demonstrated by this very session. TDD structure: 7 schema/drift tests + 2 G8-apply tests + 4 loop_describe tests + 3 hook tests = 16 new tests. Target total: 557 + 16 = 573. Closes the 'consolidated = resolved' semantic lie and the 'MCP-not-connected = silent direct-file-I/O' gap. Surface: meta (loop's own machinery, not product/**)."
status: pending
priority: P2
branch: "main"
tags: [meta, mcp, tdd, agent-affordances, superseded, consolidated-into, loop-describe, discoverability, mcp-connection, drift-filter, meta-state, g8]
blockedBy:
  - "260602-sp1-derive-status"  # SP1 ships deriveStatus; the drift filter update joins here
  - "260602-sp2-check-grounding"  # SP2 ships checkGrounding; drift filter is unconditional on SP1
  - "260603-sp3-drift"  # SP3 ships queryDrift; Phase 1 modifies its filter
blocks: []
related:
  - meta-state.jsonl entry meta-260605T1356Z-loop-describe-cold-tier-superseded-lineage-missing (Phase 3 closes this gap)
  - meta-state.jsonl entry meta-260605T1356Z-sp0-sp3-tools-require-live-mcp-server-connection (Phase 4 closes this gap)
  - plans/reports/brainstorm-260602-meta-state-agent-affordances.md (parent doc; SP0-SP3 + Phase 5 audit-trail stub captured here as Phase 3)
  - plans/reports/brainstorm-260603-sp3-drift.md (SP3 design; the drift filter Phase 1 modifies lives here)
  - plans/260602-strict-mcp-call-rules/plan.md (origin of the loop-surface-inject hook pattern; Phase 4 extends it for error reporting)
  - plans/260603-sp3-drift/plan.md (pattern reference: 4-phase TDD + phase 0 G8 observation + phase 4 docs)
  - tools/learning-loop-mcp/core/meta-state.js (status enum + consolidated_into + consolidates + session_id fields + TERMINAL_STATUSES set)
  - tools/learning-loop-mcp/core/query-drift.js (computeIsDrift terminal-status check)
  - tools/learning-loop-mcp/tools/loop-describe-tool.js (cold-tier surface for Phase 3)
  - .factory/hooks/loop-surface-inject.cjs (Phase 4 modifies this; existing spawn+initialize+call probe + formatBlock)
  - .factory/hooks.json (registers the SessionStart hook with matcher "startup")
  - meta-state.jsonl (registry; Phase 2 mutates 4 G8 entries + adds 1 change-log entry; Phase 4 may add a meta_state_report finding on probe failure)
  - AGENTS.md (gate response mode + budget-check rule + inbound state gate; documents the loop's own machinery)
created: "2026-06-05T00:00:00Z"
createdBy: "ck:plan --tdd (4 work phases per operator scope; ck CLI blocked by G8 subcommand-class false positive — 7th recurrence expected; scaffolded via Create tool per AGENTS.md fallback)"
source: skill
---

# Superseded Status, Consolidated_into, Loop_describe Cold Tier, MCP Connection Discoverability

## Overview

Closes 2 gap entries appended to `meta-state.jsonl` on 2026-06-05 (the same session this plan was scaffolded in), plus the underlying G8 supersede housekeeping that surfaced them. The 2 gaps are:

1. **Gap 1 (closed by Phases 1+2+3):** `loop_describe({ tier: 'cold' })` does not surface the lineage of superseded entries. After Phase 1+2 ships, 4 G8 finding entries will be `status: 'superseded'` with `consolidated_into: <change-log-id>`. Phase 3 exposes this lineage so agents can trace old findings to the canonical change-log without reading the registry directly.

2. **Gap 2 (closed by Phase 4):** The 5 SP0-SP3 tools (`meta_state_log_change`, `meta_state_derive_status`, `meta_state_check_grounding`, `meta_state_refresh_fingerprint`, `meta_state_query_drift`) are only reachable when the MCP server is connected to the agent's session. In a fresh session, a new surface, or any session where the gate init did not trigger MCP client connection, the agent falls back to direct file I/O via Node scripts, bypassing the canonical entry points. Phase 4 adds a Droid SessionStart hook that re-validates the MCP connection.

**Why TDD:** every phase touches a contract (status enum, drift filter, drift query output, cold-tier surface, hook firing logic). Tests-first locks the contract before any code changes. The 557 existing tests are the regression boundary; 17 new tests raise the bar to 574.

**Surface:** `meta` (loop's own machinery).

## Phase Structure (4 work phases + phase 0 scaffolding)

| Phase | Title | TDD Tests | Effort |
|-------|-------|-----------|--------|
| 0 | G8 7th-recurrence observation + plan scaffolding | 0 (scaffold only) | 0.5h |
| 1 | Option A: status enum + `consolidated_into` + `consolidates` + `session_id` + drift filter | 7 | 3h |
| 2 | Apply Option A to the 4 G8 finding entries (housekeeping) | 2 | 1h |
| 3 | `loop_describe({ tier: 'cold' })` lineage surface | 4 | 3h |
| 4 | Extend `loop-surface-inject.cjs` to log MCP-failure findings (1 file modify) | 3 | 2h |

**Total: 16 new tests, ~9.5h.**

## Locked Design Decisions (from brainstorm + operator scope)

The following 11 decisions are locked and will not change during cook:

1. **Phase scope:** Phase 1 ships the schema; Phase 2 applies to G8; Phase 3 surfaces in loop_describe; Phase 4 closes the MCP-connection gap. All in one plan because Phase 2 is a no-op without Phase 1, and Phase 3 is a no-op without Phase 2 (no `consolidated_into` data yet).
2. **Status enum value:** `"superseded"` (a new terminal status, distinct from `resolved` and `expired`).
3. **Semantics of `"superseded"`:** the entry is no longer the canonical source; the canonical source is the change-log referenced by `consolidated_into`. The underlying issue may or may not be fixed (in G8's case, it is NOT).
4. **Drift filter:** `computeIsDrift` treats `superseded` as terminal (returns `false` alongside `auto-resolved`/`expired`/`resolved`).
5. **Compaction:** `superseded` entries are compaction-eligible (alongside other terminal statuses) per the existing `TERMINAL_STATUSES` invariant in `core/meta-state.js`.
6. **`consolidated_into` field:** optional string on finding entries; value is the change-log entry's id. The new `consolidates` field on change-log entries is the inverse: optional string (comma-separated list of finding ids that the change-log consolidates). `supersedes` on change-logs is reserved for change-log-to-change-log lineage (singular, per existing schema description).
7. **G8 housekeeping:** mark the 4 finding entries (1st, 3rd, 4th, 5th recurrences) as `superseded` with `consolidated_into: meta-260605TXXXXZ-g8-subcommand-class-false-positive-consolidation`. Add the change-log with `consolidates: <4 ids>` (comma-separated). The change-log is the canonical source; the findings are audit trail.
8. **Loop_describe cold-tier surface:** when `tier: 'cold'`, surface all findings with `consolidated_into`, grouped by `consolidated_into`, with the referenced change-log entry as the header. Mirror the existing cold-tier structure (counts, tool list, findings summary) and add a new "Superseded Lineage" section.
9. **MCP connection hook (extending the existing one):** Droid `SessionStart` hook at `.factory/hooks/loop-surface-inject.cjs` already does a real MCP probe (spawn + initialize + tools/call). The gap is the failure-reporting. **This plan modifies the existing hook** to log a `meta_state_report` finding on failure (rather than silently exiting). The probe method is the existing spawn+initialize+call protocol — no new probe logic is added. On failure, the hook surfaces an operator-friendly banner.
10. **Idempotency:** the hook checks for an existing `meta_state_report` finding in the current session (matched by a new `session_id` field on the entry, optional); if present and not expired, skip the banner. The `session_id` is a Droid session id (available via env var or Droid hook context).
11. **Out of scope:** Phase 2 auto-mutation (captured in `260603-sp3-drift`'s Phase 2 stub); the G8 regex/allowlist fix itself (the plan's "superseded" status acknowledges the bug without fixing it; the actual fix is a separate plan, captured in the change-log's `reason` as "fix requires either: (a) regex qualifier, (b) subcommand-name allowlist"); MCP server re-connection logic (this plan surfaces the gap; reconnecting is the operator's job).

## Resolved Decisions (Pre-Plan Verification)

- **Q1 (operator):** "Add all 4 in a plan" → 4 work phases (1-4) plus phase 0 scaffolding. Confirmed.
- **Q2 (operator):** "Revert the 4 G8 entries" → done in 2026-06-05 cleanup session; meta-state is at 23 entries with the 4 G8 entries back to `status: 'expired'`. Phase 2 of this plan marks them `superseded` (not `resolved`); the change-log preserves the audit.
- **Q3 (operator):** G8 is empirically NOT fixed by mechanism (subcommand class still fires; verified in 2026-06-05 cleanup session). Phase 2 acknowledges this in the change-log's `reason` field, but does not fix the regex/allowlist. The actual fix is a separate plan.

## Out of Scope (Captured as Follow-Ups)

- **G8 regex/allowlist fix:** needs a separate brainstorm. The change-log entry's `reason` documents the fix paths (regex qualifier vs subcommand-name allowlist) so future plans can pick up.
- **MCP re-connection logic:** the hook surfaces the gap; reconnecting is the operator's responsibility. A future plan could add a `meta_state_mcp_reconnect` MCP tool, but YAGNI for now.
- **`session_id` field on meta-state entries:** Phase 4 adds this as an optional field. If the field is not present, the hook assumes a unique session and emits the banner unconditionally. This is conservative-correct; a future plan can tighten the idempotency check.

## Inbound State Acknowledgement

The 4 inbound-state-gate observations (`observation-vnstock-device-slot-ledger`, `observation-vnstock-import-reactivates-cleared-device`, `observation-vnstock-resource-budget`, `observation-vnstock-side-effect-import`) are **orthogonal** to this plan. They track the vnstock vendor's device-slot lifecycle (a `product/api` concern), not the meta-state machinery. No phase mutates them. The plan's scope is the `meta` surface.

## Whole-Plan Consistency Gate (Pre-Cook Sweep)

Stale terms to reconcile before recommending cook:
- "All 4" (operator message) vs. "4 work phases + 1 scaffolding phase" (this plan) → reconciled in Phase Structure table.
- "Session-id field" (Phase 4) vs. "no session-id in schema" (existing meta-state schema) → reconciled in Out of Scope; the field is optional and added in Phase 4 with schema update.

No unresolved contradictions as of plan creation.

## Validation Log

### Session 1 — 2026-06-05
**Trigger:** `/ck:plan validate` (operator chose after post-plan handoff).
**Questions asked:** 5 (4 initial + 1 follow-up deep-dive on MCP probe).
**Tier:** Standard (5 phases total; 4 work phases; 10 claims/phase verified).

#### Verification Results
- **Claims checked:** ~40 (10/phase across 4 work phases)
- **Verified:** 37 | **Failed:** 1 | **Unverified:** 2 (resolved via deep-dive)
- **Tier:** Standard
- **Failures (with resolution):**
  1. [Fact Checker] `tools/learning-loop-mcp/core/extract-index/index-entry-builder.js:47` and `core/extract-index/extract-index.js:240-241` confirm `superseded` is already a status name in the non-meta surface (extracted-assertion records), and `superseded_by` is already a field. **Resolution:** different surfaces; same name is semantically consistent. Operator accepted the overlap.
  2. [Contract Verifier] Phase 2's use of `supersedes` field for comma-separated list of finding ids. The schema documents `supersedes` as "ID of a previous change-log entry this one replaces" (singular). **Resolution:** add a new field `consolidates` to `metaStateChangeEntrySchema` for the comma-separated list; keep `supersedes` for change-log-to-change-log lineage. Operator accepted.
  3. [Fact Checker] The plan's Phase 4 proposed a NEW SessionStart hook at `.factory/coordination/hooks/mcp-connection-discoverability.cjs`. But the existing `.factory/hooks/loop-surface-inject.cjs` hook already spawns the MCP server, sends `initialize`, and calls `loop_describe({ tier: 'summary' })` — silently swallowing failures. **Resolution:** extend the existing hook to log a `meta_state_report` finding on failure rather than create a new hook. Operator accepted.
- **Unverified (resolved via deep-dive):**
  4. The plan's MCP probe method (option a: marker file) was based on assumption. Deep-dive revealed the existing hook already does option b (stdio ping). **Resolution:** use the existing hook's probe; extend it for error reporting.
  5. The plan's session_id field was proposed without a Droid hook context check. Deep-dive confirmed `input.hook_event_name` and `input.source` are available; session_id can be derived from Droid's session context (TBD during cook).

#### Questions & Answers

1. **[Architecture]** Phase 2 uses the change-log's `supersedes` field as a comma-separated list of finding IDs. The schema documents `supersedes` as singular. How should we resolve?
   - Options: Add a new `consolidates` field (keep `supersedes` for change-log-to-change-log lineage) | Update the schema description to allow dual purpose | Drop `supersedes` and use only `consolidated_into` (which is on the finding side)
   - **Answer:** Option A — add a new `consolidates` field for the comma-separated finding-id list; keep `supersedes` for change-log-to-change-log lineage.
   - **Rationale:** keeps the existing schema semantics intact; the new field has a single, clear purpose (multi-finding consolidation). Phase 1's schema additions grow by 1 line.
   - **Impact:** Phase 1: add `consolidates: z.string().optional()` to `metaStateChangeEntrySchema`; Phase 2: use `consolidates: G8_IDS.join(",")` on the change-log entry (and keep `supersedes` for any future change-log-to-change-log supersession).

2. **[Scope]** Operator said 'all 4' phases but the plan has 5 (phase 0 + 4 work). Is phase 0 needed?
   - **Answer:** Keep phase 0.
   - **Rationale:** matches the SP3 plan pattern; 0.5h is trivial; the G8 7th-recurrence change-log is a useful audit trail even when the recurrence is avoided.
   - **Impact:** none (plan unchanged).

3. **[Awareness]** `superseded` is already used in the non-meta index surface. Plan introduces the same status in meta-state. OK?
   - **Answer:** Accept the overlap.
   - **Rationale:** the two surfaces are independent; the name reuse is semantically consistent ("this entry is no longer canonical").
   - **Impact:** none (plan unchanged).

4. **[Architecture]** Phase 4's MCP probe method (after deep-dive).
   - **Deep-dive finding:** `.factory/hooks/loop-surface-inject.cjs` already does a real MCP probe (spawn + initialize + tools/call). The gap is the failure-reporting, not the probe itself.
   - **Answer:** Extend the existing hook.
   - **Rationale:** the probe is already implemented; extending it avoids duplicate work. One hook, one responsibility (now: inject + report on failure).
   - **Impact:** Phase 4 is now a 1-file MODIFY (not a 1-file CREATE). The new hook at `.factory/coordination/hooks/mcp-connection-discoverability.cjs` is removed. The implementation inlines the meta_state write call inside the existing hook's catch block.

5. **[Architecture]** (Follow-up to Q4) Where should the meta_state finding write call live?
   - **Answer:** Inline call inside the existing hook.
   - **Rationale:** keeps the change minimal; 1 file modify, 1 new responsibility (error reporting) added to the existing hook.
   - **Impact:** Phase 4's implementation sketch is now a 2-block diff in `loop-surface-inject.cjs`: (1) catch the spawnAndCall error; (2) call `writeEntry` + print banner.

#### Confirmed Decisions
- **Decision A:** Phase 2 uses a new `consolidates` field (not `supersedes`) for the comma-separated list of finding ids consolidated by a change-log.
- **Decision B:** Phase 0 stays; matches SP3 plan pattern.
- **Decision C:** `superseded` is reused in the meta-state surface; semantic overlap with the non-meta surface is accepted.
- **Decision D:** Phase 4 EXTENDS the existing `loop-surface-inject.cjs` hook (not a new hook).

#### Action Items
- [x] Update Phase 1 to add `consolidates: z.string().optional()` to `metaStateChangeEntrySchema`.
- [x] Update Phase 2 to use `consolidates: G8_IDS.join(",")` on the change-log entry.
- [x] Update Phase 4 to modify `.factory/hooks/loop-surface-inject.cjs` (not create a new hook).
- [x] Update plan.md "Touchpoints" section.
- [x] Run whole-plan consistency sweep.

#### Impact on Phases
- Phase 1: schema additions grow from 2 fields to 3 fields (`consolidated_into`, `session_id`, `consolidates`).
- Phase 2: change-log entry uses `consolidates` instead of `supersedes` for the finding-id list.
- Phase 3: no change (the new lineage surface is unaffected by the schema field-naming).
- Phase 4: simplified from "create new hook + add new field" to "modify existing hook + reuse existing field".

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-0-..., phase-1-..., phase-2-..., phase-3-..., phase-4-...
- Decision deltas checked: 5 (all from this validation session)
- Reconciled stale references: 5 (Phase 1 schema, Phase 1 title, Phase 2 change-log, Phase 2 overview, Phase 4 hook)
- Unresolved contradictions: 0

After the per-phase edits applied below:
- All references to `supersedes` for the multi-finding case are replaced with `consolidates` (Phase 1 schema, Phase 1 title, Phase 2 change-log, Phase 2 overview, Phase 2 test 1).
- The plan.md "Touchpoints" and "References" sections are updated to reflect the 1-file-modify on `.factory/hooks/loop-surface-inject.cjs`.
- The `session_id` field is now used by the inline hook (not a separate file) but the schema addition stays the same.
- Phase 1 test count: 6 → 7 (added change-log field roundtrip).
- Phase 4 test count: 5 → 3 (removed the 2 marker-file tests that are no longer applicable).
- Phase 4 effort: 4h → 2h (1 file modify vs. 1 file create + 1 file modify + helper).

## References

- `docs/philosophy.md` — "Evidence Is Source, Not Proof" (Pillar 3); meta-state as the loop's own audit log
- `docs/observation-vs-meta-state.md` — domain/meta/gate layer separation
- `docs/journals/260602-sp0-log-change-planning.md` — SP0's pattern for change-log entries (referenced in Phase 0)
- `plans/260602-strict-mcp-call-rules/plan.md` — Phase 4 hook pattern reference
- `plans/260603-sp3-drift/plan.md` — Phase 1-3 TDD pattern reference
- `tools/learning-loop-mcp/core/meta-state.js` — status enum + TERMINAL_STATUSES set + 3 new fields (`consolidated_into`, `consolidates`, `session_id`)
- `tools/learning-loop-mcp/core/query-drift.js` — computeIsDrift (Phase 1 update)
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` — cold-tier surface (Phase 3 update)
- `.factory/hooks/loop-surface-inject.cjs` — error reporting branch added (Phase 4 update)
- `meta-state.jsonl` — 23 entries (4 G8 expired + 2 gap entries + 17 others)
