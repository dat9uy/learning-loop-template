---
phase: 1
title: "Schema Extension"
status: pending
priority: P2
effort: 4h
dependencies: []
---

# Phase 1: Schema Extension

## Overview

Extend `meta-state-report-tool.js` zod schema with `loop-anti-pattern` category, optional `subtype`, optional `promoted_to_rule` object. Mirror in `core/record-writer.js` for direct-call compatibility. No breaking changes to existing categories or callers.

## Requirements

**Functional:**
- New category `loop-anti-pattern` accepted in `meta_state_report`
- Optional `subtype` field for anti-pattern findings
- Optional `promoted_to_rule` object: `{ rule_id, enforcement: gate|agent|tool, pattern_type: regex|glob, pattern, promoted_at, promoted_by }`
- All existing categories and behaviors unchanged

**Non-functional:**
- Schema validation latency < 1ms
- Backward-compatible with existing `meta_state_report` callers
- Mirror schema in `record-writer.js` exactly (test verifies parity)

## Architecture

`meta_state_report` is the entry point. Extending its zod schema makes new fields available to:
- MCP tool callers (via the schema's describe)
- Direct `record-writer.js` users (mirror schema)
- Tests (no separate schema to update)

`promoted_to_rule` is **optional**. Findings without it are ordinary (24h TTL, status: reported). Findings with it are eligible for gate enforcement when `status: active`.

## Related Code Files

**Modify:**
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js` (line ~10: extend zod schema)
- `tools/learning-loop-mcp/core/record-writer.js` (mirror schema for direct calls)

**Create:**
- `tools/learning-loop-mcp/__tests__/meta-state-schema.test.js`

## TDD Structure

### Tests Before (regression — current behavior)

1. Existing `gate-logic-bug` category still validates
2. Invalid category still rejected (`not-a-category` → fail)
3. Entry without `subtype` or `promoted_to_rule` still validates
4. `record-writer.js` schema matches `meta-state-report-tool.js` schema (parity test)

### Refactor (code changes those tests protect)

1. Add `loop-anti-pattern` to category enum:
   ```js
   category: z.enum([
     "gate-logic-bug", "record-repair-gap", "schema-drift",
     "stale-ref", "mcp-tool-missing", "budget-check",
     "loop-anti-pattern",
   ])
   ```

2. Add optional `subtype` and `promoted_to_rule`:
   ```js
   subtype: z.string().optional()
     .describe("Subtype for loop-anti-pattern findings (e.g., escape-hatch-abuse, new-artifact-type, schema-bloat)"),
   promoted_to_rule: z.object({
     rule_id: z.string(),
     enforcement: z.enum(["gate", "agent", "tool"]),
     pattern_type: z.enum(["regex", "glob"]).describe("Pattern language: regex for command content, glob for file paths"),
     pattern: z.string().describe("Pattern string (regex or glob depending on pattern_type)"),
     promoted_at: z.string(),
     promoted_by: z.string(),
   }).optional(),
   ```

3. Mirror schema in `record-writer.js` (extract a shared schema constant to avoid drift)

### Tests After (new behavior)

1. `category: "loop-anti-pattern"` accepted
2. `category: "loop-anti-pattern", subtype: "new-artifact-type"` accepted
3. `subtype` without `loop-anti-pattern` category accepted (forward compat)
4. `promoted_to_rule` with `pattern_type: "regex"` accepted
5. `promoted_to_rule` with `pattern_type: "glob"` accepted
6. Invalid `pattern_type` rejected
7. `promoted_to_rule` without `rule_id` rejected
8. Full entry with all new fields round-trips through `writeEntry` and `readRegistry`

### Regression Gate

```bash
cd tools/learning-loop-mcp && pnpm test __tests__/meta-state-schema.test.js
```

## Implementation Steps

1. Read current `meta-state-report-tool.js` and `record-writer.js` to find the schema definition
2. Write 4 regression tests (Tests Before); run; pass
3. Extract a shared `metaStateEntrySchema` constant in `core/record-writer.js`
4. Update both `meta-state-report-tool.js` and `record-writer.js` to use the shared constant
5. Add `loop-anti-pattern` to category enum
6. Add `subtype` and `promoted_to_rule` fields
7. Write 8 new behavior tests (Tests After); run; pass
8. Run full test suite: `pnpm test`
9. Verify `index_validate` still passes: `pnpm validate:records`

## Success Criteria

- [ ] `loop-anti-pattern` category accepted
- [ ] `subtype` and `promoted_to_rule` optional, validated when present
- [ ] All existing categories unchanged
- [ ] Schema parity test passes (tool and writer use same schema)
- [ ] All 12 tests pass (4 before + 8 after)
- [ ] Full test suite passes
- [ ] `index_validate` passes

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Breaking change to existing callers | All new fields optional; existing schemas unchanged |
| Schema drift between tool and writer | Shared constant; parity test |
| Zod validation performance | Optional fields with simple types; < 1ms |
| Backward compat with existing `meta-state.jsonl` entries | `updateEntry` preserves unknown fields; no migration needed in this phase |
| Operator impersonation via `meta_state_report` (RT Finding 1) | `promoted_to_rule` removed from `meta_state_report` zod schema; only settable via new `meta_state_promote_rule` tool |
| `meta-state.jsonl` direct-write bypass (RT Finding 2) | All meta-state writes use `writeEntry` / `updateEntry`; bash gate PATH_WRITE_PATTERNS extended (Phase 2 work) |

## Red Team Findings Applied

**RT Finding 1 (Operator Impersonation) — High:** The `promoted_to_rule` field is REMOVED from the `meta_state_report` zod schema. The field is only settable via a new `meta_state_promote_rule` tool (added in Phase 2 with operator-only role check). The `status` field's zod enum for `meta_state_report` is restricted to `"reported"` only; `status: "active"` and beyond require `meta_state_ack` or `meta_state_promote_rule`.

**RT Finding 11 (Schema Parity Wrong Location) — High:** The shared `metaStateEntrySchema` constant goes in `core/meta-state.js`, NOT in `core/record-writer.js`. Rationale: `record-writer.js` is for record YAML files (`records/<surface>/<type>/*.yaml`); `meta-state.js` is for the `meta-state.jsonl` registry. Different storage paths, different writers. The constant lives with the registry.

**Updated Implementation Steps:**

1. Read `meta-state-report-tool.js` and `meta-state.js` to find the schema definition
2. Write 4 regression tests (Tests Before); run; pass
3. Create shared `metaStateEntrySchema` in `core/meta-state.js` (export)
4. Update `meta-state-report-tool.js` to import the shared schema
5. Add `loop-anti-pattern` to category enum in the shared schema
6. Add `subtype` field in the shared schema
7. **DO NOT** add `promoted_to_rule` to `meta_state_report` schema (per RT Finding 1)
8. **RESTRICT** `status` enum in `meta_state_report` to `"reported"` only (per RT Finding 1)
9. Write 8 new behavior tests (Tests After); run; pass
10. Run full test suite: `pnpm test`
11. Verify `index_validate` still passes: `pnpm validate:records`

**Updated Success Criteria:**

- [ ] `loop-anti-pattern` category accepted
- [ ] `subtype` field optional, validated when present
- [ ] **`promoted_to_rule` NOT in `meta_state_report` schema** (RT Finding 1)
- [ ] **`status` enum for `meta_state_report` restricted to `"reported"`** (RT Finding 1)
- [ ] All existing categories unchanged
- [ ] **Shared schema constant in `core/meta-state.js`** (RT Finding 11)
- [ ] All 12 tests pass (4 before + 8 after)
- [ ] Full test suite passes
- [ ] `index_validate` passes
