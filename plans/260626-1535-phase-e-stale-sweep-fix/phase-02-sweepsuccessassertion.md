---
phase: 2
title: "Sweep-success assertion in cold-tier test"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Sweep-success assertion in cold-tier test

## Overview

Add a single assertion to the existing cold-tier regression test that catches "registry has too many stale mechanism_check entries" regressions. This is the architectural fix for the gap that allowed Plan 7's broken state to ship undetected: the test asserted grounding for ACTIVE entries only, so stale entries were invisible.

## Requirements

- Functional:
  - New assertion catches the Plan 7 regression (pre-fix state had 12 stale mc=true+null entries; post-fix should have ≤ 1)
  - Existing test invariants remain GREEN (assertion is additive, not replacement)
  - Assertion message clearly identifies which category broke the invariant
- Non-functional:
  - Minimal code change (1 assertion block, ~10 lines)
  - Uses existing `loopDescribeTool` output (no new fixture)
  - Self-correcting: threshold is `≤ 1` to allow for the 1 mc=false leftover

## Architecture

The existing test (`tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js:67-100`) iterates `mechanism_check=true` findings and asserts each is grounded. It does NOT count how many stale `mechanism_check` findings exist. Adding the count assertion exposes the Plan 7 bug class.

Insertion point: between the existing Phase 5 coverage check (lines ~57-66) and the grounding invariant check (lines 67-100).

New assertion shape:

```javascript
// Phase 6 (NEW): sweep-success invariant — limit stale mechanism_check findings.
// Catches the Plan 7 regression (12 stale mc=true+null slipped through because the
// test only checked ACTIVE findings). Threshold 1 allows the documented mc=false
// leftover from Plan 3.
const staleMcFindings = current.all_findings.filter(
  (f) => f.status === "stale" && (f.mechanism_check === true || f.mechanism_check === null)
);
assert.ok(
  staleMcFindings.length <= 1,
  `Phase 6: sweep-success broken — ${staleMcFindings.length} stale mechanism_check findings exceed threshold 1: ${staleMcFindings.map(f => f.id).join(", ")}`
);
```

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` (add 1 assertion block, ~10 lines)

No production code changes. No meta-state changes.

## Implementation Steps

### Step 1: Verify the assertion would have caught the Plan 7 regression

Before making the change, confirm the assertion logic against the pre-fix state:

```bash
# Manual count of pre-fix stale mechanism_check findings (mc=true + mc=null)
grep '"status":"stale"' meta-state.jsonl | jq -r 'select((.mechanism_check // "null") == "true" or (.mechanism_check // "null") == "null") | .id' | wc -l
# Expected: 12 (pre-fix)
```

This is documentation/verification only — no writes.

### Step 2: Read the existing test to confirm insertion point

```bash
cat tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js
```

Identify the exact line numbers around the existing Phase 5 coverage check (the comment "Phase 5: mechanism_check coverage on resolved findings").

### Step 3: Add the assertion block

Use `Edit` tool to insert the new assertion between the Phase 5 coverage check and the grounding invariant check. Preserve the existing comment style (e.g., `// Phase 6: ...`).

### Step 4: Run the test against the post-fix state

```bash
node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js 2>&1 | tail -15
```

**Expected:** `pass` (1/1 tests pass). The new assertion counts stale mc findings after Phase 1 has reduced them to ≤ 1.

### Step 5: Verify the assertion catches the regression

To prove the assertion is not a no-op, temporarily revert the meta-state.jsonl to the pre-fix state and re-run:

```bash
# Save current (post-fix) state
cp meta-state.jsonl /tmp/meta-state-post-fix.jsonl

# Revert to pre-fix state (1186c33~1)
git show 1186c33:meta-state.jsonl > meta-state.jsonl

# Test should FAIL
node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js 2>&1 | tail -15
# Expected: fail with "Phase 6: sweep-success broken — 12 stale mechanism_check findings exceed threshold 1"

# Restore post-fix state
cp /tmp/meta-state-post-fix.jsonl meta-state.jsonl

# Test should PASS again
node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js 2>&1 | tail -15
# Expected: pass
```

**This step proves the assertion has teeth.** If the assertion passes against the pre-fix state too, it has a bug.

## Success Criteria

- [ ] Step 1 confirms pre-fix state would have triggered the assertion (12 > 1)
- [ ] Step 2 identifies the exact insertion line in the test file
- [ ] Step 3 adds the assertion block with clear error message identifying the category
- [ ] Step 4 test passes against the post-fix state (after Phase 1)
- [ ] Step 5 test FAILS against the pre-fix state (proves assertion has teeth)
- [ ] Step 5 test PASSES again after restoring post-fix state

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| R1 (assertion too strict — catches future plans legitimately leaving stale entries) | Threshold = 1 allows the documented mc=false leftover. Future plans can also leave 1 mc=true entry stale if needed; if more are expected, raise threshold with justification. |
| R2 (assertion too lax — doesn't catch the bug class) | Threshold = 1 is much stricter than the pre-fix state of 12. The Step 5 verification proves the assertion catches the actual regression. |
| R3 (test becomes flaky if sweep is run between batches) | Test reads `loopDescribeTool` cold tier, which is deterministic. Sweep side effects don't affect cold-tier output. |
| R4 (Phase 5 coverage check vs Phase 6 sweep-success — naming clash) | Use "Phase 6" since Phase 5 is taken; document the gap this closes. |