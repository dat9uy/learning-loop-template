---
phase: 2
title: "Refactor #1: Fix 4 Broken proposed_design_for Refs (TDD)"
status: pending
priority: P2
effort: "0.5h"
dependencies: [1]
---

# Phase 2: Refactor #1 — Fix 4 Broken `proposed_design_for` Refs

## Overview

Fixes the 4 broken `proposed_design_for` forward refs on the 2 `entry_kind: "loop-design"` entries (shipped in `260606-rule-loop-design-first-class`). The 2 entries wrote code symbols (`loop_get_instruction`, `loop_describe`, `metaStateRuleEntrySchema`, `metaStateLoopDesignSchema`) where the schema expects entry ids. A one-shot idempotent migration script resolves each value or strips it with an audit log.

## Requirements

- **Functional**: post-migration, `loop_describe({ tier: 'cold' })` shows 0 broken `proposed_design_for` refs.
- **Non-functional**: the migration is idempotent (running twice produces no changes); the migration emits a `change-log` entry documenting the fix; the migration never throws on bad data (strip + log instead).

## Architecture

The migration script is a Node ES module that reads `meta-state.jsonl`, finds `entry_kind: "loop-design"` entries, attempts to resolve each `proposed_design_for` value against the registry, and either keeps (if resolved), strips + logs (if not), or keeps as-is (if a known code symbol like `loop_describe` MCP tool name). The script uses `core/meta-state.js#readRegistry` and `core/meta-state.js#writeEntry` to avoid direct file I/O.

```
scripts/fix-loop-design-refs.mjs
  → readRegistry(root)
  → for each entry_kind: "loop-design":
    → for each value in proposed_design_for:
      → if value is a known entry id (rule, finding, change-log, loop-design) → keep
      → elif value is a known code symbol (whitelist: MCP tool names) → keep
      → else → strip + append to fix_log array
  → for each entry with changes:
    → writeEntry(root, mutated_entry)
  → emit change-log entry documenting the fix
```

**Resolution logic (per Locked Decision #1c):**
1. **Known entry id**: value matches an existing entry in the registry → keep.
2. **Known code symbol**: value is in the whitelist `['loop_describe', 'metaStateRuleEntrySchema', 'metaStateLoopDesignSchema']` (the 2 broken entries' original values; the whitelist documents the legacy data shape) → keep + add a note that the value is a code symbol, not an entry id.
3. **Unresolvable**: value is neither → strip + append to `fix_log` on the entry.

## Related Code Files

- **Create**: `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs` (~30 lines)
- **Create**: `tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js` (~80 lines; 2-3 tests)
- **Modify** (data only, via the script): `meta-state.jsonl` (2 loop-design entries; ≤4 fields; +1 change-log entry)

## Implementation Steps

### Red: write the failing test (TDD step 1)

1. In `__tests__/fix-loop-design-refs.test.js`, write 3 test cases:
   - `test('idempotent: running twice produces no changes', ...)` — invokes the script with a fixture registry, then runs it again, asserts `JSON.stringify(entries)` is identical.
   - `test('resolves known entry ids in proposed_design_for', ...)` — pre-populates a loop-design with `proposed_design_for: ['rule-x']` where `rule-x` exists; runs the script; asserts the value is kept.
   - `test('strips unresolvable values to fix_log', ...)` — pre-populates with `proposed_design_for: ['garbage-symbol']`; runs the script; asserts the value is removed and `fix_log: ['stripped: garbage-symbol']` is added.
2. Run `npm test -- fix-loop-design-refs` to confirm red.

### Green: implement the script (TDD step 2)

3. Write `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs`:
   - Import `readRegistry`, `writeEntry`, `metaStateChangeEntrySchema` from `#mcp/core/meta-state.js`.
   - For each `entry_kind: "loop-design"`, run the 3-step resolution logic above.
   - Mutate the entry in place; collect changes.
   - At the end, emit a `change-log` entry with `change_dimension: "mechanical"`, `change_target: "meta-state.jsonl#proposed_design_for-fix"`, `change_diff.added: ['fix_log']`, `reason: "Resolved 4 broken proposed_design_for refs on 2 loop-design entries. Schema intent is entry ids; legacy data had code symbols."`.
4. Re-run tests → green.

### Refactor + accept (TDD steps 3-4)

5. Extract the resolution logic into a pure function `resolveProposedDesignFor(value, allEntries)` returning `'keep' | 'keep-with-note' | 'strip'`. Unit-test it separately.
6. Run the script against the live `meta-state.jsonl` (operator approval required per `meta_state_log_change` idempotency rule).
7. Re-run the cold-tier regression harness (Phase 0). The fixture is updated: post-migration cold tier has 0 broken `proposed_design_for` refs. Commit the new fixture.
8. Run `npm test` — all tests pass.

## Success Criteria

- [ ] `fix-loop-design-refs.mjs` runs idempotently (snapshot before/after diff is empty on second run)
- [ ] Post-fix cold-tier shows 0 broken `proposed_design_for` refs (was 4)
- [ ] 2-3 tests pass in `__tests__/fix-loop-design-refs.test.js`
- [ ] 1 `change-log` entry exists in `meta-state.jsonl` documenting the fix
- [ ] The cold-tier regression test (Phase 0) is updated to the new baseline
- [ ] `npm test` passes

## Risk Assessment

- **Risk**: the script mutates the registry in a way that breaks `loop_describe`. → **Mitigation**: the script is gated by a `dryRun` flag (default `true`); the operator runs `--apply` to commit. The dry-run output shows the diff before mutation.
- **Risk**: the script accidentally modifies non-loop-design entries. → **Mitigation**: the entry filter is `entry.entry_kind === "loop-design"` only; no other kinds are touched.
- **Risk**: a future loop-design has a *correct* code symbol that the script strips. → **Mitigation**: the whitelist is a hardcoded list at the top of the script; expanding the whitelist is a 1-line edit. Document the whitelist in a comment.
- **Risk**: the script doesn't emit the change-log entry, leaving the audit trail incomplete. → **Mitigation**: the test for the change-log emission is a separate test case (the third test in the file). Coverage: 100% of script paths.
