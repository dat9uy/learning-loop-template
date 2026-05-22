---
phase: 3
title: "Update Existing Tests"
status: completed
effort: "1.5h"
dependencies: [1]
---

# Phase 3: Update Existing Tests

## Overview

Phase 1 changed the product/** block from decision-records check to preflight marker check. All existing tests that set up decision records for product/** paths must now set up preflight markers instead. Block JSON shape also changed.

## Requirements

- Tests that previously relied on `writeDecisionRecord(tmpDir, 'product', ...)` for product/** allow paths must use `setPreflightMarker(tmpDir, 'product', now)` instead
- Tests asserting on block JSON must check for `preflight_checklist` field instead of old `reason` about missing decision records
- Manifest count updated to 32

## Related Code Files

- Modify: `.claude/coordination/__tests__/artifact-aware-gate.test.cjs`
- Modify: `.claude/coordination/__tests__/write-coordination-gate-minimal.test.cjs`
- Modify: `tools/constraint-gate/tools/agent-lifecycle-integration.test.js`
- Modify: `tools/constraint-gate/gate-mcp-integration.test.js`
- Note: `tools/validate-plan-loop/validate-plan-loop.js` has standalone `checkDecisionRecords` — does NOT need update (checks plans/**, not product/**)

## Implementation Steps

### Step 1: Update artifact-aware-gate.test.cjs

Phase 2 section (lines ~166-285) — all product/** tests:

| Old | New |
|-----|-----|
| `writeDecisionRecord(tmpDir, 'product', 'decision-product.yaml')` | `setPreflightMarker(tmpDir, 'product', new Date().toISOString())` |
| Assert `out.reason` contains "Missing decision records" | Assert `out.preflight_checklist` is array with 6 items |
| Assert `out.surface === 'product'` | Keep (still present) |
| `GATE_RESPONSE_MODE: 'escalate'` still blocks | Keep — preflight blocks are unconditional |

Add helper:
```js
function setPreflightMarker(tmpDir, surface, completedAt) {
  const markerPath = path.join(tmpDir, '.claude', 'coordination',
    `.loop-preflight-${surface}`);
  fs.writeFileSync(markerPath, JSON.stringify({ surface, completed_at: completedAt }));
}
```

Specific test updates:
- `product/api/src/main.py with decision record -> exit 0` → with valid preflight marker -> exit 0
- `product/web/src/routes.ts without decision record -> always block` → without preflight marker -> exit 2, has preflight_checklist
- `product/api/... + escalate mode + no decision -> blocked` → same, now checks preflight_checklist
- `product/unknown/stack.py -> always block` → same, now checks preflight_checklist
- Multi-segment product path tests → same pattern

### Step 2: Update write-coordination-gate-minimal.test.cjs

- `Edit product/** with decision record -> exit 0` (line 143-151) → `Edit product/** with preflight marker -> exit 0`
- Add new test: `Edit product/** without preflight marker -> exit 2 with preflight_checklist`
- Remove `writeDecisionRecord` helper usage for product/** paths (keep for plan/** paths if any)

### Step 3: Update agent-lifecycle-integration.test.js

- Line 128: `assert.equal(manifest.length, 31, ...)` → `assert.equal(manifest.length, 32, ...)`
- Add mark_preflight_complete tool test (from Phase 2)

### Step 4: Update gate-mcp-integration.test.js

**Red team finding:** `gate-mcp-integration.test.js:156-165` has test "gate allows product/** after decision records exist" that creates decision records and expects product write to succeed. After Phase 1, product/** requires preflight marker instead.

Replace:
- `createDecision({ root: gateRoot, surface: "product", ... })` setup → `setPreflightMarker(gateRoot, 'product', new Date().toISOString())`
- Assert product/** write succeeds with preflight marker

### Step 5: Run full test suite

```bash
node --test .claude/coordination/__tests__/gate-utils.test.cjs
node --test .claude/coordination/__tests__/preflight-gate.test.cjs
node --test .claude/coordination/__tests__/artifact-aware-gate.test.cjs
node --test .claude/coordination/__tests__/write-coordination-gate-minimal.test.cjs
node --test tools/constraint-gate/tools/agent-lifecycle-integration.test.js
node --test tools/constraint-gate/tools/mark-preflight-complete-tool.test.js
```

All tests must pass.

## Success Criteria

- [x] All artifact-aware-gate.test.cjs tests pass with preflight marker setup
- [x] All write-coordination-gate-minimal.test.cjs tests pass
- [x] Block JSON assertions check `preflight_checklist` instead of decision-record reason
- [x] Manifest count is 32
- [x] Zero test failures across entire suite

## Risk Assessment

Medium — many test updates, but all are mechanical substitutions (decision-record setup → preflight-marker setup). Risk of missing a test is mitigated by running the full suite.
