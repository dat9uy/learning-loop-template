---
phase: 6
title: "Integration-Test"
status: pending
priority: P1
effort: "4h"
dependencies: [3, 4]
---

# Phase 6: Integration-Test

## Overview

Integration test suite validating the full learning loop flow: MCP tool usage → record creation → validation → gate enforcement → index extraction. Tests cover the gaps closed in Phases 3-5, ensuring the loop is mechanically sound end-to-end.

## Requirements

- Functional: Full MCP CRUD lifecycle test (create → update → validate → delete)
- Functional: Gate enforcement test (preflight, write gate, bash gate)
- Functional: Index extraction test (evidence → assertion → index entry)
- Functional: Cross-tool integration (workflow tools + enforcement tools)
- Non-functional: Tests run in < 30 seconds
- Non-functional: Tests are isolated (no shared state between tests)

## Architecture

```
Test Suite
├── MCP Lifecycle Tests
│   ├── create_decision_record → validate → update → delete
│   ├── create_experiment_record → validate → update
│   └── create_risk_record → validate
├── Gate Enforcement Tests
│   ├── preflight gate blocks product/** without marker
│   ├── write gate blocks records/** direct writes
│   └── bash gate blocks docker/sudo without observation
├── Index Extraction Tests
│   ├── evidence with findings → assertion YAML
│   ├── evidence without findings → silent skip
│   └── duplicate assertion → merged source_refs
└── Cross-Tool Integration
    ├── workflow_product_build → check_gate → create_decision
    └── notify_artifact_change → extract_index → validate_records
```

## Related Code Files

- Create: `tools/constraint-gate/__tests__/mcp-lifecycle-integration.test.js`
- Create: `tools/constraint-gate/__tests__/gate-enforcement-integration.test.js`
- Create: `tools/constraint-gate/__tests__/index-extraction-integration.test.js`
- Create: `tools/constraint-gate/__tests__/cross-tool-integration.test.js`
- Modify: `.claude/coordination/__tests__/gate-integration.test.cjs`

## Implementation Steps

1. **MCP lifecycle integration tests** (1.5h)
   - Test: create decision → file exists → validate green
   - Test: update decision source_refs → validate green → source_refs correct
   - Test: create experiment with verification → validate green
   - Test: update experiment verification → validate green
   - Test: delete draft record → file removed → gate log updated
   - Test: delete approved record → error, file preserved
   - Use temp directories for isolation

2. **Gate enforcement integration tests** (1h)
   - Test: write gate blocks `records/**` direct Edit/Write
   - Test: write gate allows `docs/**`, `plans/**`, `tools/**`
   - Test: preflight gate blocks `product/**` without marker
   - Test: preflight gate allows `product/**` with valid marker
   - Test: bash gate blocks docker without observation
   - Test: bash gate allows docker with active observation

3. **Index extraction integration tests** (1h)
   - Test: evidence with `## Findings` → assertion YAML created
   - Test: evidence without `## Findings` → silently skipped
   - Test: duplicate assertion in two files → merged with n_count=2
   - Test: evidence with `validation_status: failed` → no index entry
   - Test: superseded evidence → index entry status updated

4. **Cross-tool integration tests** (0.5h)
   - Test: `workflow_product_build` → surfaces missing decision → gate blocks
   - Test: `notify_artifact_change` → triggers `extract_index` → validates
   - Test: `mark_preflight_complete` → creates marker → product writes allowed
   - **Test isolation**: Copy `schemas/*.schema.json` into temp dir before running `validateRecords`
   - **Alternative**: Mock `loadSchemas` to use actual project schemas without temp dir copy

## TDD Structure

```javascript
// mcp-lifecycle-integration.test.js
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('MCP lifecycle integration', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'loop-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true });
  });

  test('full decision lifecycle', async () => {
    // 1. Create decision
    const createResult = await createDecisionRecord({
      root: tempDir,
      surface: 'meta',
      question: 'Test?',
      decision: 'Yes'
    });
    assert.ok(createResult.created);

    // 2. Validate
    const validateResult = await validateRecords(tempDir);
    assert.strictEqual(validateResult.passed, true);

    // 3. Update source_refs
    const updateResult = await updateDecisionRecord({
      root: tempDir,
      surface: 'meta',
      decision_id: createResult.id,
      source_refs: ['local:records/meta/evidence/test.md']
    });
    assert.ok(updateResult.updated);

    // 4. Validate again
    const validateResult2 = await validateRecords(tempDir);
    assert.strictEqual(validateResult2.passed, true);

    // 5. Delete
    const deleteResult = await deleteRecord({
      root: tempDir,
      surface: 'meta',
      record_id: createResult.id,
      record_type: 'decision',
      reason: 'Test cleanup'
    });
    assert.ok(deleteResult.deleted);
  });
});

// gate-enforcement-integration.test.js
describe('gate enforcement integration', () => {
  test('preflight gate blocks product writes without marker', () => {
    const input = {
      tool_name: 'Edit',
      tool_input: { file_path: 'product/api/src/main.py' }
    };
    const result = evaluateWriteGate(input);
    assert.strictEqual(result.decision, 'block');
    assert.ok(result.preflight_checklist.length === 6);
  });

  test('preflight gate allows product writes with valid marker', () => {
    // given: valid preflight marker exists
    const input = {
      tool_name: 'Edit',
      tool_input: { file_path: 'product/api/src/main.py' }
    };
    const result = evaluateWriteGate(input);
    assert.strictEqual(result.decision, 'ok');
  });
});
```

## Success Criteria

- [ ] MCP lifecycle tests cover create → update → validate → delete
- [ ] Gate enforcement tests cover preflight, write, and bash gates
- [ ] Index extraction tests cover findings, skip, merge, and supersession
- [ ] Cross-tool tests cover workflow → gate → MCP tool chains
- [ ] All tests isolated (temp directories, no shared state)
- [ ] Full suite runs in < 30 seconds
- [ ] `pnpm test` passes with new integration tests

## Risk Assessment

- **Risk**: Integration tests are flaky due to filesystem timing
  - Mitigation: Use synchronous fs operations; avoid race conditions
- **Risk**: Tests depend on specific record IDs or timestamps
  - Mitigation: Generate IDs dynamically; mock timestamps
- **Risk**: Cross-tool tests require full MCP server startup
  - Mitigation: Test tool handlers directly, not via stdio transport
- **Risk**: Test suite takes too long
  - Mitigation: Parallel test execution; minimal record creation per test
- **Risk**: `validateRecords(tempDir)` fails because schemas not in temp dir
  - Mitigation: Copy schemas into temp dir in `beforeEach` or mock `loadSchemas`
