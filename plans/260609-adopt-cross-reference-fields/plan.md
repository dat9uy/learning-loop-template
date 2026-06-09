---
title: Adopt loop-design-cross-reference-fields (shipped)
description: >-
  Bookkeeping closeout: backfill proposed_design_for on the design entry, mark
  shipped, resolve the next-up finding, file a change-log, journal. Closes
  meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-... before
  its 24h TTL flips to status=stale (expires_at 2026-06-10T14:02:41.798Z).
status: completed
priority: P2
branch: main
tags:
  - meta-only
  - bookkeeping
  - no-code
blockedBy: []
blocks: []
created: '2026-06-09T14:48:29.668Z'
createdBy: 'ck:plan'
source: skill
---

# Adopt loop-design-cross-reference-fields (shipped)

## Overview

The loop-design `loop-design-cross-reference-fields` (v6, active since 2026-06-06) proposed typed cross-reference fields (`proposed_design_for` + `addresses`) on the rule/loop-design schemas. The motivation has already shipped via 3 deliveries: (a) the 4-kind discriminated union change-log `meta-260606T2055Z-...` added the fields + the relationships traversal tool; (b) `meta-260608T1258Z-...` (plan `260608-1015-meta-state-patch-tool-and-wire-format-fix`) shipped `meta_state_patch`, closing the CRUD-coverage gap that made the fields operationally useful.

The remaining work is bookkeeping: backfill `proposed_design_for` on the design entry, flip `status: active → inactive`, set `shipped_in_plan` + `shipped_at`, resolve the next-up finding via the canonical ack → check_grounding → refresh_fingerprint → resolve path, file a ship change-log, journal.

No code changes. All mutations go through MCP tools. No `node -e` escape-hatch usage. The `meta-260606T2102Z-agent-used-direct-file-i-o-...` finding stays clean.

## Why Now (TTL pressure)

`checkExpiry` in `tools/learning-loop-mcp/core/meta-state.js:484` transitions `status: reported` past `expires_at: 2026-06-10T14:02:41.798Z` to `status: stale` (non-terminal per the stale-flag redesign, but degrades the next-up signal to "re-verify, not adopt"). The post-stale-flag cold-tier regression test surfaces stale next-ups as needs-attention. Inaction is materially worse than resolving.

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Mutations](./phase-01-mutations.md) | Pending | Completed |
| 2 | [Verification](./phase-02-verification.md) | Pending | Completed |
| 3 | [Closeout](./phase-03-closeout.md) | Pending | Completed |

## Dependencies

- Blocked by: nothing. Both upstream plans (`260608-1015`, `260609-stale-flag-redesign`) are completed.
- Blocks: nothing.

## Brainstorm Reference

This plan is the handoff from the brainstorm that established the framing. The 3 key decisions made during brainstorm:

