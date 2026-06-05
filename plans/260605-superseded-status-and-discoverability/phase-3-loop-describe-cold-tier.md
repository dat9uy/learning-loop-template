---
phase: 3
title: "loop_describe({ tier: 'cold' }) superseded lineage surface (TDD, 4 tests)"
status: completed
priority: P2
effort: "3h"
dependencies: ["phase-2"]
---

# Phase 3: `loop_describe({ tier: 'cold' })` Superseded Lineage Surface

## Overview

This phase adds a new section to the `loop_describe` MCP tool's `cold` tier response: a "Superseded Lineage" section that lists all finding entries with a `consolidated_into` field, grouped by their canonical change-log. The agent can then trace old findings to their canonical source without reading the registry directly. The section is appended to the existing `cold`-tier response shape (which currently has counts, tool list, findings summary).

TDD structure: 4 new tests lock the contract (cold tier includes consolidated entries grouped by change-log; cold tier excludes entries without consolidated_into; cold tier handles orphaned consolidated_into; end-to-end G8 lineage proof). 1 file modify (`tools/loop-describe-tool.js`).

## Requirements

- **Functional:**
  - `loop_describe({ tier: 'cold' })` includes a new top-level field `superseded_lineage` in its response.
  - The `superseded_lineage` field is an array of groups, one per change-log entry that is referenced as a `consolidated_into` target.
  - Each group has shape: `{ change_log: <entry>, findings: [<finding>, ...] }` where `<entry>` is the change-log entry and `<finding>` is each finding that points to it via `consolidated_into`.
  - Findings are sorted by `id` within each group (deterministic ordering).
  - Groups are sorted by change-log `created_at` (most recent first; new consolidations appear at the top).
  - If a finding's `consolidated_into` points to a non-existent change-log (orphan), the finding is listed in a separate "orphans" group with a `note: 'change-log not found'` field.
  - If no findings have `consolidated_into`, the `superseded_lineage` field is an empty array (not omitted).
- **Non-functional:**
  - The new section is appended to the response; the existing `summary`, `tools`, and `findings` fields are unchanged.
  - The tool's existing `tier: 'summary' | 'hot' | 'warm' | 'cold'` semantics are preserved (the new section is `cold` only).
  - The change-log entries themselves are NOT in the `findings` array (they have `entry_kind: 'change-log'`); they are referenced from `superseded_lineage[].change_log`.

## Architecture

### `loop_describe` cold-tier response shape (current)

```js
{
  tier: "cold",
  degraded: false,
  counts: { findings: N, change_logs: M, ... },
  tools: [<tool list>],
  findings: [<finding entries>],  // status != 'superseded' (no change; this phase doesn't filter findings)
  // ... existing fields ...
}
```

### New `cold`-tier response shape (this phase)

```js
{
  tier: "cold",
  degraded: false,
  counts: { findings: N, change_logs: M, ... },
  tools: [<tool list>],
  findings: [<finding entries>],  // unchanged
  superseded_lineage: [             // NEW
    {
      change_log: { id, created_at, change_target, reason, supersedes, ... },
      findings: [{ id, status, consolidated_into, description_tail, ... }, ...],
    },
    // ... more groups, sorted by change_log.created_at desc ...
  ],
  orphans: [                        // NEW (only present if orphans exist)
    { id, consolidated_into, note: "change-log not found" },
  ],
}
```

### Implementation sketch

