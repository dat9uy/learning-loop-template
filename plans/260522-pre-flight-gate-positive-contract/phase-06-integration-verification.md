---
phase: 5
title: "Integration Verification"
status: completed
effort: "0.5h"
dependencies: [0, 1, 2, 3, 4]
---

# Phase 5: Integration Verification

## Overview

End-to-end integration test: agent attempts product/** write → blocked with checklist → completes preflight → marker created → write succeeds. Plus full test suite regression check.

## Implementation Steps

### Step 1: Add preflight integration tests to existing gate-integration.test.cjs

Add to `.claude/coordination/__tests__/gate-integration.test.cjs` (file already exists):

```js
describe('preflight gate integration flow', () => {
  it('blocks product write, then allows after preflight completion', async () => {
    // 1. Write to product/api/test.py without marker → exit 2
    // 2. Verify block JSON has preflight_checklist
    // 3. Create marker via writePreflightMarker (simulating MCP tool call)
    // 4. Retry write → exit 0
  });

  it('marker expiry blocks after TTL', async () => {
    // 1. Create marker with old timestamp (31 min ago)
    // 2. Write to product/api/test.py → exit 2
    // 3. Block JSON still has preflight_checklist
  });

  it('marker refresh extends TTL', async () => {
    // 1. Create marker near expiry (29 min ago)
    // 2. Write to product/api/test.py → exit 0 (still valid)
    // 3. Write new marker (refresh)
    // 4. Write to product/api/test.py → exit 0
  });
});
```

### Step 2: Run full test suite

```bash
# Gate tests
node --test .claude/coordination/__tests__/gate-utils.test.cjs
node --test .claude/coordination/__tests__/preflight-gate.test.cjs
node --test .claude/coordination/__tests__/artifact-aware-gate.test.cjs
node --test .claude/coordination/__tests__/write-coordination-gate-minimal.test.cjs
node --test .claude/coordination/__tests__/gate-integration.test.cjs

# MCP tool tests
node --test tools/constraint-gate/tools/agent-lifecycle-integration.test.js
node --test tools/constraint-gate/tools/mark-preflight-complete-tool.test.js
node --test tools/constraint-gate/record-writer.test.js
node --test tools/constraint-gate/tool-registry.test.js

# Bash gate (ensure no regression)
node .claude/coordination/__tests__/bash-coordination-gate.test.cjs
```

All must pass with zero failures.

### Step 3: Manual smoke test

1. Attempt `Edit` to `product/api/test.py` without preflight → verify block with checklist
2. Call `mark_preflight_complete` MCP tool with surface `"product"`
3. Attempt same edit → verify allow
4. Wait (or set expired marker) → verify block again

## Success Criteria

- [x] Integration flow test passes (block → complete → allow)
- [x] TTL expiry integration test passes
- [x] Marker refresh integration test passes
- [x] Full test suite passes with zero failures
- [ ] Manual smoke test confirms end-to-end behavior

## Risk Assessment

Low — integration tests verify the composition of all prior phases. If any phase has issues, they surface here.
