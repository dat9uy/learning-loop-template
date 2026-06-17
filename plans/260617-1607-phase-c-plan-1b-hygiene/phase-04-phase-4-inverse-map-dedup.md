---
phase: 4
title: "phase-4-inverse-map-dedup"
status: pending
effort: "15min"
---

# Phase 4: Inverse Map Dedup (Plan 1a review Minors 3 + 4)

## Overview

Add `if (!arr.includes(id)) arr.push(id)` to the `consolidated_into_inverse` handler at `loop-introspect.js:309-317` to match the existing `promoted_to_rule` pattern at lines 282-284. Rewrite the misleading comment at `loop-introspect.js:304-308` to clarify that the forward ref is on the change-log side (`change-log.consolidates`), not the finding side.

## Context Links

- `plans/reports/code-reviewer-260617-1338-phase-c-plan-1a-atomic-fix-review-report.md` [Minor 3] + [Minor 4]
- `tools/learning-loop-mcp/core/loop-introspect.js:309-317` (target; dedup fix)
- `tools/learning-loop-mcp/core/loop-introspect.js:304-308` (target; misleading comment)
- `tools/learning-loop-mcp/core/loop-introspect.js:282-284` (the dedup pattern to mirror)
- `tools/learning-loop-mcp/core/meta-state.js:141` (correct JSDoc to reference)

## Requirements

- **Functional:** `consolidates: "f-1, f-1"` produces a 1-element array `["f-1"]` in the inverse map. The comment at lines 304-308 accurately describes the forward/inverse direction.
- **Non-functional:** The Phase 3 inverse-map test 3 (duplicate ids) becomes GREEN.

## Architecture

**Before (lines 309-317):**
```js
if (entry.entry_kind === "change-log" && entry.consolidates) {
  const ids = typeof entry.consolidates === "string"
    ? entry.consolidates.split(",").map((s) => s.trim()).filter(Boolean)
    : Array.isArray(entry.consolidates)
      ? entry.consolidates
      : [];
  if (!consolidatedIntoInverse.has(entry.id)) consolidatedIntoInverse.set(entry.id, []);
  consolidatedIntoInverse.get(entry.id).push(...ids);  // BUG: no dedup
}
```

**After (dedup):**
```js
if (entry.entry_kind === "change-log" && entry.consolidates) {
  const ids = typeof entry.consolidates === "string"
    ? entry.consolidates.split(",").map((s) => s.trim()).filter(Boolean)
    : Array.isArray(entry.consolidates)
      ? entry.consolidates
      : [];
  if (!consolidatedIntoInverse.has(entry.id)) consolidatedIntoInverse.set(entry.id, []);
  const arr = consolidatedIntoInverse.get(entry.id);
  for (const id of ids) {
    if (!arr.includes(id)) arr.push(id);  // matches promoted_to_rule pattern
  }
}
```

**Before (comment at lines 304-308):**
```js
// consolidated_into: finding -> change-log is the forward ref on the
// finding side (`finding.consolidated_into`). The inverse is keyed by
// change-log id and holds the findings it consolidates. This powers
// `meta_state_relationships({ id: <change-log-id>, direction: 'inbound' })`
// returning `inbound.consolidated_by`.
```

**After (corrected):**
```js
// consolidated_into: the forward ref is on the change-log side
// (`change-log.consolidates`, CSV or array of finding ids). The inverse
// is keyed by change-log id and holds the findings it consolidates.
// This powers `meta_state_relationships({ id: <change-log-id>, direction: 'inbound' })`
// returning `inbound.consolidated_by`. (See meta-state.js JSDoc for the
// canonical direction description.)
```

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/loop-introspect.js:304-308` (rewrite comment)
- **Modify:** `tools/learning-loop-mcp/core/loop-introspect.js:309-317` (add dedup loop)

## Implementation Steps

1. **RED (from Phase 3):** The duplicate-ids test (`consolidates: "f-1, f-1, f-1"`) fails on the current code (returns `["f-1", "f-1", "f-1"]`).
2. **GREEN (dedup):** Replace the `push(...ids)` line with a `for` loop that checks `arr.includes(id)` before pushing.
3. **GREEN (comment):** Rewrite the comment at lines 304-308 to match the corrected direction.
4. **Verify:** Run `loop-introspect.test.js` — all 3 new tests from Phase 3 pass (including duplicate-ids).
5. **Verify:** Run `meta-state-relationships-tool.test.js` — still GREEN (no consumer relied on the dedup behavior).
6. **Verify:** `pnpm test` runs GREEN; 0 regressions.

## Success Criteria

- [ ] `consolidated_into_inverse` dedupes duplicate ids (matches `promoted_to_rule` pattern at lines 282-284).
- [ ] The comment at `loop-introspect.js:304-308` correctly describes the forward ref as `change-log.consolidates` (not `finding.consolidated_into`).
- [ ] Phase 3's duplicate-ids test passes.
- [ ] All other test namespaces pass; 0 regressions.

## Risk Assessment

- **Risk:** The dedup change could break a consumer that relied on duplicates. **Mitigation:** No current consumer relies on duplicates (verified by Plan 1a code review); the change is correctness-improving.
- **Risk:** The comment rewrite could be inaccurate if the JSDoc in `meta-state.js:141` is itself wrong. **Mitigation:** Plan 1a code review verified the JSDoc is correct; reference it in the new comment.
- **Risk:** Changing the loop-introspect.js logic could affect the warm-tier indexes in `loop-describe-tool.js:183` (one of the 3 callers updated in Plan 1a). **Mitigation:** The dedup is in the build phase, not the consume phase; the consume phase iterates over the deduped array. No behavior change for consumers.

## TDD Note

This phase is GREEN-only because the RED test was written in Phase 3. The implementation change makes Phase 3's duplicate-ids test pass.

## Next Steps

- Phase 5 (doc drift corrections) updates the comment style and the plan/closeout docs to match the corrected direction.
