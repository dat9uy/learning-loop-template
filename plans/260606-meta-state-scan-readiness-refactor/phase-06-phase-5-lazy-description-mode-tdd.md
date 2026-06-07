---
phase: 6
title: "Refactor #6: Lazy Description Mode on Cold Tier (TDD)"
status: pending
priority: P2
effort: "1.5h"
dependencies: [5]
---

# Phase 6: Refactor #6 — `description_mode: 'summary' | 'full'` on Cold Tier

## Overview

Adds a `description_mode` enum to `loop_describe` schema. Cold tier defaults to `'full'` (preserves existing behavior, no breaking change); warm/hot tiers default to `'full'`. Summary mode returns a 200-char preview of the description plus the relationship-relevant fields. Full mode returns the entry as today. Cold-tier token cost drops from ~30K to ~8K in summary mode when explicitly requested.

## Requirements

- **Functional**: `loop_describe({ tier: 'cold' })` (no flag) returns full descriptions (default: `full`); `loop_describe({ tier: 'cold', description_mode: 'summary' })` returns descriptions truncated to 200 chars.
- **Non-functional**: cold-tier token count in summary mode ≤ 16K (down from 30K); `summarize(entry)` is a pure function in `core/loop-introspect.js` (reusable for Phase 7's `registry_summary` field); the schema is opt-in (existing callers see no diff).

## Architecture

A pure function `summarize(entry)` in `core/loop-introspect.js` projects an entry to its summary shape:
- `id`, `entry_kind`, `status`, `origin`, `addresses`, `consolidated_into`, `supersedes`, `promoted_to_rule`, `proposed_design_for`, `description_preview: entry.description?.slice(0, 200) + (entry.description?.length > 200 ? '...' : '')`.

The `loop_describe` tool's schema gains `description_mode: z.enum(['summary', 'full']).optional()`. The cold tier branch uses `mode ?? 'full'` (default for cold, preserves existing behavior); warm/hot use `mode ?? 'full'`.

```
loop_describe({ tier: 'cold', description_mode: 'summary' })
  → entries = readRegistry(root) + filter
  → summary = entries.map(summarize)
  → loop_designs = introspect.listLoopDesigns(root).map(summarize)
  → return { tier: 'cold', entries: summary, loop_designs, ... }

loop_describe({ tier: 'warm' })  // description_mode not specified
  → entries = ... (warm tier logic unchanged)
  → return { tier: 'warm', entries, description_mode: 'full', ... }
```

The `description_mode` field is also included in the response (so callers know what mode they got).

**Lock-in decisions:**
- (a) **`full` is the cold-tier default (no breaking change).** Existing callers that depend on `entry.description` receive full text. Callers that want summary mode must explicitly pass `description_mode: 'summary'`.
- (b) **200 char preview.** 50 is too short; 500 doubles the cost. 200 is the sweet spot.
- (c) **`summarize(entry)` is a pure function in `core/loop-introspect.js`.** Reusable for Phase 7's `registry_summary` field.
- (d) **`summarize` is applied to `loop_designs` too.** In cold-tier summary mode, the `loop_designs` array is also passed through `summarize` so both findings and loop-designs ship truncated descriptions.

## Related Code Files

- **Modify**: `tools/learning-loop-mcp/core/loop-introspect.js` (add `summarize` function, ~15 lines)
- **Modify**: `tools/learning-loop-mcp/tools/loop-describe-tool.js` (schema + cold tier branch, ~20 lines)
- **Create**: `tools/learning-loop-mcp/__tests__/loop-describe-description-mode.test.js` (~80 lines; 3 tests)
- **Create**: `tools/learning-loop-mcp/__tests__/summarize.test.js` (~50 lines; 3-4 tests for the pure function)

## Implementation Steps

### Red: write the failing tests (TDD step 1)

1. In `__tests__/summarize.test.js`, write 3 test cases:
   - `test('truncates description to 200 chars and adds ellipsis', ...)` — input: entry with 500-char description; expected: `description_preview.length === 203` (200 + "...").
   - `test('description under 200 chars is returned as-is, no ellipsis', ...)` — input: entry with 50-char description; expected: `description_preview === description` (50 chars, no ellipsis).
   - `test('preserves all relationship fields (id, kind, status, refs)', ...)` — input: full entry; expected: all 6-8 ref fields present in output.
2. In `__tests__/loop-describe-description-mode.test.js`, write 3 test cases:
   - `test('cold tier with no description_mode returns full mode (default, no breaking change)', ...)` — call with `tier: 'cold'`; expected: response has `description_mode: 'full'` and entries have full `description`.
   - `test('cold tier with description_mode: summary returns truncated descriptions', ...)` — call with `tier: 'cold', description_mode: 'summary'`; expected: entries have `description_preview` (no `description`).
   - `test('warm tier with no description_mode returns full mode (default)', ...)` — call with `tier: 'warm'`; expected: response has `description_mode: 'full'`.
3. Run `npm test -- summarize loop-describe-description-mode` to confirm red.

### Green: implement the function (TDD step 2)

4. Edit `core/loop-introspect.js`:
   - Add `export function summarize(entry)` (the code block above).
5. Re-run `summarize.test.js` → green.

### Green: implement the tool branch (TDD step 2 cont.)

6. Edit `tools/loop-describe-tool.js`:
   - Add `description_mode: z.enum(['summary', 'full']).optional()` to the schema.
   - In the cold tier branch, compute `const mode = description_mode ?? 'full'` and apply `summarize` to each entry when `mode === 'summary'`. Also apply `summarize` to `loop_designs` when `mode === 'summary'`.
   - In the warm/hot tier branches, default `mode` to `'full'`.
   - Include `description_mode` in the response so callers know which mode they received.
7. Re-run `loop-describe-description-mode.test.js` → green.

### Refactor + accept (TDD steps 3-4)

8. Extract `formatDescriptionPreview(description, maxChars = 200)` as a helper. Unit-test it.
9. Update the cold-tier regression fixture (Phase 0) to include `description_mode: 'summary'` and verify the cold tier response token count ≤ 16K.
10. Run `npm test` — all tests pass.

## Success Criteria

- [ ] `loop_describe({ tier: 'cold' })` (no flag) returns full descriptions (default: `full` — no breaking change)
- [ ] `loop_describe({ tier: 'cold', description_mode: 'summary' })` returns descriptions truncated to 200 chars
- [ ] Cold-tier token count in summary mode ≤ 16K (down from 30K)
- [ ] 3-4 tests pass in `__tests__/summarize.test.js` and `__tests__/loop-describe-description-mode.test.js`
- [ ] The cold-tier regression fixture is updated with the new shape
- [ ] `npm test` passes

## Risk Assessment

- **Risk**: the 200-char preview cuts off mid-sentence, making the summary hard to read. → **Mitigation**: the preview is appended with `'...'`; the full description is still available via `meta_state_list({ id: ... })` or `loop_describe({ description_mode: 'full' })`. The preview is a teaser, not a replacement.
- **Risk**: warm tier defaults to `'full'` but some callers expect `'summary'` (e.g., a tool that already loaded the full data and doesn't need it again). → **Mitigation**: the warm tier is small (~5K tokens); full mode is fine. The flag is opt-in; callers can request `summary` if they want.
- **Risk**: the `description_mode` field name collides with a future use. → **Mitigation**: the field is on `loop_describe` only; other tools can name their own fields freely. Documented in the schema description.
- **Risk**: cold tier summary mode breaks a tool that expected the full `description` field. → **Mitigation**: the default is `'full'`, so existing tools see no diff. Callers must explicitly opt in to `summary`.
