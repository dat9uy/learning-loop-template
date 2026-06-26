---
phase: 1
title: "Core consistency-check function (TDD)"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Core consistency-check function (TDD)

## Overview

Implement `consistencyCheck(entries)` as a pure function in `tools/learning-loop-mastra/core/consistency-check.js`. Mirrors the existing `queryDrift(entries, codeContext)` shape at `core/query-drift.js:20` (lean drift events, no nested derivation, one event per `(entry, invariant)` pair). TDD: 16 tests written first; implementation satisfies them.

## Requirements

### Functional
- 5 invariants enforced in v1 (F-1..F-4 from finding `meta-260614T1236Z` + NEW-1 `status: reported` MUST NOT carry `resolved_at`/`resolved_by`)
- v1 scope: `entry_kind ∈ {finding, change-log}`. Rule + loop-design branches skipped (deferred to v2 per D1)
- One drift event per `(entry, invariant)` breach — if a single entry breaches multiple invariants, emit one event per breach
- Output shape: `{ drift_count, drift_events: [{ id, entry_kind, status, invariant_id, message, present_fields, missing_fields, forbidden_fields }] }`
- Null audit fields treated as missing (`isSet(v)` helper: `v !== null && v !== undefined`)
- `META_STATE_CONSISTENCY_INVARIANTS` exported as a constant array so introspection layers and tests derive the canonical list from one source (mirrors `META_STATE_DERIVATION_KINDS` at `core/derive-status.js:8`)

### Non-functional
- Pure function: no I/O, no subprocess, no external state
- Filter-agnostic: caller (tool layer) is responsible for any pre-filtering (matches SP3 contract at `core/query-drift.js:20`)
- Deterministic output order: events sorted by `(entry_kind, id, invariant_id)` for stable test assertions

## Architecture

The function lives in `core/` (not `tools/legacy/`) for the same reasons as `queryDrift`:
- Pure — testable in isolation from MCP tool harness
- Reusable by future surface variants (loop_describe cold tier, follow-up tests)

Algorithm:
```
for each entry in registry:
  if entry.entry_kind in {rule, loop-design}: skip
  if entry.entry_kind === "change-log":
    run I-CHANGE-LOG-1 invariant
  if entry.entry_kind === "finding":
    run F-1..F-4 + NEW-1 invariants
  collect breaches as drift_events

sort drift_events by (entry_kind, id, invariant_id)
return { drift_count: drift_events.length, drift_events }
```

Invariant table (5 total):

| ID | Status | Rule |
|----|--------|------|
| F-1 | `active` | MUST NOT carry `resolved_at` or `resolution` |
| F-2 | `archived` | MUST carry `archived_at`, `archived_by`, `archived_reason` |
| F-3 | `resolved` | MUST carry `resolved_by` |
| F-4 | `superseded` | MUST carry `consolidated_into` |
| NEW-1 | `reported` | MUST NOT carry `resolved_at` or `resolved_by` |

## Related Code Files

- **Create:** `tools/learning-loop-mastra/core/consistency-check.js` (pure function + exported invariant list, ~150 lines)
- **Create:** `tools/learning-loop-mastra/core/__tests__/consistency-check.test.js` (16 tests, ~250 lines)

## Implementation Steps

### Step 1 (TDD): Write failing test C-1
Create `tools/learning-loop-mastra/core/__tests__/consistency-check.test.js` with the first test:

```javascript
import { test } from "node:test";
import assert from "node:assert";
import { consistencyCheck } from "../consistency-check.js";

test("consistencyCheck: empty registry returns no drift (C-1)", () => {
  const result = consistencyCheck([]);
  assert.deepStrictEqual(result, { drift_count: 0, drift_events: [] });
});
```

Run: `node --test tools/learning-loop-mastra/core/__tests__/consistency-check.test.js`. Expect: 1 failure with "Cannot find module".

### Step 2 (TDD): Write failing tests C-2 through C-16
Add tests incrementally. Each test fails first, then is satisfied by the smallest implementation change. Use the test plan from researcher's Section 4.1 (16 tests total). Each test creates a hand-crafted entry with `makeEntry(overrides)` helper (mirror `meta-state.test.js:18-39` pattern).

### Step 3: Implement `consistencyCheck`
Create `tools/learning-loop-mastra/core/consistency-check.js`:

