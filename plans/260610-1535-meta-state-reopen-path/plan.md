---
title: "Reopen path for expired meta-state findings"
description: "Reopen path for expired meta-state findings via 1 new field (reopens) + 1 new tool parameter (cascade_from) + 2 discoverability fixes. Storage-agnostic. SQLite-ready by construction. 4 maps → 5 inverse maps. No new entry kinds."
status: pending
priority: P2
branch: "main"
tags: ["meta-state", "mcp-tools", "discoverability", "tdd"]
blockedBy: []
blocks: []
created: "2026-06-10T09:18:13.902Z"
createdBy: "ck:plan"
source: skill
---

# Reopen path for expired meta-state findings

## Overview

Expired meta-state findings (`status: "expired"`, TTL elapsed without operator ack) have no clean reopen path. The deny-list on `IMMUTABLE_PATCH_FIELDS` rejects the `null` reset of `acked_at` / `resolved_at`, and even when an operator files a new finding to re-surface the issue, the cold-tier query cannot distinguish "auto-resolved and stayed" from "auto-resolved and re-surfaced by a new entry." Approved brainstorm: `plans/reports/brainstorm-260610-1535-meta-state-reopen-path-for-expired-findings-report.md` (status: APPROVED, 6 atomic changes, 5 design questions resolved).

**6 atomic changes (Option C from brainstorm)**:
1. Schema: `reopens: z.array(z.string()).optional()` on `metaStateFindingEntrySchema`.
2. Inverse-index: `reopens_inverse` map → 4 → 5.
3. Cascade resolve: `cascade_from` parameter on `meta_state_resolve`.
4. Patch error: `immutable_fields: [...IMMUTABLE_PATCH_FIELDS]` in error response.
5. Hint: one new line in `DISCOVERABILITY_HINTS`.
6. Backfill: set `reopens: [...]` on the existing reopen-target entry via `meta_state_patch`.

**Reference**: `plans/reports/brainstorm-260610-1535-meta-state-reopen-path-for-expired-findings-report.md`

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Schema + Inverse + cold-tier (TDD)](./phase-01-schema-inverse.md) | Pending | 1.5h |
| 2 | [Cascade resolve + cascade test (TDD)](./phase-02-cascade-resolve.md) | Pending | 2.5h |
| 3 | [Patch error discoverability + test (TDD)](./phase-03-patch-error-discoverability.md) | Pending | 0.75h |
| 4 | [Hint + backfill + ack + journal](./phase-04-hint-backfill-ack.md) | Pending | 1h |

## Touchpoints (canonical, from brainstorm §Final Recommended Solution)