1. **Framing**: Close the next-up finding as 'shipped' (not extend, not defer).
2. **proposed_design_for set**: Minimal 2-entry set: `meta-260606T2055Z-...` (4-kind union ship) and `meta-260608T1258Z-...` (meta_state_patch ship). The relationships tool ships inside the 4-kind union change-log and is not a separate entry.
3. **Status mechanism**: `status: inactive` + `shipped_in_plan` field (matches the cold-tier surface already implemented in the 4-kind union change-log's `change_diff.added` list).

## Related Code Files

- Modify: `meta-state.jsonl#loop-design-cross-reference-fields` (1 line, via `meta_state_patch`)
- Modify: `meta-state.jsonl#meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-...` (1 line, via `meta_state_resolve`)
- Append: `meta-state.jsonl` (1 ship change-log, via `meta_state_log_change`)
- Create: `docs/journals/260609-adopt-cross-reference-fields-closeout.md`

## Touchpoints (MCP tools only)

- `meta_state_patch` — backfill `proposed_design_for` + status flip on the design entry (CAS via `_expected_version`)
- `meta_state_ack` — promote the next-up finding from `reported` to `active` (required before `meta_state_resolve`)
- `meta_state_check_grounding` — verify the next-up finding's `evidence_code_ref` still resolves
- `meta_state_refresh_fingerprint` — re-compute SHA-256 if check_grounding reports drift
- `meta_state_resolve` — close the next-up finding (consults `rule-no-orphaned-evidence`)
- `meta_state_log_change` — append the ship change-log
- `meta_state_derive_status` — post-ship drift check on the design entry
- `meta_state_list` — read-back verification

## Success Criteria (overall)

- [ ] `meta_state_list({ entry_kind: "loop-design", id: "loop-design-cross-reference-fields" })` returns `status: "inactive"`, `proposed_design_for: ["meta-260606T2055Z-...", "meta-260608T1258Z-..."]`, `shipped_in_plan: "plans/260609-adopt-cross-reference-fields/"`, `shipped_at: <ISO>`, `version: 8` (baseline 6 + 2 patches).
- [ ] Next-up finding `meta-260609T2102Z-...` has `status: "resolved"`, `resolved_by: "plan:260609-adopt-cross-reference-fields"`.
- [ ] Ship change-log exists with `change_target: "meta-state.jsonl#loop-design-cross-reference-fields"`, `consolidates: "meta-260609T2102Z-next-up-adopt-loop-design-cross-reference-fields-status-acti"` (single string per `metaStateChangeEntrySchema`).
- [ ] `meta_state_derive_status({ id: "loop-design-cross-reference-fields" })` returns `derived_status: "active-uncertain"` and `drift: false`.
- [ ] `pnpm check` passes (898/898 tests + validation).
- [ ] Zero direct file I/O to `meta-state.jsonl` (only MCP tools).
- [ ] Journal `docs/journals/260609-adopt-cross-reference-fields-closeout.md` written.

## Out of Scope (YAGNI)

- The sibling next-up finding `meta-260609T2102Z-next-up-adopt-loop-design-instruction-layer-...` (different design, different session, 3-option decision still open).
- New cross-reference fields (e.g., `supersedes_design`).
- Validating that `addresses` / `proposed_design_for` entries point at existing entries.
- Batch-backfilling the 3 other loop-designs / rules with proper `proposed_design_for` refs.
- Any code change.

## Risk Assessment

- **Risk**: 24h TTL elapses between phases. **Mitigation**: each phase is <30 min; do all mutations in one session.
- **Risk**: `meta_state_resolve` consult-gate `rule-no-orphaned-evidence` blocks on a stale `code_fingerprint` (per the `rule-no-orphaned-evidence` consult-gate). **Mitigation**: run `meta_state_check_grounding` + `meta_state_refresh_fingerprint` if drifted before `meta_state_resolve`. The next-up finding's `evidence_code_ref` is `tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema` which is stable; drift is unlikely.
- **Risk**: Agent attempts `node -e` escape hatch. **Mitigation**: AGENTS.md canonical-rule reminder; the plan explicitly forbids it; the `meta-260606T2102Z` finding stays clean as a check.

## Validation Log

### Session 1 — 2026-06-09
**Trigger:** Post-creation `/ck:plan validate` on `plans/260609-adopt-cross-reference-fields/`. Standard tier (3 phases, Fact Checker + Contract Verifier, 10 claims/phase, 30 total).
**Questions asked:** TBD (in progress)

#### Verification Results (Standard tier, 30 claims sampled)
- **Claims checked:** 30 (10/phase)
- **Verified:** 22 | **Failed:** 4 | **Unverified:** 4

#### Failures
1. **[Fact Checker, Phase 1]** `meta_state_patch` response shape — plan asserts `{updated: true, version: 7}`; actual: `{patched: true, version, ...}` (per `tools/learning-loop-mcp/tools/meta-state-patch-tool.js:131`).
2. **[Fact Checker, Phase 1 + 2]** `consolidates` field type — plan passes an array `["meta-260609T2102Z-..."]`; actual: `z.string().optional()` (single value) per `tools/learning-loop-mcp/core/meta-state.js:104`. The change-log mutation will fail Zod validation if invoked as written.
3. **[Fact Checker, Phase 1]** `meta_state_log_change` id format — plan asserts "id starting with `meta-260609T...`"; actual: `meta-{YYMMDD}T{HHmm}Z-{slugify(change_target)}` — id is timestamp-prefixed, but slug is `meta-state-jsonl-loop-design-cross-reference-fields` (no loop-design prefix, no kebab-case dot in the path). Plan claim was approximate in spirit but the exact id string is different.
4. **[Fact Checker, Phase 2]** Step 2.6 `git diff meta-state.jsonl` empty — plan asserts empty; actual: the file is mutated by 4 MCP-tool writes (2 patches + 1 resolve + 1 log_change), so the diff is non-empty. The plan's intent (no agent-edited lines outside the 4 expected mutations) is correct but the assertion text is wrong.

#### Unresolved (deferred to interview)
- [Contract Verifier, Phase 2] `meta_state_derive_status` "shipped-flavored" assertion — the tool returns a fixed enum `["resolved-by-mechanism", "active-uncertain", "active-no-signal", "unknown"]`. For the design entry (status=inactive, code-only), the result will be `active-uncertain` (kind=code-only). Plan's "shipped-flavored" is hand-wavy; needs concrete assertion.
- [Fact Checker, Phase 3] `ck plan check` CLI behavior — assumed yes; runtime confirmation deferred to execution.
- [Fact Checker, Phase 3] post-closeout `meta_state_list` filter combinations — assumed yes (per the 4-kind union change-log).
- [Fact Checker, Phase 3] journal path `docs/journals/260609-adopt-cross-reference-fields-closeout.md` — directory exists; the file is novel.

#### Interview questions (pending)
- Q1: `consolidates` field shape (single string vs array) — the schema is `z.string().optional()`. This plan only consolidates 1 finding, so the single-string form is natural. Confirm.
- Q2: Step 2.6 assertion — relax "git diff empty" to "git diff matches 3 expected mutations" (1 patch write shows the new fields, 1 patch write shows the status flip, 1 append shows the change-log).
- Q3: Step 2.4 `derive_status` assertion — pin to a concrete value (likely `active-uncertain` with `drift: false`) instead of "shipped-flavored".

#### Impact on Phases (to be propagated)
- Phase 1: change `consolidates` value from array literal to single string.
- Phase 1 + 2: change `{updated: true}` to `{patched: true}` in success criteria text.
- Phase 2: rewrite Step 2.4 + 2.6 assertions.

#### Questions & Answers

1. **[Tradeoff, Q1]** `consolidates` field shape — schema is `z.string().optional()` (single value), plan passed an array.
   - Options: A) single-string form | B) 2 separate change-logs | C) `supersedes` field (wrong) | D) defer
   - **Answer:** A (single-string form)
   - **Rationale:** Minimal change; this plan only consolidates 1 finding.

