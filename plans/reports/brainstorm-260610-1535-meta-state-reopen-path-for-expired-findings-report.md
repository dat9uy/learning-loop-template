---
type: brainstorm
date: 2026-06-10
slug: meta-state-reopen-path-for-expired-findings
status: approved
related_findings:
  - meta-260610T1504Z-reopen-path-for-expired-findings-is-unclear-the-immutable-pa
  - meta-260610T1458Z-next-session-target-fix-the-mcp-wire-format-coercion-bug-blo
  - meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g
related_tools:
  - meta_state_report
  - meta_state_resolve
  - meta_state_patch
  - meta_state_relationships
  - meta_state_supersede
related_files:
  - tools/learning-loop-mcp/core/meta-state.js
  - tools/learning-loop-mcp/tools/meta-state-resolve-tool.js
  - tools/learning-loop-mcp/tools/meta-state-patch-tool.js
  - tools/learning-loop-mcp/core/loop-introspect.js
  - tools/learning-loop-mcp/__tests__/build-inverse-indexes.test.js
  - docs/trajectory.md
---

# Brainstorm: Reopen Path for Expired Meta-State Findings

## Problem Statement

Expired meta-state findings (status `expired`, TTL elapsed without operator ack) have no clean reopen path. The current architecture treats `expired` as a terminal status, blocking transitions to `active` or `resolved`. The operator's empirical trigger (2026-06-10) was a `meta_state_patch` attempt to flip an `expired` entry back to `active`: the patch-tool's `IMMUTABLE_PATCH_FIELDS` deny-list rejected the `null` resets of `resolved_at` / `resolved_by` / `acked_at` as `immutable_field`, and the tool's error response did not enumerate the full deny-list, forcing a trial-and-error discovery cycle.

The second-order problem: even when an operator files a new finding to re-surface the issue (the workaround in the original case — `meta-260610T1458Z-...` was filed to re-flag the wire-format bug from `meta-260606T2202Z-...`), there is no machine-readable relationship between the new finding and the expired one. The cold-tier query cannot distinguish "auto-resolved and stayed that way" from "auto-resolved and re-surfaced by a new entry."

## Trigger & Concrete Case

- **Original:** `meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g` (status `expired`, `resolved_by: auto-resolve` at 2026-06-08T01:11Z).
- **Workaround filed:** `meta-260610T1458Z-next-session-target-fix-the-mcp-wire-format-coercion-bug-blo` (status `reported`, no back-pointer).
- **Doc-of-the-gap:** `meta-260610T1504Z-reopen-path-for-expired-findings-is-unclear-the-immutable-pa` (status `reported`, the finding this brainstorm resolves).

## Discovery (Extracted from Discussion)