- `tools/learning-loop-mcp/core/meta-state.js` — schema field on `metaStateFindingEntrySchema` (+5 lines)
- `tools/learning-loop-mcp/core/loop-introspect.js` — `reopens_inverse` branch in `buildInverseIndexes` (+8 lines); `reopens_inverse` in `buildRegistrySummary` citation-count loop (+1 line); one new entry in `DISCOVERABILITY_HINTS` (+1 line)
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` — `reopens_inverse: Object.fromEntries(...)` in cold-tier payload (+1 line)
- `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` — `cascade_from` parameter; special-case the `TERMINAL_STATUSES` early-rejection (allow `expired + cascade_from` through); insert cascade branch AFTER operator gate (line 100.5); error shape mirrors `meta_state_supersede` (+~50 lines)
- `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js` — `reopened_by` inbound key (+3 lines)
- `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` — `immutable_fields` in error response; export `IMMUTABLE_PATCH_FIELDS` Set for test reuse (+2 lines, +1 export)
- `__tests__/build-inverse-indexes.test.js` — 4→5 maps, fixture + assertions (+5 lines)
- `__tests__/cold-tier-regression.test.js` — line 35 iteration: 4→5 maps (+1 line)
- `__tests__/meta-state-relationships.test.js` — extend with `reopened_by` inbound query test (+15 lines)
- `__tests__/meta-state-schema.test.js` — extend with `reopens` field accepts/rejects (+10 lines)
- `__tests__/meta-state-resolve-cascade.test.js` (new) — 7 scenarios (~120 lines)
- `__tests__/meta-state-patch-immutable-fields.test.js` (new) — full deny-list assertion (~25 lines)
- `__tests__/cold-session-discoverability.test.cjs` — line 441 hint count: 8→9 (+1 line)
- `__tests__/meta-state-reopen-backfill-integration.test.js` (new, gated) — real-registry integration (~20 lines)
- `docs/trajectory.md` — storage-layer section: 5 maps baseline (update text only)

**Total**: ~280 lines added, 6 files modified, 4 files added, 0 new dependencies.

## Constraints (non-negotiable, from brainstorm §Non-negotiable constraints)

1. **Storage layer unchanged** — JSONL remains the only writer; no SQLite migration.
2. **No new entry kinds** — only the `finding` branch gets the new `reopens` field.
3. **Deny-list on identity/audit-trail fields stays intact** — it's a feature, not a bug; only the error response shape changes.
4. **Operator gate on `meta_state_resolve` cascades unchanged** — cascade branch must run AFTER the existing `resolution-evidence-required` rule consultation (lines 67-100), so operators can't bypass the gate via cascade.
5. **Backward-compatible** — existing entries without `reopens` must validate (`.optional()` on the zod schema; passthrough on the patch schema).

## Out of scope (per brainstorm §Scope boundary)

- Re-parking or un-parking SQLite
- Re-running the wire-format coercion fix (separate work tracked by `meta-260610T1458Z-...`)
- Adding new statuses (`reinstated`, `reopened`)
- `meta_state_ack` cascade symmetry
- Batch cascade tool
- Surfacing `reopens` in the `summarize` compact view (YAGNI for this round; can be added later as a 1-line change at `core/loop-introspect.js:392`)

## Plan-time decisions (locked)

| Question | Resolution | Source |
|----------|------------|--------|
| Schema target | `metaStateFindingEntrySchema` (not the union) | Researcher A finding A |
| Cascade branch placement | After `resolution-evidence-required` rules (line 100), before `now = ...` (line 102). Cascade runs AFTER the operator gate to preserve it. | Researcher A blocker C |
| Terminal status check special case | The `TERMINAL_STATUSES` early-rejection (line 49-64) is special-cased: `expired` + `cascade_from` is allowed through so the cascade can be reached. `auto-resolved` and `resolved` still reject cascade. Implementation: `if (TERMINAL_STATUSES.has(entry.status) && !(entry.status === "expired" && cascade_from?.length > 0))`. | Researcher A blocker C |
| Cascade child status allowlist | `active` or `resolved` only (per brainstorm line 83). `superseded` rejected with `cascade_child_unresolved`. Document the rationale. | Brainstorm + Researcher A |
| Cascade non-expired parent + cascade_from provided | Fall through to normal resolution (cascade_from is ignored). Matches brainstorm "When provided AND entry.status === 'expired'" gating language. | Researcher B scenario 5 |
| Error shape extensions | `missing_ids?` (not found), `bad_children?` (not reopening OR unresolved) for clear debugging. Mirror `meta_state_supersede`. | Researcher A blocker C |
| Hint position | Insert at line 96 (after the 6 statuses hint at line 95, before the rule/loop-design lifecycle hint at line 96). Operational family. | Researcher B §E |
| Hint content | `"For reopens: set reopens: ['<old_expired_id>'] on the new finding at report time, then cascade-resolve the parent via meta_state_resolve({id: old_id, cascade_from: [child_id]})."` (161 chars) | Researcher B §E |
| `DISCOVERABILITY_HINTS` mutation | Rebuild the array (re-`Object.freeze`) — do not `.push()` on a frozen array. | Researcher A required fix E |
| `IMMUTABLE_PATCH_FIELDS` export | Export the Set from `meta-state-patch-tool.js` so the new test can import the same source of truth. | Researcher B §D |
| `summarize` `reopens` field | YAGNI; not in this round. | Brainstorm scope boundary |
| Backfill integration test gate | `if (process.env.SKIP_REAL_REGISTRY_TESTS !== "1") return;` early-exit; runs only when operator opts in. | Researcher B §F |

## Risks (per brainstorm §Implementation Considerations + researchers' findings)

- **Cascade `superseded` child rejected** — operator must un-supersede first. **Mitigation**: documented in `cascade_from` JSDoc + this plan's Decision log.
- **Backfill before schema accepts `reopens`** — **Mitigation**: Phase 4 runs after all schema changes; backfill is the LAST step.
- **Operator gate bypassed by cascade** — **Mitigation**: cascade branch runs AFTER `resolution-evidence-required` rule consultation (line 100), preserving the gate.
- **JSONL compaction race** — parent in `expired` compacted during cascade (TOCTOU). **Mitigation**: cascade runs under the same `enqueue` lock as `updateEntry`; compaction is in `updateEntry`. Race-free.
- **`metaStateBatch.update` bypasses `IMMUTABLE_PATCH_FIELDS`** — pre-existing gap, not introduced by this plan. **Mitigation**: out of scope; flag for future.
- **Forward-compat: `expired` status deprecated** — cascade becomes unreachable. **Mitigation**: JSDoc on `cascade_from` notes the future migration path (accept `stale` or remove).

## Success criteria (per brainstorm §Success Metrics)

- [ ] Cold-tier build time <10ms at 500 entries (`loop_describe` warm-tier latency unchanged)
- [ ] Inverse-map count: 5 (was 4) — `__tests__/build-inverse-indexes.test.js` line 54 iteration asserts all 5
- [ ] Reopen path discoverable — one patch attempt suffices (cold-session regression test must pass)
- [ ] Audit trail accurate — `cascade_resolved_by` populated when cascade used
- [ ] `meta_state_relationships({id: old_id, direction: "inbound"})` surfaces `reopened_by: [new_id, ...]` after backfill
- [ ] `meta_state_patch` error response includes `immutable_fields: [...IMMUTABLE_PATCH_FIELDS]` (full 12-element array)
- [ ] All new branches covered — `pnpm test` exits 0; no `--passWithNoTests`
- [ ] No regressions — existing tests pass
- [ ] No `chore` or `docs` commit prefixes (per CLAUDE.md §Git)
- [ ] No new dependencies

## Dependencies

No new dependencies. All edits use existing `zod`, `node:test`, `node:assert`, `node:fs`.

**Cross-plan**:
- `plans/260610-meta-state-patch-wire-format-recursion/` — **completed**, separate scope (touches `tool-registry.js#coerceParamsToSchema`, not the patch tool handler). No conflict.
- `plans/260610-1203-cold-session-churn-and-cross-compat-fix/` — **completed** (status: done, 3/3 phases, 100% progress), separate scope (L1/L2 probe layer isolation). No registry schema interaction. No conflict. Cross-reference freed: this plan's reopen work is independent of the churn fix.

## Next step

After approval, run Phase 1 (TDD red → green for schema + inverse + cold-tier test).
