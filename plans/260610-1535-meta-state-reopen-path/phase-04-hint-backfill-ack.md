---
phase: 4
title: "Hint + Backfill + Ack + Journal"
status: pending
priority: P2
effort: "1h"
dependencies: ["1", "2", "3"]
---

# Phase 4: Hint + Backfill + Ack + Journal

## Overview

Close the loop on the operator-facing surface. Add one new line to `DISCOVERABILITY_HINTS` so cold-session agents can discover the reopen path. Update the cold-session test's hint-count assertion (8 → 9) in the same commit. Backfill the existing `reopens` field onto `meta-260610T1458Z-...` (the existing reopen-target entry) via `meta_state_patch`. Ack the two triggering findings (`meta-260610T1504Z-...` and `meta-260610T1458Z-...`) so the registry reflects the work. Update `docs/trajectory.md` storage-layer section to reflect the 5-map baseline.

This phase = brainstorm steps 5 + 6 + 7 + docs/journal.

## Requirements

**Functional**:
- `DISCOVERABILITY_HINTS` (line 90-99 of `core/loop-introspect.js`) has 9 entries (was 8).
- The 9th hint describes the reopen pattern: set `reopens` on the new finding at report time, then cascade-resolve the parent.
- `meta_state_patch({id: "meta-260610T1458Z-...", entry_kind: "finding", patch: {reopens: ["meta-260606T2202Z-..."]}})` succeeds.
- After backfill, `meta_state_relationships({id: "meta-260606T2202Z-...", direction: "inbound"})` returns `inbound.reopened_by: ["meta-260610T1458Z-..."]`.
- `meta_state_ack({id: "meta-260610T1504Z-..."})` transitions the finding to `active` (ack'd).
- `meta_state_ack({id: "meta-260610T1458Z-..."})` transitions the finding to `active` (ack'd; will remain `active` until the wire-format fix ships separately).
- `docs/trajectory.md` storage-layer section mentions the 5-map baseline.

**Non-functional**:
- The hint is inserted at line 96 (after the 6 statuses hint at line 95, before the rule/loop-design lifecycle hint at line 96). Operational family.
- `DISCOVERABILITY_HINTS` is `Object.freeze`d — the new array must be re-`Object.freeze`d (do not `.push()` on a frozen array).
- Backfill uses CAS via `_expected_version` (auto-capture if omitted) to be race-safe.
- The integration test for the backfill is gated to NOT run by default (real-registry test).
- `meta_state_ack` for `meta-260610T1504Z-...` documents that the gap is now closed (operator can resolve it later with a `meta_state_resolve` call citing the plan).

## Architecture

```
DISCOVERABILITY_HINTS rebuild
  - current 8 strings + 1 new = 9
  - re-`Object.freeze` the new array
  - downstream consumers (loop_describe warm tier, SessionStart hook) iterate via .length/.some() — non-breaking

Backfill (operator-driven, one-time)
  - meta_state_patch sets reopens on meta-260610T1458Z-...
  - existing meta_state_relationships inbound query surfaces the link

Ack (operator-driven)
  - meta_state_ack transitions the two findings to active
  - audit trail: expires_at cleared, acked_at stamped
```

## Related Code Files

**Create**:
- `tools/learning-loop-mcp/__tests__/meta-state-reopen-backfill-integration.test.js` — new gated test file (~20 lines, 2 scenarios)

**Modify**:
- `tools/learning-loop-mcp/core/loop-introspect.js` — add 1 string to `DISCOVERABILITY_HINTS` array (line 90-99); re-`Object.freeze` (+1 line)
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` — line 441: hint count 8→9; add `.some((h) => h.includes("reopens"))` assertion (+2 lines)
- `docs/trajectory.md` — storage-layer section: 5 maps baseline (text update)

**Delete**: none

## Implementation Steps (TDD red → green → operator step → verify)

### Step 1: TDD RED — cold-session test detects new hint
**File**: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`

1. Update line 441's count assertion from `=== 8` to `=== 9`.
2. Add a new assertion: `assert.ok(hints.some((h) => h.includes("reopens")), "DISCOVERABILITY_HINTS should include a hint about reopens");`

**Expected**: FAIL — the new hint doesn't exist yet, so `hints.some(...)` returns false.

### Step 2: TDD GREEN — add the hint
**File**: `tools/learning-loop-mcp/core/loop-introspect.js`

The current `DISCOVERABILITY_HINTS` is `Object.freeze`d. The safe pattern is to rebuild the array and re-freeze:

```js
const DISCOVERABILITY_HINTS = Object.freeze([
  "To cite a thing, point at the code: ...",        // [0] existing
  "For `source_refs`, prefer ...",                  // [1] existing
  "Run `meta_state_derive_status` ...",             // [2] existing
  "For designs without code, ...",                  // [3] existing
  "Findings have 6 statuses: ...",                  // [4] existing
  "For reopens: set reopens: ['<old_expired_id>'] on the new finding at report time, then cascade-resolve the parent via meta_state_resolve({id: old_id, cascade_from: [child_id]}).", // [5] NEW
  "For rule and loop-design lifecycle, ...",        // [6] existing (was [5])
  "To pick a tool, prefer the canonical MCP tool ...",  // [7] existing (was [6])
  "AGENTS.md is the priority-1 prompt ...",          // [8] existing (was [7])
]);
```

The new hint is inserted at index 5 (between the "6 statuses" hint at [4] and the "rule and loop-design lifecycle" hint at [6]).

Run Step 1's test — should pass. The full `pnpm test` should pass (warm-tier test at `loop-describe-warm-tier.test.js` checks token budget, not exact count).

### Step 3: TDD RED — backfill integration test (gated)
**File**: `tools/learning-loop-mcp/__tests__/meta-state-reopen-backfill-integration.test.js` (NEW)

```js
import { test } from "node:test";
import assert from "node:assert";

// Real-registry test — gated. The operator runs this AFTER executing the
// backfill step manually (see plans/260610-1535-meta-state-reopen-path/phase-04-hint-backfill-ack.md).
test.skip("backfill: meta-260610T1458Z-... reopens meta-260606T2202Z-...", async () => {
  if (process.env.SKIP_REAL_REGISTRY_TESTS === "1") return;
  // ...call meta_state_patch with the backfill, then meta_state_relationships, assert inbound.reopened_by...
});
```

**Expected**: SKIP (the `test.skip` is the default state). The test exists as documentation; the operator can un-skip and run it after the backfill step.

### Step 4: TDD RED → GREEN — operator executes the backfill
This is an operator-driven step, not an automated test. The operator runs:

```js
mcp__learning-loop-mcp__meta_state_patch({
  id: "meta-260610T1458Z-next-session-target-fix-the-mcp-wire-format-coercion-bug-blo",
  entry_kind: "finding",
  patch: { reopens: ["meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g"] }
})
```

Expected result: `{patched: true, version: <n+1>, ...}`. Verify in `meta_state_relationships`:
```js
mcp__learning-loop-mcp__meta_state_relationships({
  id: "meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g",
  direction: "inbound"
})
```
Expected: `inbound.reopened_by: ["meta-260610T1458Z-..."]`.

After verification, un-skip Step 3's test and run `pnpm test` to lock the integration assertion.

### Step 5: Operator acks the two triggering findings
```js
mcp__learning-loop-mcp__meta_state_ack({
  id: "meta-260610T1504Z-reopen-path-for-expired-findings-is-unclear-the-immutable-pa",
  // reason: "Reopen path now shippable via 260610-1535 plan; see Phase 4"
})
mcp__learning-loop-mcp__meta_state_ack({
  id: "meta-260610T1458Z-next-session-target-fix-the-mcp-wire-format-coercion-bug-blo",
  // reason: "Backfilled with reopens link; wire-format fix is separate work"
})
```

Both transition from `reported` to `active`. The gap-doc finding (`meta-260610T1504Z-...`) can later be resolved via `meta_state_resolve` after this plan ships (separate operator action; not in this phase).

### Step 6: Update `docs/trajectory.md`
**File**: `docs/trajectory.md`

Find the storage-layer section (the brainstorm references a "5 maps" baseline). Update the text to reflect:
- 5 inverse maps (added `reopens_inverse`)
- 1 new optional field (`reopens` on `metaStateFindingEntrySchema`)
- 1 new tool parameter (`cascade_from` on `meta_state_resolve`)
- Pre-conditions for SQLite remain un-tripped

The exact diff depends on the current text. Read `docs/trajectory.md` first, then apply a minimal text update.

### Step 7: Run full test suite
```bash
pnpm test
```

Verify zero regressions. All Phase 1-3 tests still pass. Step 3's integration test runs in skip mode by default.

## Success Criteria

- [ ] Step 1 cold-session test passes (hint count 9, new hint present)
- [ ] Step 2 hint added to `DISCOVERABILITY_HINTS` at line 96
- [ ] Step 3 integration test exists (in skip mode)
- [ ] Step 4 backfill executed by operator; `meta_state_relationships` surfaces the link
- [ ] Step 5 both triggering findings acked (status: active)
- [ ] Step 6 `docs/trajectory.md` updated to 5-map baseline
- [ ] `pnpm test` shows 0 regressions
- [ ] No `chore` or `docs` commit prefixes for code/test changes (per CLAUDE.md §Git)
- [ ] `docs/trajectory.md` change CAN use `docs` prefix (it's a docs file)

## Risk Assessment

- **`DISCOVERABILITY_HINTS` mutation** — array is `Object.freeze`d. **Mitigation**: Step 2 rebuilds the array and re-freezes. Verified pattern.
- **Hint count drift** — the cold-session test asserts `=== 9`. If a future hint is added, this breaks. **Mitigation**: count assertion is intentional; it's a contract that the test is a 9-hint cold-session test. Future additions would update the count as a deliberate signal.
- **Backfill race** — `_expected_version` omitted → auto-capture. Safe for a one-time operator step.
- **Ack before backfill** — if `meta-260610T1458Z-...` is acked before the `reopens` backfill, the find is in `active` status (acquired via ack), then the backfill patches it. Order in Step 4-5 is backfill FIRST, then ack. **Mitigation**: steps are ordered in the implementation; the operator follows the order.
- **Real-registry test pollution** — the integration test in Step 3 mutates the real registry. **Mitigation**: `test.skip` + `process.env.SKIP_REAL_REGISTRY_TESTS` gate. The test runs only when the operator explicitly opts in.
- **Token budget** — adding 161 chars to the hints array brings total to ~3000 bytes. Cold-session test asserts `< 5000`. **Mitigation**: well under budget.

## Security Considerations

- The hint text exposes the reopen pattern. This is intentional discoverability — the patch is operator-driven, not user-facing.
- The backfill patch is operator-driven (uses the MCP tool with operator mode implicit). No new attack surface.
- `meta_state_ack` is a closed-source MCP tool with no new behavior.

## Next Steps

After Phase 4 ships:
- Run `/ck:journal` to capture the closeout, the 6 atomic changes, and the cross-reference backfill.
- Run `/ck:plan validate` (optional) on the completed plan to lock the design.
- The `meta-260610T1458Z-...` finding remains `active` until the wire-format fix ships (separate work, not in this plan).
- The `meta-260610T1504Z-...` finding (gap-doc) can be `resolved` by the operator after this plan ships (closeout action).

## Journal Entry (post-implementation)

After Phase 4 ships, the journal entry at `docs/journal/260610-1535-meta-state-reopen-path.md` should capture:
- The 6 atomic changes shipped (one per change).
- The backfill that linked `meta-260610T1458Z-...` to `meta-260606T2202Z-...`.
- The 5→5 inverse map baseline (the registry now has 5 maps).
- The cold-tier regression test update (4→5 maps).
- The patch-tool error discoverability (no more trial-and-error).
- The cold-session discoverability hint (9th entry, the reopen pattern).
- The 5 personas' votes (from the brainstorm) — all aligned GO.
- The 3 unresolved questions from the researchers that were resolved plan-time.
- The forward-compat note: if `expired` is deprecated, the cascade becomes unreachable.
