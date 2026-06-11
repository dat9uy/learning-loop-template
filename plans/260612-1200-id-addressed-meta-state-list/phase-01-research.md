---
phase: 1
title: "Research and contract design"
status: completed
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: Research and contract design

## Overview

Confirm the loop-design entry, the wire-format fix is shipped, and lock the contract for the two new filters before writing tests. The design is already documented in `loop-design-id-addressed-meta-state-list` and the originating finding `meta-260610T1457Z-tool-surface-gap-...`; this phase enumerates the touchpoints and writes the contract into the plan.

## Requirements

- Functional: lock the Zod schema for `id` and `ref_by`/`ref_field` (single string vs array vs optional; enum of allowed ref_field values; required-pair semantics).
- Functional: lock the handler filter order (ref_by/ref_field first, then id, then existing filters).
- Functional: lock the response shape additions (new fields in `filters_applied`).
- Non-functional: enumerate every `discoverability_hints.length` assertion site so Phase 2 updates them in one commit.
- Non-functional: confirm `meta-260610T1458Z-...` (wire-format coercion fix) is still active in the registry before depending on top-level array input.

## Architecture

The two new filters ride on the existing `meta_state_list` handler. The filter pipeline becomes:

1. `readRegistry(root)` — unchanged, LRU-cached
2. Auto-resolve / expiry check — unchanged
3. **NEW**: `ref_by`/`ref_field` filter — if set, build inverse indexes via `buildInverseIndexes(entries)` and select entries that reference the target. For `ref_field="origin"`, the inverse map is `origin_inverse` (rule -> finding). For all other ref_fields, the map is the matching inverse.
4. **NEW**: `id` filter — if set, build a `Set` of requested ids and select entries whose `id` is in the set. Array form is one pass; single-string form is wrapped to a 1-element array.
5. Existing filters (`category`, `status`, `affected_system`, `session_id`, `entry_kind`, `entry_kinds`) — applied via `filterEntries(entries, activeFilters)`.
6. Terminal-status + archived exclusion — unchanged.

Composition rule: `id` + `ref_by`/`ref_field` is AND. Both filters narrow further. The handler runs `ref_by`/`ref_field` first (uses the inverse index, more expensive to build), then `id` (set membership, O(1) per entry), then existing filters.

## Related Code Files

- Read: `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (current handler, ~140 lines)
- Read: `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js` (architectural template for `ref_by`/`ref_field`)
- Read: `tools/learning-loop-mcp/core/loop-introspect.js#buildInverseIndexes` (the 5 inverse maps we can leverage)
- Read: `tools/learning-loop-mcp/core/meta-state.js#filterEntries` (existing filter pipeline)
- Read: `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS` (12 entries today)
- Read: `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` (length 12 + 12 destructured + 12 substrings)
- Read: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (length 12 + new hint assertion)
- Read: `tools/learning-loop-mcp/__tests__/loop-describe.test.js` (tool count, if asserted)
- Read: `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS` (mirror array)
- Read: `meta-state.jsonl#loop-design-id-addressed-meta-state-list` (the design entry, currently `status: active`)
- Read: `meta-state.jsonl#meta-260610T1457Z-...` (the originating finding, currently `status: stale`)
- Read: `meta-state.jsonl#meta-260610T1458Z-...` (the wire-format fix, confirm `status: resolved`)

## Implementation Steps

### Step 1.1: Confirm the design entry and originating finding are still present

Run `meta_state_list({ entry_kind: 'loop-design', id: 'loop-design-id-addressed-meta-state-list' })` and assert:
- `status === "active"`
- `addresses` includes `meta-260610T1457Z-...`
- `proposed_design_for` is empty (per the post-fix-loop-design-refs state)

Run `meta_state_list({ id: 'meta-260610T1457Z-tool-surface-gap-meta-state-list-does-not-accept-id-single-o' })` and assert:
- `status === "stale"` (the design notes it was filed as a finding due to the wire-format block; re-emit happened, but the original finding may still be `stale`)

### Step 1.2: Confirm wire-format fix is shipped

Run `meta_state_list({ id: 'meta-260610T1458Z-next-session-target-fix-the-mcp-wire-format-coercion-bug-blo' })` and assert:
- `status === "resolved"`
- `resolution` mentions `McpServer.validateToolInput` and `coerceParamsToSchema` recursion

If not resolved, abort and surface to operator — the plan depends on top-level `id: string[]` working over stdio.

### Step 1.3: Enumerate hint-length assertion sites

```bash
cd /home/datguy/codingProjects/learning-loop-template
grep -rn "discoverability_hints.length\|hints.length" tools/learning-loop-mcp __tests__ 2>/dev/null
```

Expected sites (verify each):
- `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` (1 length assertion + 12 destructured)
- `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (1 length assertion)
- `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` (length check, if it walks DISCOVERABILITY_HINTS)
- `tools/learning-loop-mcp/core/loop-introspect.js` (the array itself)
- `.factory/hooks/loop-surface-inject.cjs` (the mirror)

### Step 1.4: Lock the Zod schema for the new filters

Write into this phase file (or `plan.md`):

```javascript
// Inside metaStateListTool.schema:
id: z.union([z.string(), z.array(z.string())]).optional()
  .describe("Filter by id (string or string[]). Missing ids are silently skipped."),