| Item | Concrete Value |
|------|----------------|
| **Expected output** | 1) New optional `reopens: [string]` field on `metaStateEntrySchema`; 2) `reopens_inverse` map in `buildInverseIndexes`; 3) `cascade_from` parameter on `meta_state_resolve`; 4) `immutable_fields` returned in patch errors; 5) one `DISCOVERABILITY_HINTS` line; 6) backfill `meta-260610T1458Z-...` with `reopens: ["meta-260606T2202Z-..."]`. |
| **Acceptance criteria** | (a) New `reopens` field passes zod + cold-tier regression; (b) inverse map surfaces in `meta_state_relationships` inbound query; (c) `meta_state_resolve({id: expired_id, cascade_from: [child_id]})` transitions to `resolved`; (d) patch error response includes the full `IMMUTABLE_PATCH_FIELDS` list; (e) `meta-260610T1458Z-...` is queryable as "reopens `meta-260606T2202Z-...`"; (f) existing tests still pass. |
| **Scope boundary** | Out of scope this round: re-parking or un-parking SQLite, re-running the wire-format coercion fix (`meta-260610T1458Z-...` body), adding new statuses (`reinstated`, `reopened`), `meta_state_ack` cascade symmetry, batch cascade tool. |
| **Non-negotiable constraints** | (i) Storage layer unchanged — JSONL remains the only writer; (ii) no new entry kinds; (iii) deny-list on identity/audit-trail fields stays intact (it's a feature, not a bug); (iv) operator gate on `meta_state_resolve` cascades unchanged; (v) backward-compatible: existing entries without `reopens` must validate. |
| **Touchpoints** | `core/meta-state.js` (schema + maybe inverse builder), `core/loop-introspect.js` (inverse builder + hint), `tools/meta-state-resolve-tool.js` (cascade), `tools/meta-state-patch-tool.js` (error response), `__tests__/build-inverse-indexes.test.js` (5-map expectation), `docs/trajectory.md` (new baseline: 5 maps). |

## Evaluated Approaches

### Option A: Reuse `stale` status for expired findings

- **Pros:** Reuses an existing status. No new field.
- **Cons:** `stale` semantics = "re-verifiable via `meta_state_re_verify`" — requires `verification.steps`. Most findings (especially loop-anti-patterns) have no spec → can't actually be re-verified → `stale` becomes a misleading label. Doesn't add the trigger relationship.
- **Verdict:** Rejected. Semantics wrong, doesn't solve the relationship problem.

### Option B: New `reinstated` status + new `meta_state_reinstate` tool

- **Pros:** Clean status diagram. Explicit, atomic.
- **Cons:** Adds a 6th active status to maintain. Doesn't capture the trigger relationship in the status itself. More code, more state machine, no new information vs. Option C. Duplicates the close-stamp fields (`reinstated_at`, `reinstated_by`, `reinstated_reason`) that the existing `acked_at` / `resolved_at` fields already serve.
- **Verdict:** Rejected. YAGNI — the existing `active` status works fine post-reopen; the only gap is the link field, not the status.

### Option C: New finding + `reopens` field + `cascade_from` resolve extension (Recommended)

- **Pros:** Storage-agnostic, handler-layer change only. Symmetric with existing `addresses` (loop-design) and `supersedes` (change-log) — three siblings, one shape. Reuses `active` post-reopen (no new status). Reuses the existing `meta_state_resolve` tool with one new parameter (no new tool). Audit trail accurate: the original TTL event stays in history; the resolve event is fresh; the cascade trigger is queryable. Inverse-index addition is a constant factor, not a complexity shift. SQLite-ready by construction (JSONL or relational — same shape).
- **Cons:** Adds a 5th inverse map to the cold-tier test (4 → 5). Requires the operator to remember to set `reopens` on the new finding — mitigated by `DISCOVERABILITY_HINTS`.
- **Verdict:** Selected. All 5 predict personas aligned GO. Honest trade-off: 5-map build, 1 new field, 1 new tool parameter, 1 hint, 1 discoverability fix.

### Option D: Loosen the `IMMUTABLE_PATCH_FIELDS` deny-list

- **Pros:** Direct fix for the operator's specific error.
- **Cons:** Conflates two distinct events (TTL kill vs. operator closure). Loses the audit-trail value of "this entry was auto-resolved on date X" — the resolve stamps become rewritable, the close event becomes mutable. Devil's advocate: opens the door to a class of "rewrite the audit trail" bugs.
- **Verdict:** Rejected. The deny-list is a feature. The fix is in the docs, not the deny-list.

## Final Recommended Solution (Option C)

Six atomic changes, in dependency order:

1. **Schema:** add `reopens: z.array(z.string()).optional()` to `metaStateEntrySchema` in `core/meta-state.js` (region around line 60). One field, symmetric with `addresses`. JSDoc: "Finding ids whose `expired` lifecycle this entry re-surfaces. Use when a new finding re-flags an issue that was auto-resolved by TTL. Cascade-resolve the parent via `meta_state_resolve({id: parent, cascade_from: [this_id]})`."

2. **Inverse-index:** add `reopens_inverse` to `buildInverseIndexes` in `core/loop-introspect.js:250`. Mirror the `addresses_inverse` branch. Surface in `meta_state_relationships` inbound query — `meta_state_relationships({id: old_expired_id, direction: "inbound"})` returns the new reopen entries.

3. **Cascade resolve:** extend `meta_state_resolve` with `cascade_from: z.array(z.string()).optional()`. When provided AND `entry.status === "expired"`: validate each child exists, has `reopens: [old_id]`, and is `active` or `resolved`. On success, stamp `resolved_at` + `resolved_by` + new `cascade_resolved_by: child_ids`. On failure, return `{resolved: false, reason: "cascade_child_not_found" | "cascade_child_not_reopening" | "cascade_child_unresolved", missing_ids?: [...]}`. Same operator-gate as the base tool. Mirror shape with `meta_state_supersede`'s `consolidated_into_not_a_change_log` error.

4. **Patch-tool discoverability:** add `immutable_fields: [...IMMUTABLE_PATCH_FIELDS]` to the `{patched: false, reason: "immutable_field"}` response, alongside existing `denied_fields`. Operator can enumerate the deny-list in one call, no trial-and-error.

5. **Hint:** add one line to `DISCOVERABILITY_HINTS` in `core/loop-introspect.js`: "For reopens, set `reopens: ['<old_expired_id>']` on the new finding at report time. Cascade-resolve the parent via `meta_state_resolve({id: old_id, cascade_from: [child_id]})`." Position: same family as A4 (canonical tool preference) and A5 (4-layer role split).

6. **Backfill:** use `meta_state_patch` to set `reopens: ["meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g"]` on `meta-260610T1458Z-...`. Order: schema-first (steps 1-5), then backfill (step 6), then ack.

## Resolved Design Questions (operator-confirmed)

| # | Question | Resolution |
|---|----------|------------|
| 1 | `reopens` cardinality | One-to-many. `reopens: [old_id, ...]` on the new entry. Old stays untouched. |
| 2 | Cascade direction | Originate from parent. The parent (stuck in `expired`) carries `cascade_from: [child_id]`. Child resolves normally. Audit trail one-directional. |
| 3 | Multi-parent cascade | Operator calls `meta_state_resolve` once per parent with the same `cascade_from: [child_id]`. No batch tool needed. |
| 4 | `meta_state_ack` cascade | NO. Parent stays `expired` until child is `resolved`. Don't conflate ack and resolve cascades. |
| 5 | SQLite readiness | NO CHANGES to recommendation. Pre-conditions un-tripped. New `reopens` field is JSONL/relational symmetric. |

## Implementation Considerations

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Cold-tier regression test expects exactly 4 maps | Low | Update test to expect 5 (`reopens_inverse` is the 5th). |
| `cascade_from` references missing child | Low | Hard error with `missing_ids`. Mirror `supersede` error shape. |
| Cascade before child is resolved | Low | Reject with `cascade_child_unresolved` if child status is `reported`/`expired`. |
| Backfill before schema accepts `reopens` | Medium | Order: schema → inverse → cascade → patch → hint → backfill → ack. |
| Inverse-index cache staleness | Low | `read-registry-cache.js` invalidates on every `updateEntry`; new field writes invalidate. |
| Operator gate bypassed by `cascade_from` | Low | `meta_state_resolve` is operator-gated; the new parameter narrows the path, doesn't widen it. |

### Test Strategy

- Unit: `__tests__/build-inverse-indexes.test.js` — expect 5 maps.
- Unit: `__tests__/meta-state-resolve-cascade.test.js` (new) — happy path, missing child, unresolved child, wrong reopens target.
- Unit: `__tests__/meta-state-patch-immutable-fields.test.js` (new) — error response includes `immutable_fields`.
- Integration: `meta_state_relationships({id: meta-260606T2202Z-..., direction: "inbound"})` returns `meta-260610T1458Z-...` after backfill.
- Cold-tier: `__tests__/cold-tier-regression.test.js` — schema map count assertion.

### Order of Operations

1. Schema (step 1) — gates all subsequent work.
2. Inverse builder + cold-tier test (steps 2 + 1 of test strategy).
3. Cascade resolve + test (step 3 + 2 of test strategy).
4. Patch-tool error + test (step 4 + 3 of test strategy).
5. Hint (step 5).
6. Backfill (step 6).
7. Ack `meta-260610T1504Z-...` (the gap-doc) and `meta-260610T1458Z-...` (the reopen target) → both → `active`.
8. Promote `meta-260610T1504Z-...` to a rule? — **Not this round**. The deny-list is documented and discoverable; no enforcement gap. (Optional follow-up if reopen recurs frequently.)

## Success Metrics

| Metric | Target | How to verify |
|--------|--------|---------------|
| Cold-tier build time | <10ms at 500 entries | `loop_describe` warm-tier latency |
| Inverse-map count | 5 (was 4) | `__tests__/build-inverse-indexes.test.js` |
| Reopen path discoverable | One patch attempt suffices | Cold-session regression test (operator simulates: find reopen gap, follow hint, execute, succeed) |
| Audit trail accurate | `cascade_resolved_by` populated when cascade used | `meta_state_list({entry_kind: "finding", status: "resolved"})` shows `cascade_resolved_by` field |
| Test coverage | All new branches covered | `pnpm test` exits 0; no `--passWithNoTests` |
| No regressions | Existing tests pass | `pnpm test` green |

## Next Steps (Post-Approval)

1. **Hand off to `/ck:plan`** — produce a phase-by-phase implementation plan with the order of operations above as the spine. TDD mode (lock behavior first via tests, then implement).
2. **Track via plan directory** — `plans/260610-1535-meta-state-reopen-path/` with phase files matching the 6 steps.
3. **Close the trigger finding** — `meta-260610T1504Z-...` becomes `resolved` with `resolution: "superseded by 260610-1535 plan"` after implementation. The reopen target `meta-260610T1458Z-...` gets acked and remains `active` until the wire-format fix ships (separate work).
4. **Trajectory baseline update** — see `docs/trajectory.md` change below.

## Trajectory Doc Update (5th map)

The trajectory's storage-layer section should be updated to reflect the new baseline: 5 inverse maps, 1 new optional field (`reopens`), 1 new tool parameter (`cascade_from` on `meta_state_resolve`). The pre-conditions for SQLite remain un-tripped.

---

**Status:** APPROVED (operator confirmed all 6 recommendations + 3 unresolved-question resolutions)
**Summary:** Reopen path for expired findings via 1 new field + 1 new tool parameter + 2 discoverability fixes. Storage-agnostic. SQLite-ready by construction.
**Next action:** Hand off to `/ck:plan --tdd` for implementation phasing.
