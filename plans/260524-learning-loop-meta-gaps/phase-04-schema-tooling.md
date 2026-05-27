---
phase: 4
title: "Schema-Tooling"
status: completed
priority: P2
effort: "5h"
dependencies: [1, 2]
---

# Phase 4: Schema-Tooling

## Overview

Address schema drift, deferred AJV validation, and capability schema enrichment planning. Close the silent-pass gaps detected in AJV dry-run and establish the trigger mechanism for capability schema field enrichment when N>=3 verified packs land.

## Requirements

- Functional: Fix 3 silent-pass gaps (missing required fields in existing records)
- Functional: AJV validation integrated into `pnpm validate:records`
- Functional: Capability schema enrichment plan documented with N>=3 trigger
- Functional: Datetime pattern accepts date-only OR UTC-Z, rejects local-timezone
- Non-functional: No retroactive changes to historical records (prospective-only)
- Non-functional: AJV strict mode does not break on historical date-only timestamps

## Architecture

```
Record YAML → YAML Parser → AJV Validator (strict mode) → Error Report
                    ↓
            Hand-rolled Rules (source refs, cross-references)
```

AJV handles JSON Schema 2020-12 features (`$ref`, `items.required`, `pattern`) while hand-rolled rules handle project-specific logic (source ref allowlist, record ID existence checks).

## Related Code Files

- Modify: `tools/validate-records/validate-records.js`
- Modify: `tools/validate-records/schema-loader.js`
- Modify: `tools/validate-records/record-validation-rules.js`
- Modify: `schemas/experiment.schema.json` (datetime pattern)
- Modify: `schemas/decision.schema.json` (datetime pattern)
- Modify: `schemas/claim.schema.json` (datetime pattern)
- Modify: `schemas/capability.schema.json` (enrichment plan, no changes yet)
- Modify: `records/vnstock/claims/claim-vnstock-runtime-403-root-cause.yaml`
- Modify: `records/vnstock/experiments/experiment-vnstock-capabilities-20260509T174957Z.yaml`
- Modify: `records/vnstock/experiments/experiment-vnstock-install-20260509T071900Z-sandbox-2.yaml`
- Create: `tools/validate-records/ajv-validator.js`
- Create: `tools/validate-records/ajv-validator.test.js`
- Note: MCP server and core writers now live in `tools/coordination-gate/` (completed by plan `260524-unified-coordination-gate`)

## Implementation Steps

1. **AJV validator module** (1.5h)
   - Create `ajv-validator.js` wrapping AJV 2020 strict mode
   - Load all schemas from `schemas/` directory
   - Validate each record against its type schema
   - Return structured errors with path, message, and severity
   - Tests first: `ajv-validator.test.js`
   - Test: all 34 current records parse and validate
   - Test: known bad records fail with expected errors

2. **Datetime pattern fix** (1h)
   - **Current state**: Schemas already have strict UTC-Z pattern `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`
   - **Problem**: 23 historical records use date-only format; 1 uses local-timezone
   - **Solution**: Loosen pattern to `^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$`
     - Accepts date-only (historical) OR UTC-Z (new)
     - Rejects local-timezone (the actual drift trigger)
   - Fix 1 record with local-timezone: `experiment-meta-install-template-candidate-260512T0046Z.yaml`
   - Update `ajv-dryrun-results-260512.md` with resolution note
   - **Note**: Hand-rolled validator already runs AJV; this change makes the schema match reality

3. **Silent-pass gap fixes** (1h)
   - `claim-vnstock-runtime-403-root-cause.yaml`: This claim is superseded. **Drop empty `product` block entirely.**
     - Rationale: Superseded claims are frozen-legacy audit trail. An empty product block implies pending approval intent, which is misleading.
   - `experiment-vnstock-capabilities-20260509T174957Z.yaml`: Add `output_level` to `verification.proves[0]`
   - `experiment-vnstock-install-20260509T071900Z-sandbox-2.yaml`: Add `output_level` to `verification.proves[0]`
   - Validate each fix with `pnpm validate:records`
   - **STOP if validation fails** — no red state allowed (per validation session decision)

4. **Integrate AJV into validate-records** (1h)
   - Modify `validate-records.js` to run AJV validation as primary pass
   - Keep hand-rolled rules as secondary pass (source refs, cross-references)
   - Ensure exit code 1 on any validation failure
   - Update test expectations

5. **Capability schema enrichment plan** (0.5h)
   - Document deferred fields in `schemas/capability.schema.json` comments:
     - `description`: hold for N>=3
     - `method`: hold for N>=3; revisit whether `maps` covers it
     - `prerequisites`: hold for N>=3
     - `verified_by`: partially covered by `source_refs`; hold explicit field for N>=3
   - Update trigger note: current population N=2 (need 1 more verified pack)
   - No schema changes yet — only documentation

## TDD Structure

```javascript
// ajv-validator.test.js
import { validateRecord } from './ajv-validator.js';
import { describe, test } from 'node:test';
import assert from 'node:assert';

describe('AJV record validation', () => {
  test('validates decision record with correct schema', () => {
    const record = {
      id: 'test-decision',
      schema_version: '1.0',
      type: 'decision',
      status: 'draft',
      created_at: '2026-05-23T12:00:00Z',
      updated_at: '2026-05-23T12:00:00Z',
      source_refs: ['local:records/meta/evidence/test.md'],
      question: 'Test?',
      decision: 'Yes',
      rationale: 'Test rationale',
      alternatives: [],
      tradeoffs: [],
      supersedes: []
    };
    const result = validateRecord(record, 'decision');
    assert.strictEqual(result.valid, true);
  });

  test('rejects local-timezone timestamp', () => {
    const record = {
      created_at: '2026-05-23T12:00:00+07:00'
      // ... other required fields
    };
    const result = validateRecord(record, 'decision');
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.path.includes('created_at')));
  });

  test('accepts date-only timestamp (historical)', () => {
    const record = {
      created_at: '2026-05-23'
      // ... other required fields
    };
    const result = validateRecord(record, 'decision');
    assert.strictEqual(result.valid, true);
  });

  test('detects missing required field (silent-pass gap)', () => {
    const record = {
      // missing decision_refs in verification.product
    };
    const result = validateRecord(record, 'claim');
    assert.strictEqual(result.valid, false);
  });
});
```

## Success Criteria

- [ ] AJV validator module created and tested
- [ ] Datetime pattern updated in all schemas
- [ ] 3 silent-pass gaps fixed in existing records
- [ ] `pnpm validate:records` uses AJV as primary validation pass
- [ ] All 34+ records validate green
- [ ] Capability schema enrichment plan documented with N>=3 trigger
- [ ] Historical records preserved (prospective-only convention honored)

## Risk Assessment

- **Risk**: AJV strict mode breaks on edge cases hand-rolled validator accepted
  - Mitigation: Run against full record corpus before merge; fix forward
- **Risk**: Fixing silent-pass gaps changes record semantics
  - Mitigation: Review each fix with operator; use minimal change
- **Risk**: Capability schema documentation is ignored when N>=3 triggers
  - Mitigation: Trigger is explicit in schema comments and meta evidence
- **Risk**: Date-only acceptance perpetuates inconsistency
  - Mitigation: New records MUST use UTC-Z (enforced by MCP tools); date-only only for historical
