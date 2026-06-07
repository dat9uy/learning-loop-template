---
phase: 4
title: "Refactor #3: Inverse Indexes + relationships tool (TDD)"
status: pending
priority: P2
effort: "3h"
dependencies: [3]
---

# Phase 4: Refactor #3 + #4 — Inverse Indexes + `meta_state_relationships` Tool

## Overview

Two coupled refactors: (a) a pure function `buildInverseIndexes(entries)` that produces 4 inverse maps (`addresses_inverse`, `supersedes_inverse`, `origin_inverse`, `promoted_to_rule_inverse`); the cold tier of `loop_describe` surfaces the maps in a new `inverse_indexes` field. (b) a new MCP tool `meta_state_relationships` that resolves "what touches this entry?" in O(1) via the inverse maps. Both refactors are TDD-structured; the function ships in this phase, the tool ships as Phase 5 (next phase).

## Requirements

- **Functional (Refactor #3)**: `buildInverseIndexes(entries)` returns 4 maps; cold tier response includes `inverse_indexes`; verified counts match expected (e.g., `origin_inverse.get('meta-260601T1353Z-sanitizeslug-...')` returns `['rule-short-slug-for-risk-records']`).
- **Non-functional (Refactor #3)**: the function is pure (no I/O, no side effects); cold tier size increases by ≤2KB; the function handles empty registries and registries with orphans.
- **Functional (Refactor #4)**: `meta_state_relationships` tool is registered in `tools/manifest.json` (server.js auto-discovers from manifest, no manual edit needed); tool returns expected inbound + outbound + both for a sample entry.
- **Non-functional (Refactor #4)**: tool follows the same idempotency pattern as `meta_state_log_change` (gate log + append-only); tool size is ~80 lines; tool has 3-4 unit tests.

## Architecture

### Refactor #3: `buildInverseIndexes`

```
function buildInverseIndexes(entries) {
  const addresses_inverse = new Map();         // for each loop-design, the findings that address it
  const supersedes_inverse = new Map();        // for each change-log, the entries it supersedes
  const origin_inverse = new Map();            // for each finding, the rules that originated from it
  const promoted_to_rule_inverse = new Map();  // for each rule, the findings it resolved

  for (const e of entries) {
    if (e.entry_kind === "loop-design" && e.addresses?.length) {
      for (const addr of e.addresses) {
        if (!addresses_inverse.has(addr)) addresses_inverse.set(addr, []);
        addresses_inverse.get(addr).push(e.id);
      }
    }
    if (e.supersedes) {
      if (!supersedes_inverse.has(e.supersedes)) supersedes_inverse.set(e.supersedes, []);
      supersedes_inverse.get(e.supersedes).push(e.id);
    }
    if (e.entry_kind === "rule" && e.origin) {
      if (!origin_inverse.has(e.origin)) origin_inverse.set(e.origin, []);
      origin_inverse.get(e.origin).push(e.id);
    }
    if (e.entry_kind === "finding" && e.promoted_to_rule) {
      // promoted_to_rule is always a string in current registry (migrated in 260606-rule-loop-design-first-class)
      if (!promoted_to_rule_inverse.has(e.promoted_to_rule)) promoted_to_rule_inverse.set(e.promoted_to_rule, []);
      promoted_to_rule_inverse.get(e.promoted_to_rule).push(e.id);
    }
  }

  return { addresses_inverse, supersedes_inverse, origin_inverse, promoted_to_rule_inverse };
}
```

The function is added to `core/loop-introspect.js` next to `listPromotedRules` and `listLoopDesigns`. The cold tier path in `tools/loop-describe-tool.js` calls it after loading entries and includes the maps (as objects, not Maps, for JSON serialization) in the response.

### Refactor #4: `meta_state_relationships` tool

```
meta_state_relationships({ id, direction: 'inbound' | 'outbound' | 'both' })
  → entry = findEntryById(id)
  → if not found: return { found: false, id }
  → indexes = buildInverseIndexes(allEntries)
  → result = { id, found: true, entry_kind: entry.entry_kind, status: entry.status }
  → if direction in ('inbound', 'both'):
    → result.inbound = {
        addresses: indexes.addresses_inverse.get(id) ?? [],
        supersedes: indexes.supersedes_inverse.get(id) ?? [],
        origin: indexes.origin_inverse.get(id) ?? [],
        promoted_to_rule: indexes.promoted_to_rule_inverse.get(id) ?? [],
      }
  → if direction in ('outbound', 'both'):
    → result.outbound = {
        addresses: entry.addresses ?? [],
        supersedes: entry.supersedes,
        origin: entry.origin,
        promoted_to_rule: entry.promoted_to_rule,
        proposed_design_for: entry.proposed_design_for ?? [],
        consolidated_into: entry.consolidated_into,
      }
  → return result
```

The tool is registered in `tools/manifest.json` alongside other meta-state tools (server.js auto-discovers from manifest). The handler is ~50 lines; the schema is ~10 lines.

## Related Code Files

- **Modify**: `tools/learning-loop-mcp/core/loop-introspect.js` (add `buildInverseIndexes` function, ~30 lines)
- **Modify**: `tools/learning-loop-mcp/tools/loop-describe-tool.js` (cold tier: include `inverse_indexes` in response, ~10 lines)
- **Create**: `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js` (~80 lines)
- **Create**: `tools/learning-loop-mcp/__tests__/build-inverse-indexes.test.js` (~80 lines; 3-4 tests)
- **Create**: `tools/learning-loop-mcp/__tests__/meta-state-relationships.test.js` (~80 lines; 3-4 tests)
- **Modify**: `tools/learning-loop-mcp/tools/manifest.json` (register new tool, 1 line)
- **Modify**: `tools/learning-loop-mcp/server.js` (no edit needed — server.js auto-discovers from manifest)

## Implementation Steps

### Red: write the failing tests (TDD step 1)

1. In `__tests__/build-inverse-indexes.test.js`, write 3 test cases:
   - `test('empty registry returns 4 empty maps', ...)` — input: `[]`; expected: 4 maps, all empty.
   - `test('single-edge: rule with origin produces origin_inverse entry', ...)` — input: `[{ entry_kind: "rule", id: "rule-x", origin: "finding-y" }]`; expected: `origin_inverse.get("finding-y") === ["rule-x"]`.
   - `test('multi-edge: 3 loop-designs addressing same finding produce 1 inverse entry with 3 ids', ...)` — input: 3 loop-designs each with `addresses: ["finding-z"]`; expected: `addresses_inverse.get("finding-z").length === 3`.
   - `test('orphan coverage: entries with no relationships produce no inverse entries', ...)` — input: 1 finding with no ref fields; expected: 0 entries in any map.
2. In `__tests__/meta-state-relationships.test.js`, write 3 test cases:
   - `test('direction: both returns inbound + outbound for a sample entry', ...)` — pre-populated registry with 1 rule + 1 finding (rule has `origin: finding.id`); call `meta_state_relationships({ id: "rule-x", direction: "both" })`; expected: `inbound` has `origin: ["finding-y"]`, `outbound` has `origin: "finding-y"`.
   - `test('direction: inbound only excludes outbound field', ...)` — same setup, `direction: "inbound"`; expected: result has `inbound`, no `outbound`.
   - `test('missing id returns found: false', ...)` — call with `id: "nonexistent"`; expected: `{ found: false, id: "nonexistent" }`.
3. Run `npm test -- build-inverse-indexes meta-state-relationships` to confirm red.

### Green: implement the function (TDD step 2)

4. Edit `core/loop-introspect.js`:
   - Add `export function buildInverseIndexes(entries)` (the code block above).
5. Edit `tools/loop-describe-tool.js`:
   - In the cold tier branch, after `const entries = readRegistry(root)`, call `const indexes = buildInverseIndexes(entries)` and add `inverse_indexes: serializeMaps(indexes)` to the response.
   - `serializeMaps(maps)` converts each `Map` to a plain object (for JSON).
6. Re-run `build-inverse-indexes.test.js` → green.

### Green: implement the tool (TDD step 2 cont.)

7. Create `tools/meta-state-relationships-tool.js`:
   - Schema: `{ id: z.string().min(1), direction: z.enum(['inbound', 'outbound', 'both']).default('both') }`.
   - Handler: as above.
8. Edit `tools/manifest.json` to register the tool (1 line). `server.js` auto-discovers from manifest; no edit needed.
9. Re-run `meta-state-relationships.test.js` → green.

### Refactor + accept (TDD steps 3-4)

10. Extract `findEntryById(entries, id)` as a shared helper in `core/loop-introspect.js` (used by both the cold tier and the new tool). Unit-test it.
11. Verify the cold tier response includes `inverse_indexes` and that the maps match the expected counts (e.g., `origin_inverse.size === 4` — one per rule, since each rule has a unique origin finding).
12. Update the cold-tier regression fixture (Phase 0) to include the new `inverse_indexes` field. Run the regression test → green.
13. Run `npm test` — all tests pass.

## Success Criteria

- [ ] `buildInverseIndexes(entries)` returns 4 maps; verified counts match expected (`origin_inverse` for `meta-260601T1353Z-sanitizeslug-...` = 1 = the rule `rule-short-slug-for-risk-records`)
- [ ] Cold tier response includes `inverse_indexes` field with the 4 maps (serialized as objects)
- [ ] `meta_state_relationships` tool is registered in `tools/manifest.json` (server.js auto-discovers from manifest, no manual edit needed)
- [ ] Tool returns expected inbound + outbound + both for a sample entry
- [ ] 3-4 tests pass in each of `__tests__/build-inverse-indexes.test.js` and `__tests__/meta-state-relationships.test.js`
- [ ] The cold-tier regression fixture is updated to include the new field
- [ ] `npm test` passes

## Risk Assessment

- **Risk**: `buildInverseIndexes` is O(N) per cold-tier read; performance degrades at scale. → **Mitigation**: documented in design; revisit at ~500 entries. At 53 entries, ~1ms. Acceptable.
- **Risk**: the `promoted_to_rule` field shape varies (object or string). → **Mitigation**: the current registry only contains string values (migrated in 260606-rule-loop-design-first-class). The function uses `e.promoted_to_rule` directly. If a future migration introduces object shapes, the logic should be centralized in `core/loop-introspect.js` rather than duplicated here.
- **Risk**: the new tool's `inbound`/`outbound` shape confuses callers (which is which?). → **Mitigation**: shape is documented in the tool's `description` field; a code comment in the handler makes it explicit; a test asserts the directional semantics.
- **Risk**: the tool exposes cross-references that an agent shouldn't see (e.g., design intent for a future rule). → **Mitigation**: the tool is read-only and doesn't write; agents see what the registry contains. The `rule-cold-session-test-must-pass-before-resolution` consult pattern can be extended to gate sensitive relationship queries in a future plan (out of scope here).
