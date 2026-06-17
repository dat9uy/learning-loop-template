---
phase: 2
title: "fix-meta-state-relationships"
status: pending
priority: P1
effort: "1-2h"
dependencies: ["phase-01-fix-meta-state-list"]
---

# Phase 2: fix-meta-state-relationships

## Overview

Fix the `meta_state_relationships` inverse-traversal gap: when a finding is superseded by a change-log (via the change-log's `consolidates` field), querying the change-log's relationships should show `inbound.consolidated_by: [<finding-id>]`. Currently only the finding's `outbound.consolidated_into` is populated; the inverse is not computed. Resolves `meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into` (active, expires 2026-06-17T06:52:18Z).

## Context Links

- `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js:56-79` — the bug site; inbound map missing `consolidated_by`
- `tools/learning-loop-mcp/core/loop-introspect.js:248-309` — `buildInverseIndexes` returns 5 maps; needs a 6th (`consolidated_into_inverse`)
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js:126-144` — the scan-based pattern for `consolidated_into` (Plan 260611-1000 precedent; not inverse-backed)
- `plans/reports/brainstorm-260617-0212-pre-plan-3-prerequisite-fixes.md` § Open Q1 — semantic unification not relevant here (inverse map is a new field)
- `meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into` (active finding)

## Requirements

- **Functional:** `meta_state_relationships({id: <change-log-id>, direction: "inbound"})` returns `inbound.consolidated_by: [<finding-id>]` when the change-log's `consolidates` field references the finding. The reverse query (`id: <finding-id>, direction: "outbound"`) still returns `outbound.consolidated_into: <change-log-id>`.
- **Non-functional:** the fix adds 1 inverse map to `buildInverseIndexes` (5 → 6 maps); the new map follows the existing pattern; the change propagates to the mastra peer via the legacy-handler-adapter.

## Architecture

The fix is a 2-part change:

**Part A — `core/loop-introspect.js#buildInverseIndexes`** (add `consolidated_into_inverse`):

```js
// Current (line 248-309): 5 maps
// addresses_inverse, supersedes_inverse, origin_inverse,
// promoted_to_rule_inverse, reopens_inverse

// Fixed: add consolidated_into_inverse
export function buildInverseIndexes(entries) {
  const addressesInverse = new Map();
  const supersedesInverse = new Map();
  const originInverse = new Map();
  const promotedToRuleInverse = new Map();
  const reopensInverse = new Map();
  const consolidatedIntoInverse = new Map();  // NEW: change-log -> findings[]

  for (const entry of entries) {
    // ... existing 5 map populations ...

    // NEW: consolidated_into: change-log -> findings it consolidates
    // The change-log's `consolidates` field (CSV string of finding ids per
    // spec) is the forward ref; the inverse is `consolidated_by: <findings[]>`.
    if (entry.entry_kind === "change-log" && entry.consolidates) {
      // Tolerate CSV string (canonical) and array (wire-format wrap).
      const ids = typeof entry.consolidates === "string"
        ? entry.consolidates.split(",").map((s) => s.trim()).filter(Boolean)
        : Array.isArray(entry.consolidates) ? entry.consolidates : [];
      for (const findingId of ids) {
        if (!consolidatedIntoInverse.has(findingId)) consolidatedIntoInverse.set(findingId, []);
        consolidatedIntoInverse.get(findingId).push(entry.id);
      }
    }
  }

  return {
    addresses_inverse: addressesInverse,
    supersedes_inverse: supersedesInverse,
    origin_inverse: originInverse,
    promoted_to_rule_inverse: promotedToRuleInverse,
    reopens_inverse: reopensInverse,
    consolidated_into_inverse: consolidatedIntoInverse,  // NEW
  };
}
```

**Part B — `tools/meta-state-relationships-tool.js`** (expose `consolidated_by`):

```js
// Add after line 66 (inboundReopens):
const inboundConsolidated = inverse.consolidated_into_inverse.get(id);
if (inboundConsolidated && inboundConsolidated.length > 0) inbound.consolidated_by = inboundConsolidated;
```

**Why not route through `withBothMcpServers` or another helper?** `meta_state_relationships` is a legacy tool; the fix is in the legacy `core/loop-introspect.js` and the legacy tool. The mastra peer wraps the legacy handler; the fix propagates automatically.

**Why is `consolidates` a CSV string (not array)?** Per the meta-state spec (`schemas/meta-state.schema.json`); change-log entries store `consolidates: "id1,id2,id3"`. The fix tolerates CSV (canonical) + array (wire-format wrap from `meta_state_patch` passthrough).

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/loop-introspect.js:248-309` (add 1 map; ~10 lines)
- Modify: `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js:66-79` (add 1 inbound key; ~2 lines)
- Extend: `tools/learning-loop-mcp/core/loop-introspect.test.js` (or co-located test if absent) — 1 RED assertion that all 6 maps are present
- Extend: `tools/learning-loop-mcp/tools/meta-state-relationships-tool.test.js` (or co-located test if absent) — 1 RED assertion for the `consolidated_by` traversal
- No new files. No schema changes. No mastra-side changes.

## Implementation Steps

1. **RED test 1 (inverse map):** in `core/loop-introspect.test.js`, add an assertion that `buildInverseIndexes(entries)` returns an object with 6 keys: `addresses_inverse`, `supersedes_inverse`, `origin_inverse`, `promoted_to_rule_inverse`, `reopens_inverse`, `consolidated_into_inverse`. The 6th key should be missing in the current code. Run the test: should FAIL.
2. **RED test 2 (traversal):** in `meta-state-relationships-tool.test.js`, add a fixture with 1 finding + 1 change-log where the change-log's `consolidates: "<finding-id>"`. Call `meta_state_relationships({id: <change-log-id>, direction: "inbound"})`. Assert the result has `inbound.consolidated_by: [<finding-id>]`. Run the test: should FAIL.
3. **GREEN fix Part A:** add `consolidatedIntoInverse` map + population in `buildInverseIndexes`. Re-run RED test 1: should PASS.
4. **GREEN fix Part B:** add the `inboundConsolidated` lookup in `meta-state-relationships-tool.js`. Re-run RED test 2: should PASS.
5. **Regression check:** run `pnpm test` to confirm 0 regressions.
6. **Commit:** `fix(meta-state-relationships): traverse consolidated_into as inbound ref` (1 commit).

## Success Criteria

- [ ] RED test 1 fails on master (current code has 5 maps, not 6)
- [ ] RED test 2 fails on master (current code doesn't expose `consolidated_by`)
- [ ] Both GREEN after the fix
- [ ] `pnpm test` shows all 9 test namespaces pass (durable 9-namespace anchor) + 0 regressions
- [ ] `meta_state_relationships({id: <change-log-id>, direction: "inbound"})` returns `inbound.consolidated_by: [<finding-id>]`
- [ ] `meta_state_relationships({id: <finding-id>, direction: "outbound"})` still returns `outbound.consolidated_into: <change-log-id>` (outbound direction preserved)
- [ ] `meta_state_relationships({id: <id>, direction: "both"})` returns both `outbound` and `inbound` (default preserved)
- [ ] Phase 5 calls `meta_state_resolve` on `meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into`

## Risk Assessment

- **6th map changes `buildInverseIndexes` return shape → 5 existing callers break.** Low: the function returns a plain object; callers destructure by key. Adding a 6th key is backward-compatible. Mitigation: extend the existing test (or add a new assertion) that asserts all 6 keys are present + all 5 existing maps still work.
- **CSV vs array parsing misses edge cases.** Low: the spec is CSV; the wire-format wrap is array. The fix handles both; other shapes fall through to `[]` (no map population). Pre-flight: assert that an entry with `consolidates: "id1,id2"` populates 2 entries; an entry with `consolidates: ["id1", "id2"]` populates 2 entries; an entry with `consolidates: null` populates 0.
- **TTL expires before Phase 2 lands.** Same as Phase 1: ~3h window. Mitigation: `meta_state_ack` at RED-time or `meta_state_resolve` in Phase 5.

## Security Considerations

- No security impact. The fix exposes an additional inbound reference; the data is already in the registry (the change-log's `consolidates` field); no new attack surface.