```js
// In tools/loop-describe-tool.js, in the cold-tier branch:

const allEntries = readRegistry(root);
const findings = allEntries.filter(e => e.entry_kind !== "change-log");
const changeLogs = allEntries.filter(e => e.entry_kind === "change-log");
const changeLogMap = new Map(changeLogs.map(cl => [cl.id, cl]));

const superseded = findings.filter(f => f.status === "superseded" && typeof f.consolidated_into === "string");

// Group by consolidated_into
const groups = new Map();
const orphans = [];
for (const f of superseded) {
  const target = changeLogMap.get(f.consolidated_into);
  if (!target) {
    orphans.push({ id: f.id, consolidated_into: f.consolidated_into, note: "change-log not found" });
    continue;
  }
  if (!groups.has(target.id)) groups.set(target.id, { change_log: target, findings: [] });
  groups.get(target.id).findings.push(f);
}

// Sort
const lineage = Array.from(groups.values())
  .map(g => ({ change_log: g.change_log, findings: g.findings.sort((a, b) => a.id.localeCompare(b.id)) }))
  .sort((a, b) => b.change_log.created_at.localeCompare(a.change_log.created_at));

return {
  tier: "cold",
  degraded: false,
  counts: { /* ... */ },
  tools: [ /* ... */ ],
  findings: findings.filter(f => f.status !== "superseded"),  // optional: exclude superseded from main list (defer; this phase keeps all findings)
  superseded_lineage: lineage,
  ...(orphans.length > 0 && { orphans }),
};
```

## Related Code Files

- Modify: `tools/learning-loop-mcp/tools/loop-describe-tool.js` (cold-tier branch adds `superseded_lineage` and optional `orphans` fields)
- Test fixture: `tools/learning-loop-mcp/__tests__/loop-describe-cold-tier-superseded.test.js` (4 new tests, TDD)

## Implementation Steps

1. **Test 1 (red):** cold tier includes consolidated entries grouped by change-log — write a fixture registry with 1 change-log + 2 findings (both `consolidated_into: <changeLogId>`); invoke `loop_describe({ tier: 'cold' })`; expect `superseded_lineage[0].change_log.id === <changeLogId>` and `superseded_lineage[0].findings.length === 2`.
2. **Test 2 (red):** cold tier excludes entries without `consolidated_into` — write a fixture with 1 finding (no `consolidated_into` field) + 1 finding (with `consolidated_into`); expect `superseded_lineage.length === 1` (only the second one counts).
3. **Test 3 (red):** cold tier handles orphaned `consolidated_into` — write a fixture with 1 finding where `consolidated_into` points to a non-existent id; expect `orphans.length === 1` and `orphans[0].id === <finding id>`.
4. **Test 4 (red):** end-to-end G8 lineage proof — use the real Phase 2 mutation (4 G8 findings consolidated into 1 change-log); invoke `loop_describe({ tier: 'cold' })`; expect exactly 1 lineage group with 4 findings, the change-log has `supersedes: <4 ids>`, and the findings are sorted by id.
5. **Implementation:** modify `tools/loop-describe-tool.js` (cold-tier branch).
6. **Verify all 4 tests pass; verify Phase 1's 6 tests still pass; verify Phase 2's 2 tests still pass; verify the 557 existing tests still pass.**

## Success Criteria

- [ ] `loop_describe({ tier: 'cold' })` returns a `superseded_lineage` array.
- [ ] The array contains 1 entry per `consolidated_into` target, with `change_log` and `findings` fields.
- [ ] Groups are sorted by change-log `created_at` desc.
- [ ] Findings within each group are sorted by id.
- [ ] Orphaned `consolidated_into` (target not found) are surfaced in a separate `orphans` array.
- [ ] All Phase 1 + Phase 2 tests still pass.
- [ ] All existing tests still pass.
- [ ] The 4 new tests for Phase 3 pass.

## Risk Assessment

- **Risk:** the cold-tier response shape change could break consumers that assert on the exact field set. **Mitigation:** the new fields are additive (no existing fields are removed or renamed). The cold tier is documented as a "full history" tier, not a stable contract; consumers should be tolerant of new fields. A new test asserts that the existing fields are unchanged.
- **Risk:** the `findings` array in the cold tier could become large if many entries are superseded. **Mitigation:** this phase does NOT add superseded entries to the main `findings` array (they are referenced from `superseded_lineage`). If a future phase wants to include them in the main array, capture as a follow-up.
- **Risk:** the orphan handling could silently drop findings. **Mitigation:** orphans are surfaced in a separate `orphans` array with a `note` field. The tool's response is not silent; consumers can detect orphans and act on them.
- **Risk:** the cold tier now does 2 reads of the registry (the existing path + the new lineage computation). **Mitigation:** the new computation reuses the already-read registry (no extra I/O).