```javascript
export const META_STATE_CONSISTENCY_INVARIANTS = [
  { id: "F-1", status: "active", kind: "finding",
    forbid: ["resolved_at", "resolution"] },
  { id: "F-2", status: "archived", kind: "finding",
    require: ["archived_at", "archived_by", "archived_reason"] },
  { id: "F-3", status: "resolved", kind: "finding",
    require: ["resolved_by"] },
  { id: "F-4", status: "superseded", kind: "finding",
    require: ["consolidated_into"] },
  { id: "NEW-1", status: "reported", kind: "finding",
    forbid: ["resolved_at", "resolved_by"] },
];

function isSet(v) { return v !== null && v !== undefined; }

export function consistencyCheck(entries) {
  const drift_events = [];
  for (const entry of entries) {
    if (!["finding", "change-log"].includes(entry.entry_kind)) continue;
    for (const inv of META_STATE_CONSISTENCY_INVARIANTS) {
      if (inv.kind !== entry.entry_kind) continue;
      if (inv.status !== entry.status) continue;
      // Check forbid
      if (inv.forbid) {
        const present = inv.forbid.filter(f => isSet(entry[f]));
        if (present.length > 0) {
          drift_events.push({ id: entry.id, entry_kind: entry.entry_kind,
            status: entry.status, invariant_id: inv.id,
            message: `${inv.id}: status=${inv.status} must not carry ${present.join(", ")}`,
            present_fields: present, missing_fields: null, forbidden_fields: present });
        }
      }
      // Check require
      if (inv.require) {
        const missing = inv.require.filter(f => !isSet(entry[f]));
        if (missing.length > 0) {
          drift_events.push({ id: entry.id, entry_kind: entry.entry_kind,
            status: entry.status, invariant_id: inv.id,
            message: `${inv.id}: status=${inv.status} missing required fields: ${missing.join(", ")}`,
            present_fields: inv.require.filter(f => isSet(entry[f])),
            missing_fields: missing, forbidden_fields: null });
        }
      }
    }
  }
  drift_events.sort((a, b) =>
    a.entry_kind.localeCompare(b.entry_kind) ||
    a.id.localeCompare(b.id) ||
    a.invariant_id.localeCompare(b.invariant_id)
  );
  return { drift_count: drift_events.length, drift_events };
}
```

Run: `node --test tools/learning-loop-mastra/core/__tests__/consistency-check.test.js`. Expect: 16/16 GREEN.

### Step 4: Verify export contract
Assert `META_STATE_CONSISTENCY_INVARIANTS.length === 5` and the 5 ids are exactly `["F-1", "F-2", "F-3", "F-4", "NEW-1"]`. This guards against accidental deletions in future edits.

## Success Criteria

- [ ] All 16 core tests GREEN (`node --test tools/learning-loop-mastra/core/__tests__/consistency-check.test.js`)
- [ ] `META_STATE_CONSISTENCY_INVARIANTS` exports exactly 5 entries with ids `[F-1, F-2, F-3, F-4, NEW-1]`
- [ ] Deterministic output order (sort by entry_kind, id, invariant_id)
- [ ] No I/O, no subprocess, no `resolveRoot` call — pure function
- [ ] No new dependencies added to package.json
- [ ] TDD discipline: tests written first, implementation satisfies tests

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| v1 invariant set is incomplete (12 implicit invariants deferred) | Document in plan OO1; v2 follow-up plan when real drift surfaces |
| Output order non-deterministic across platforms | Explicit sort by (entry_kind, id, invariant_id) — covered by T-6 ordering test |
| Null audit fields misread as "missing" or "present" | `isSet(v)` helper: treats null and undefined as missing |
| Future scope creep (rule/loop-design checks) | Tests C-13, C-14 explicitly assert 0 drift for these kinds in v1; future edits must update the tests, not delete them |
| Invariant list drift between test expectations and implementation | T-16 test asserts exact count and ids; export + use in tests (matches `META_STATE_DERIVATION_KINDS` precedent) |

## TDD Gate

`node --test tools/learning-loop-mastra/core/__tests__/consistency-check.test.js` shows 16/16 pass.

If any test fails, the implementation is incomplete — do not proceed to Phase 2.