2. **[Assumption, Q2]** Step 2.6 `git diff` assertion — the 4 mutations produce a non-empty diff.
   - Options: A) "matches 4 expected mutations" | B) line-number-pinned | C) drop | D) per-entry JSON diff
   - **Answer:** A ("matches 4 expected mutations, no others")
   - **Rationale:** Most pragmatic; preserves the escape-hatch defense layer.

3. **[Assumption, Q3]** Step 2.4 `derive_status` assertion — the tool returns a fixed enum, not a "shipped-flavored" concept.
   - Options: A) pin to `active-uncertain` + `drift: false` | B) only `drift: false` | C) drop | D) wrong (skip)
   - **Answer:** A (pin to `active-uncertain` + `drift: false`)
   - **Rationale:** The design is still code-grounded (file unchanged); the inactive transition is in `raw_status`, not `derived_status`. Drift=false confirms the file is unchanged.

#### Confirmed Decisions
- `consolidates` is a single string (not array).
- Step 2.6 asserts "exactly 4 expected mutations" (not "empty diff").
- Step 2.4 asserts `derived_status === "active-uncertain"` AND `drift === false`.

#### Action Items
- [x] Phase 1 Step 1.2 + 1.3: `{updated: true}` → `{patched: true}` (propagated).
- [x] Phase 1 Step 1.7: `consolidates` array → single string (propagated).
- [x] Phase 1 success criteria: `version: 7`/`8` text aligned with `patched: true` (propagated).
- [x] Phase 2 Step 2.3: `consolidates` array assertion → single string (propagated).
- [x] Phase 2 Step 2.4: `derived_status` "shipped-flavored" → `active-uncertain` + `drift: false` (propagated).
- [x] Phase 2 Step 2.6: "git diff empty" → "exactly 4 expected mutations" (propagated).
- [x] Phase 2 success criteria: aligned (propagated).

#### Impact on Phases
- Phase 1: 4 edits (consolidates shape + patched: true + success criteria).
- Phase 2: 4 edits (consolidates shape + derive_status + diff assertion + success criteria).
- Phase 3: 1 edit (Step 3.1 narrative updated for the consolidates single-string form).

### Whole-Plan Consistency Sweep
- **Files reread:** plan.md, phase-01-mutations.md, phase-02-verification.md, phase-03-closeout.md
- **Decision deltas checked:** 3 (consolidates shape, `updated: true` → `patched: true`, derive_status pin)
- **Reconciled stale references:** 6 (2 in plan.md success criteria, 1 in plan.md derive_status criterion, 1 in phase-03 Step 3.1 narrative, 2 cross-references in plan.md + phase-02 success criteria that mentioned the old shape — all updated)
- **Unresolved contradictions:** 0

The 3 remaining grep matches for `updated: true` and `consolidates: [` inside the Validation Log are intentional audit-trail evidence (preserved verbatim to record the original verification finding + the action item that resolved it). The 1 remaining `"shipped"` mention is inside the action-item list describing the action, not a stale claim.

Plan is consistent and ready for cooking.
