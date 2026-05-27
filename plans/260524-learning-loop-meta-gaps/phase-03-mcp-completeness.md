---
phase: 3
title: "MCP-Completeness"
status: completed
priority: P1
effort: "6h"
dependencies: [1, 2]
---

# Phase 3: MCP-Completeness

## Overview

Close all 5 MCP CRUD gaps identified in `records/meta/evidence/mcp-crud-gap-macro-implementation-260522.md`. The loop advertises "MCP-first record access" but the CRUD tools are incomplete, creating systematic tension where agents either leave validation errors, ask the operator, or bypass the gate with Bash.

## Requirements

- Functional: `update_decision_record` exposes `source_refs` parameter
- Functional: `update_experiment_record` exposes `source_refs` and `verification` parameters
- Functional: All `create_*` tools validate `source_refs` at creation time
- Functional: `record:` source refs match exact full record ID
- Functional: `local:` source refs live under `records/evidence` or allowed directories
- Functional: New `delete_record` MCP tool with surface-scoped authorization
- Non-functional: All changes backward-compatible (existing calls still work)
- Non-functional: Each tool has comprehensive unit tests

## Architecture

```
MCP Tool Schema (Zod) → Validation Layer → Writer Module → File System
                                    ↓
                              Gate Logging
```

The validation layer is shared across create and update tools to ensure consistent source_ref validation.

## Related Code Files

- Modify: `tools/coordination-gate/mcp/tools/update-decision-record-tool.js`
- Modify: `tools/coordination-gate/mcp/tools/update-experiment-record-tool.js`
- Modify: `tools/coordination-gate/mcp/tools/create-decision-record-tool.js`
- Modify: `tools/coordination-gate/mcp/tools/create-experiment-record-tool.js`
- Modify: `tools/coordination-gate/mcp/tools/create-risk-record-tool.js`
- Create: `tools/coordination-gate/mcp/tools/delete-record-tool.js`
- Create: `tools/coordination-gate/mcp/lib/source-ref-validator.js`
- Modify: `tools/coordination-gate/core/decision-writer.js`
- Modify: `tools/coordination-gate/core/experiment-writer.js`
- Modify: `tools/coordination-gate/core/risk-writer.js`
- Create: `tools/coordination-gate/mcp/tools/delete-record-tool.test.js`
- Create: `tools/coordination-gate/mcp/lib/source-ref-validator.test.js`

## Implementation Steps

1. **Source ref validator module** (1.5h)
   - Reuse existing validation functions from `validate-records/record-validation-rules.js`
   - Create `mcp/lib/source-ref-validator.js` that imports and re-exports:
     - `validateLocalRef` from `../../validate-records/record-validation-rules.js`
     - `validateAllowedLocalPath` from `../../validate-records/record-validation-rules.js`
   - Add MCP-specific wrapper:
     - `validateSourceRefForMcp(ref, recordType, root)` — validates single ref with clear error messages
     - `validateSourceRefsForMcp(refs, recordType, root)` — validates array
   - Rules:
     - `local:` refs must be under `records/evidence`, `knowledge-packs`, or `product/*/capabilities` (capability records only)
     - `record:` refs must match exact full record ID (check against filesystem)
     - `legacy:` refs allowed but logged as deprecated
   - Tests first: `source-ref-validator.test.js`
   - **Import path note**: Use `../../validate-records/record-validation-rules.js` from `tools/coordination-gate/mcp/lib/`

2. **Update decision record — add source_refs (append-only)** (1h)
   - Add `source_refs` to update schema (optional, array of strings to append)
   - Pass source_refs through to `updateDecision` writer
   - **Important**: `source_refs` is in `COMMON_IMMUTABLE` list in `core/record-writer.js`
   - Implement append-only behavior: new refs are merged with existing, duplicates removed
   - Validate new source_refs via shared validator before appending
   - Update `update-decision-record-tool.test.js`
   - Test: updating source_refs appends new refs, preserves old refs
   - Test: duplicate refs are deduplicated

3. **Update experiment record — add source_refs + verification** (1.5h)
   - Add `source_refs` to update schema
   - Add `verification` object to update schema:
     - `claim_refs: string[]`
     - `proves: { dimension, scope?, output_level }[]`
     - `requires_human_approval: boolean`
     - `approval_status: enum`
   - Validate verification block against `schemas/experiment.schema.json`
   - Update `update-experiment-record-tool.test.js`

