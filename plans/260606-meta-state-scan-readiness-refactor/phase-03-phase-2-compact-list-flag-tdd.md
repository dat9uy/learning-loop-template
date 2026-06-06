---
phase: 3
title: "Refactor #2: Compact List Flag (TDD)"
status: pending
priority: P2
effort: "0.5h"
dependencies: [2]
---

# Phase 3: Refactor #2 — `compact: true` Flag on `meta_state_list`

## Overview

Adds an opt-in `compact: boolean` flag to `meta_state_list` that returns only `id`, `entry_kind`, `status`, and ref fields (`origin`, `addresses`, `consolidated_into`, `supersedes`, `promoted_to_rule`, `proposed_design_for`). Strips `description` and `evidence`. Default behavior is unchanged.

## Requirements

- **Functional**: `meta_state_list({ compact: true, include_expired: true })` returns 51 entries × ~80 bytes = ~4KB total. Existing callers (no `compact` flag) see no diff.
- **Non-functional**: the compact shape is a subset of the full shape; the projection is a pure function (testable in isolation); the response is JSON-stable (deterministic key order for diff-friendly output).

## Architecture

A small projection function `toCompactShape(entry)` is added to `meta-state-list-tool.js`. When `compact: true`, the handler applies the projection to each entry before returning. The schema gains one field: `compact: z.boolean().optional().default(false)`.

```
meta_state_list({ compact: true, ... })
  → entries = readRegistry(root) + filter as before
  → if compact:
    → entries = entries.map(toCompactShape)
  → return entries
```

**Compact shape:**
```js
{
  id: entry.id,
  entry_kind: entry.entry_kind,
  status: entry.status,
  origin: entry.origin,                          // rule entries only
  addresses: entry.addresses,                    // loop-design entries only
  consolidated_into: entry.consolidated_into,    // superseded findings only
  supersedes: entry.supersedes,                  // change-logs, rules
  promoted_to_rule: entry.promoted_to_rule,      // resolved findings only
  proposed_design_for: entry.proposed_design_for,// loop-design entries only
}
```

(~6 fields, 80-100 bytes per entry vs ~1.6KB full).

## Related Code Files

- **Modify**: `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (schema + handler, ~15-line diff)
- **Create**: `tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js` (~60 lines; 3 tests)

## Implementation Steps

### Red: write the failing test (TDD step 1)

1. In `__tests__/meta-state-list-compact.test.js`, write 3 test cases:
   - `test('compact:true with empty registry returns []', ...)` — fixture: empty registry; expected: `{ entries: [], count: 0 }`.
   - `test('compact:true returns only id+kind+status+refs fields', ...)` — fixture: 1 finding, 1 rule, 1 loop-design; expected: each entry has 6-8 keys, no `description`/`evidence`/`created_at`/`category`/etc.
   - `test('compact:false (default) returns full entries', ...)` — fixture: 1 finding; expected: entry has all original fields including `description` and `evidence`.
2. Run `npm test -- meta-state-list-compact` to confirm red.

### Green: implement the flag (TDD step 2)

3. Edit `tools/meta-state-list-tool.js`:
   - Add `compact: z.boolean().optional().default(false)` to the schema.
   - Extract `toCompactShape(entry)` as a module-private function.
   - In the handler, after the existing filter, if `compact`, replace `result` with `result.map(toCompactShape)`.
4. Re-run tests → green.

### Refactor + accept (TDD steps 3-4)

5. Verify the compact shape is a strict subset of the full shape (no fields added that aren't in the full entry). Add a 4th test that asserts `Object.keys(toCompactShape(fullEntry)).every(k => k in fullEntry)`.
6. Update the harness (Phase 0) to include a `compact: true` cold-tier-equivalent fixture (`fixtures/cold-tier-pre-refactor-compact.json`). This is the "what compact looks like before any other refactors" baseline.
7. Run `npm test` — all tests pass.

## Success Criteria

- [ ] `meta_state_list({ compact: true, include_expired: true })` returns 51 entries × ~80 bytes = ~4KB total
- [ ] `meta_state_list({ compact: true })` (default exclude_expired) returns 27 non-terminal entries
- [ ] 3-4 tests pass in `__tests__/meta-state-list-compact.test.js`
- [ ] Existing tests (no `compact` flag) pass unchanged
- [ ] The cold-tier regression test (Phase 0) is updated to also assert the compact shape
- [ ] `npm test` passes

## Risk Assessment

- **Risk**: a future caller adds a new field to entries and forgets to update the compact shape. → **Mitigation**: the 4th test asserts `toCompactShape` is a strict subset of the full shape. New fields are automatically NOT in the compact shape (the omission is intentional). The compact shape is documented as "relationship-first, not exhaustive."
- **Risk**: the compact shape is too small to be useful (a ref-only shape with no provenance data). → **Mitigation**: the 6 fields include `origin`, `promoted_to_rule`, `consolidated_into`, `supersedes`, `proposed_design_for`, `addresses` — every cross-reference type. The shape IS useful for relationship scanning; that's the whole point.
- **Risk**: agents call `compact: true` and skip the warm tier (which is more discoverable). → **Mitigation**: the discoverability_hints in `core/loop-introspect.js` document when to use compact (relationship scanning) vs full (audit reads). The compact flag is a tool affordance, not a default.