ref_by: z.string().optional()
  .describe("Filter entries that reference this id in ref_field. Pair with ref_field."),
ref_field: z.enum([
  "consolidated_into",
  "supersedes",
  "addresses",
  "proposed_design_for",
  "origin",
  "reopens",
]).optional()
  .describe("Field used by the ref_by filter. Required when ref_by is set."),
```

Validation rule: if `ref_by` is set, `ref_field` must also be set (and vice versa). Use a `superRefine` on the schema, or check in the handler with a clear error response.

### Step 1.5: Lock the inverse-index mapping

For each `ref_field` value, the handler uses the corresponding inverse map:

| `ref_field` | Inverse map | Map shape |
|-------------|-------------|-----------|
| `consolidated_into` | none (consolidated_into is a string on the finding, not an array on the change-log). The handler must scan entries and pick those where `entry.consolidated_into === ref_by`. | Scan |
| `supersedes` | `supersedes_inverse` | `Map<target_id, change_log_id[]>` |
| `addresses` | `addresses_inverse` | `Map<finding_id, loop_design_id[]>` |
| `proposed_design_for` | none (proposed_design_for is on the loop-design). Scan entries where `entry.proposed_design_for` includes `ref_by`. Tolerate the wire-format wrap `{item: [...]}`. | Scan |
| `origin` | `origin_inverse` | `Map<finding_id, rule_id[]>` |
| `reopens` | `reopens_inverse` | `Map<stale_id, finding_id[]>` |

For inverse-map-backed fields (`supersedes`, `addresses`, `origin`, `reopens`): O(1) lookup + O(K) result where K is the number of references.

For scan-backed fields (`consolidated_into`, `proposed_design_for`): O(N) per call. Acceptable at 540KB JSONL; revisit if the registry grows past 2MB.

### Step 1.6: Lock the response shape additions

```javascript
// In the handler output:
const output = {
  entries: ...,
  count: result.length,
  filters_applied: {
    ...activeFilters,
    ...(id && { id: Array.isArray(id) ? id : [id] }),
    ...(ref_by && { ref_by }),
    ...(ref_field && { ref_field }),
  },
  include_archived: ...,
  entry_kind_filter: ...,
  entry_kinds_filter: ...,
  compact: ...,
};
```

The `id` value is normalized to an array in `filters_applied` so the read-back is unambiguous (a single string vs a 1-element array).

### Step 1.7: Lock the error response for `ref_by` without `ref_field`

```javascript
if ((ref_by && !ref_field) || (!ref_by && ref_field)) {
  return {
    content: [{ type: "text", text: JSON.stringify({
      error: "ref_pair_required",
      message: "ref_by and ref_field must be set together",
    }) }],
  };
}
```

This is a soft error (not a thrown exception) so the agent gets a structured response to reason about.

### Step 1.8: Lock the 13th discoverability hint text

```
"Narrow query: prefer `meta_state_list({ id: [...] })` or `meta_state_list({ ref_by, ref_field })` over the unfiltered dump. The unfiltered list is for batch audit / sweep only; the narrow query is the default."
```

Target length: <280 chars (warm-tier budget).

## Success Criteria

- [x] Step 1.1 design entry + finding confirmed present with the expected statuses.
- [x] Step 1.2 wire-format fix confirmed resolved.
- [x] Step 1.3 every hint-length assertion site enumerated.
- [x] Step 1.4 Zod schema locked in this file.
- [x] Step 1.5 inverse-index / scan mapping locked in this file.
- [x] Step 1.6 response shape additions locked in this file.
- [x] Step 1.7 error response locked in this file.
- [x] Step 1.8 13th hint text locked in this file.
- [x] Phase output: a single inline code block of the locked Zod schema, the inverse map table, the response shape diff, the error response, and the 13th hint text.

## Risk Assessment

- **Risk**: 540KB JSONL on every `meta_state_list` call is the same cost as today. **Mitigation**: the inverse-index build is O(N) and pure; the existing `readRegistryWithCache` LRU absorbs the read cost; the inverse map build is the only new work and is small.
- **Risk**: 13 hints overloads warm-tier context. **Mitigation**: 13 × ~200 chars = ~2.6KB; under the 5KB hot-tier budget. The 13th hint is intentionally compact.
- **Risk**: `consolidated_into` and `proposed_design_for` are scan-backed. **Mitigation**: the scan is O(N) over a 540KB JSONL (~5ms); same order of magnitude as the current LRU-cached read. Revisit if registry grows.

## Hand-off to Phase 2

Phase 2 writes the failing TDD tests first, then implements the schema and handler changes. Phase 2 also adds the 13th hint and updates the canonical array + hook mirror + warm-tier test.