4. **Create tools — validate source_refs at creation (STRICT mode)** (1h)
   - Add `source_refs` validation to all create tools
   - Reject invalid refs at creation time with clear error message
   - **No warn mode**: STRICT from day one; invalid refs are blocked
   - If existing automation passes invalid refs, fix the automation in the same commit
   - Update create tool tests

5. **Delete record tool** (1.5h)
   - Create `delete-record-tool.js` with schema:
     - `surface: string`
     - `record_id: string`
     - `record_type: enum['decision', 'experiment', 'risk']`
     - `reason: string` (required, minimum 20 chars, for audit log)
     - `operator_confirmation: boolean` (required, must be `true`)
   - Authorization: per-type deletable statuses:
     - Decision: `draft`, `rejected` only
     - Experiment: `draft`, `rejected` only
     - Risk: `draft`, `rejected` only (not `active`, `mitigated`)
   - Soft delete: move record to `.deleted/` audit subdirectory under same surface/type path
   - Log deletion to gate log with full record content snapshot
   - Update manifest.json (tool count becomes 33)
   - Update `mcp/tools/agent-lifecycle-integration.test.js` tool count assertion to 33
   - Tests: `delete-record-tool.test.js`
   - Test: deletes draft record successfully
   - Test: blocks deletion of approved records
   - Test: blocks deletion without operator_confirmation=true
   - Test: blocks deletion with short reason
   - Test: soft-deleted record exists in `.deleted/` audit dir

## TDD Structure

```javascript
// source-ref-validator.test.js
import { validateSourceRef, validateSourceRefs } from '../lib/source-ref-validator.js';
import { describe, test } from 'node:test';
import assert from 'node:assert';

describe('validateSourceRef', () => {
  test('accepts valid local:records/evidence path', () => {
    assert.doesNotThrow(() => validateSourceRef('local:records/meta/evidence/test.md', 'decision'));
  });

  test('accepts valid record: ref with exact ID', () => {
    assert.doesNotThrow(() => validateSourceRef('record:decision-meta-260522T2030Z-test', 'experiment'));
  });

  test('rejects local: path outside allowed roots', () => {
    assert.throws(() => validateSourceRef('local:product/api/src/main.py', 'decision'));
  });

  test('rejects record: ref with partial ID', () => {
    assert.throws(() => validateSourceRef('record:decision-meta', 'experiment'));
  });

  test('allows product/*/capabilities for capability records only', () => {
    assert.doesNotThrow(() => validateSourceRef('local:product/api/capabilities/test.py', 'capability'));
    assert.throws(() => validateSourceRef('local:product/api/capabilities/test.py', 'decision'));
  });
});

// delete-record-tool.test.js
import { deleteRecordTool } from './delete-record-tool.js';

describe('delete_record tool', () => {
  test('deletes draft decision record', async () => {
    // given: draft decision record exists
    // when: delete_record called with reason
    // then: record removed, gate log updated
  });

  test('blocks deletion of approved records', async () => {
    // given: approved decision record
    // when: delete_record called
    // then: error returned, record preserved
  });

  test('requires reason for audit log', async () => {
    // when: delete_record called without reason
    // then: validation error
  });
});
```

## Success Criteria

- [ ] `source-ref-validator.js` created with 100% branch coverage
- [ ] `update_decision_record` accepts and validates `source_refs`
- [ ] `update_experiment_record` accepts and validates `source_refs` and `verification`
- [ ] All `create_*` tools reject invalid `source_refs` at creation time
- [ ] `delete_record` tool created and tested
- [ ] All existing tests still pass
- [ ] `pnpm validate:records` passes after MCP tool changes

## Risk Assessment

- **Risk**: Source ref validation breaks existing records with legacy refs
  - Mitigation: `legacy:` refs are allowed but logged; only validate `local:` and `record:`
- **Risk**: Delete tool could remove important records
  - Mitigation: Per-type deletable statuses; operator_confirmation required; soft delete to `.deleted/`; reason minimum 20 chars
- **Risk**: Verification block schema mismatch with experiment.schema.json
  - Mitigation: Import schema and validate against it directly
- **Risk**: Shared validator introduces coupling
  - Mitigation: Reuses existing pure functions from `record-validation-rules.js`; single source of truth
- **Risk**: Append-only source_refs may grow unbounded
  - Mitigation: No removal path via MCP; operator can edit file directly if needed (rare)
- **Risk**: `agent-lifecycle-integration.test.js` tool count assertion breaks
  - Mitigation: Update assertion from 32 to 33 in same commit as manifest update
