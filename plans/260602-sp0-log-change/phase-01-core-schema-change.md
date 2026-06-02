---
phase: 1
title: "Core Schema Change: Discriminated Union (TDD)"
status: pending
priority: P2
effort: "6-8h"
dependencies: []
---

# Phase 1: Core Schema Change (TDD, post-red-team)

## Overview

Refactor `core/meta-state.js` to support two entry kinds (finding and change-log) without breaking the 5 existing meta-state tools or the existing test suite. The structural change: **rename** the existing `metaStateEntrySchema` to `metaStateFindingEntrySchema` (a `z.object` with `.shape` available); add a new `metaStateChangeEntrySchema` (a `z.object` with `.shape` available); add a thin `metaStateEntrySchema = z.union([finding, change-log])` for cross-cutting validation. Update the 5 existing tools to use `metaStateFindingEntrySchema.shape` and to set `entry_kind: "finding"` explicitly on the entries they build. Update the 9 existing `safeParse` test cases in `__tests__/meta-state-schema.test.js` to use the branch-specific schema (or add `entry_kind: "finding"` to input). `readRegistry()` coerces the 15 legacy entries (no `entry_kind` field) to `entry_kind: "finding"` on read. `filterEntries()` gains an optional `entry_kind` filter. Tests-first: 12 new tests + 10 existing test updates, all derived from the patterns in `core/meta-state.test.js` and `__tests__/meta-state-schema.test.js`.

## Requirements

- Functional:
  - `metaStateFindingEntrySchema` (renamed from existing `metaStateEntrySchema`): zod object with `entry_kind: z.literal("finding").default("finding")` plus the existing 7-category enum, 6-affected_system enum, `description`, etc. Has `.shape`.
  - `metaStateChangeEntrySchema` (new export): zod object with `entry_kind: "change-log"`, `change_dimension` (3-bucket enum), `change_target` (string, min 1), `change_diff` (object with `added`/`removed`/`changed` arrays), `reason` (string, min 20), optional `applies_to`, `supersedes`, `evidence`, plus `status: "active"`, `created_at`, `version`. Has `.shape`.
  - `metaStateEntrySchema` (refactored): `z.union([metaStateFindingEntrySchema, metaStateChangeEntrySchema])` for cross-cutting validation. Does NOT have `.shape` (by zod design — use the branch schemas for `.shape`).
  - `readRegistry()` (modified): legacy entries (no `entry_kind`) coerced to `entry_kind: "finding"` on read
  - `filterEntries()` (modified): optional `entry_kind` parameter; when provided, only matching entries are returned
  - **Tool file updates** (NEW per red-team): the 5 existing finding tools update `metaStateEntrySchema.shape` → `metaStateFindingEntrySchema.shape` in their `schema:` field, and set `entry_kind: "finding"` explicitly on the entries they construct.
  - **Test file updates** (NEW per red-team): 9 existing `safeParse` test cases in `__tests__/meta-state-schema.test.js` update to use `metaStateFindingEntrySchema.safeParse(...)` (or add `entry_kind: "finding"` to their input). The 1 `.shape` comparison test updates to use `metaStateFindingEntrySchema.shape`.
  - **Compaction invariant comment** (NEW per red-team): a comment in `updateEntry`'s compaction block documenting that change-log entries are never compacted (they are immutable audit log with status=active).
  - `applyPromotedRules` cross-reference (NEW per red-team): add a risk row in this phase's risk assessment about the `applyPromotedRules` filter (`category === "loop-anti-pattern"`) not matching change-log entries. Already in lock report; cross-referenced here.
- Non-functional:
  - 16 existing tests in `core/meta-state.test.js` pass without modification (regression-safety floor)
  - 12 existing tests in `__tests__/meta-state-schema.test.js` UPDATED to use the new schema names (10 test cases: 9 safeParse + 1 .shape comparison)
  - 12 new tests pass (described below)
  - The 5 existing meta-state tools continue to work after their tool file updates
  - `pnpm test` total increases from N to N+12 (existing 12 in `meta-state-schema.test.js` are updated, not added; new 12 are added)

## Architecture (post-red-team)

### New schema structure (in `core/meta-state.js`)

The existing `metaStateEntrySchema` is **renamed** to `metaStateFindingEntrySchema`. A new `metaStateChangeEntrySchema` is added. A new thin `metaStateEntrySchema` is the cross-cutting union.

```js
// RENAMED from the existing metaStateEntrySchema
// Adds entry_kind: z.literal("finding").default("finding") at the top
export const metaStateFindingEntrySchema = z.object({
  entry_kind: z.literal("finding").default("finding"),
  category: z.enum([
    "gate-logic-bug", "record-repair-gap", "schema-drift",
    "stale-ref", "mcp-tool-missing", "budget-check",
    "loop-anti-pattern",
  ]).describe("Category of the finding"),
  severity: z.enum(["warning", "escalate"]).describe("Severity level"),
  affected_system: z.enum([
    "gate-logic", "record-validation", "index-extractor",
    "mcp-tools", "workflow-registry", "vnstock_vendor",
  ]).describe("Which system is affected by this finding"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  subtype: z.string().optional()
    .describe("Subtype for loop-anti-pattern findings (e.g., escape-hatch-abuse, new-artifact-type, schema-bloat)"),
  evidence_journal: z.string().optional().describe("Path to related journal file"),
  evidence_code_ref: z.string().optional().describe("Code reference, e.g. path/to/file.js:line"),
  evidence_test: z.string().optional().describe("Test file reference"),
  status: z.enum(["reported"]).optional()
    .describe("Status — only 'reported' allowed via this tool. Use meta_state_ack or meta_state_promote_rule for other statuses."),
  // ... all existing fields preserved
});

// NEW
export const metaStateChangeEntrySchema = z.object({
  entry_kind: z.literal("change-log").describe("Discriminator — always 'change-log' for this schema"),
  change_dimension: z.enum(["semantic", "mechanical", "surface"])
    .describe("What kind of change"),
  change_target: z.string().min(1)
    .describe("Specific path or identifier being changed"),
  change_diff: z.object({
    added: z.array(z.string()).default([]).describe("Paths/fields added"),
    removed: z.array(z.string()).default([]).describe("Paths/fields removed"),
    changed: z.array(z.string()).default([]).describe("Paths/fields whose meaning changed (not value)"),
  }).describe("Structured diff"),
  reason: z.string().min(20)
    .describe("Why the change was made (min 20 chars)"),
  applies_to: z.object({
    tools: z.array(z.string()).optional().describe("Tool names affected"),
    surfaces: z.array(z.string()).optional().describe("Surface names affected"),
    rules: z.array(z.string()).optional().describe("Rule IDs affected"),
    statuses: z.array(z.string()).optional().describe("Status values affected"),
    schemas: z.array(z.string()).optional().describe("Schema files affected"),
  }).optional().describe("Wider impact scope"),
  supersedes: z.string().optional()
    .describe("ID of a previous change-log entry this one replaces"),
  evidence: z.object({
    code_ref: z.string().optional(),
    journal: z.string().optional(),
  }).optional().describe("Path to related journal/plans/reports file"),
  status: z.literal("active").default("active").describe("Status — change-log entries are always 'active' (immutable audit log)"),
  created_at: z.string().describe("ISO timestamp"),
  version: z.number().default(0).describe("CAS version (not used by change-log entries but consistent shape)"),
});

// NEW: cross-cutting validator (for readRegistry validation, loop_describe, etc.)
// Does NOT have .shape (by zod design); use the branch schemas for .shape.
export const metaStateEntrySchema = z.union([
  metaStateFindingEntrySchema,
  metaStateChangeEntrySchema,
]);
```

### Tool file updates (5 files)

Each of the 5 existing finding tools updates:

**`meta-state-report-tool.js`:**
- Import: `metaStateFindingEntrySchema` (rename from `metaStateEntrySchema`)
- `schema: metaStateFindingEntrySchema.shape` (was `metaStateEntrySchema.shape`)
- In handler, add `entry_kind: "finding"` to the entry object built

**`meta-state-list-tool.js`:**
- (Phase 3 adds the `entry_kind` filter; the schema import change is part of Phase 1.)
- Import: `metaStateFindingEntrySchema` (rename from `metaStateEntrySchema`) — only if the tool uses the schema for its own input validation. Looking at the current code, the list tool's schema is its own zod object (not `metaStateEntrySchema`), so the rename may not affect it. Verify during implementation.
- (Phase 3 adds the `entry_kind` field separately.)

**`meta-state-ack-tool.js`, `meta-state-resolve-tool.js`, `meta-state-promote-rule-tool.js`, `meta-state-sweep-tool.js`:**
- Verify whether each imports `metaStateEntrySchema`. If yes, rename to `metaStateFindingEntrySchema`. Looking at the existing code: `meta-state-ack-tool.js` and `meta-state-resolve-tool.js` import `updateEntry` (not the schema); `meta-state-promote-rule-tool.js` defines its own schema; `meta-state-sweep-tool.js` is similar. Only `meta-state-report-tool.js` and possibly `meta-state-list-tool.js` import the shared schema. **Verify during implementation; update only files that import the shared schema.**

### Test file updates (`__tests__/meta-state-schema.test.js`)

10 existing test cases need updates:

**9 `safeParse` cases** (lines 11, 21, 31, 41, 56, 66, 77, 88, 99 in the current file): each call `metaStateEntrySchema.safeParse({...})` with input that has no `entry_kind`. Two fix paths:
- **Path A (preferred):** change `metaStateEntrySchema.safeParse(...)` → `metaStateFindingEntrySchema.safeParse(...)`. More specific; matches the branch's intent.
- **Path B:** add `entry_kind: "finding"` to the input object. Works with the union (the discriminator matches the first branch).

Path A is preferred because it makes the test's intent explicit (it's testing the finding branch). Path B is faster (single-line edit per case). Use Path A.

**1 `.shape` comparison test** (line 122): `Object.keys(metaStateEntrySchema.shape).sort()` — change to `Object.keys(metaStateFindingEntrySchema.shape).sort()`.

### Modified `readRegistry()` — backward compat coercion

```js
export function readRegistry(root) {
  const path = getRegistryPath(root);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  return lines.map((line) => {
    const entry = JSON.parse(line);
    if (!entry.entry_kind) {
      entry.entry_kind = "finding"; // Backward-compat coerce
    }
    return entry;
  });
}
```

### Modified `filterEntries()` — `entry_kind` filter

```js
export function filterEntries(entries, filters) {
  return entries.filter((entry) => {
    if (filters.entry_kind && entry.entry_kind !== filters.entry_kind) return false;
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.status && entry.status !== filters.status) return false;
    if (filters.affected_system && entry.affected_system !== filters.affected_system) return false;
    return true;
  });
}
```

### Modified `updateEntry()` — compaction invariant comment

Add a comment in the compaction block (around line 96-102 of `core/meta-state.js`):

```js
// Compaction invariant: change-log entries are never compacted.
// They are immutable audit log with status="active" (terminal statuses
// like "auto-resolved" or "expired" don't apply). The TERMINAL_STATUSES
// filter below naturally skips them. If a future change-log subtype
// evolves to have a terminal status, this invariant must be re-verified.
```

## Tests (write FIRST, then implement)

Add 12 new tests to `__tests__/meta-state-schema.test.js` (existing 12 are updated separately):

1. `metaStateChangeEntrySchema accepts valid change-log input` — minimal valid input with all required fields → success
2. `metaStateChangeEntrySchema rejects change_dimension outside the 3-bucket enum` — `"unknown"` → failure
3. `metaStateChangeEntrySchema rejects change_target empty string` — `""` → failure
4. `metaStateChangeEntrySchema rejects reason shorter than 20 chars` — `"too short"` → failure
5. `metaStateChangeEntrySchema accepts any change_target string (open)` — paths, ids, URIs all valid
6. `metaStateChangeEntrySchema accepts applies_to with all optional sub-fields` — full scope set
7. `metaStateEntrySchema (union) rejects mixed fields` — input with both `category` and `change_dimension` → failure
8. `metaStateEntrySchema (union) rejects change-log with severity or affected_system` — wrong branch fields → failure
9. `readRegistry coerces legacy entries to entry_kind: "finding"` — write a finding without `entry_kind`, read back, assert `entry_kind === "finding"`
10. `readRegistry preserves entries with entry_kind: "change-log"` — round-trip
11. `filterEntries({ entry_kind: "change-log" }) returns only change-log entries` — mixed registry, filter, assert count
12. `filterEntries({ entry_kind: "finding" }) returns only finding entries` — mixed registry, filter, assert count

## TDD Workflow

1. **Update 10 existing test cases first** (9 `safeParse` → use `metaStateFindingEntrySchema`; 1 `.shape` comparison → use `metaStateFindingEntrySchema.shape`). Run `pnpm test -- __tests__/meta-state-schema.test.js`. The updated tests should still pass (the renamed schema is identical to the old `metaStateEntrySchema` except for the `entry_kind` default). Observe GREEN.
2. **Write 12 new tests.** Run `pnpm test -- __tests__/meta-state-schema.test.js`. Observe RED (12 failing tests).
3. **Implement the schema changes** in `core/meta-state.js`:
   - Rename `metaStateEntrySchema` → `metaStateFindingEntrySchema` (keep the body, add `entry_kind` default)
   - Add `metaStateChangeEntrySchema` export
   - Add new `metaStateEntrySchema` as `z.union(...)`
   - Modify `readRegistry()` for legacy coercion
   - Modify `filterEntries()` for `entry_kind` filter
   - Add compaction invariant comment
4. **Update the 5 tool files** (only the ones that import `metaStateEntrySchema`):
   - Rename the import
   - Update `schema: metaStateEntrySchema.shape` → `schema: metaStateFindingEntrySchema.shape`
   - In `meta-state-report-tool.js` handler, add `entry_kind: "finding"` to the entry object built
5. **Run tests.** Observe GREEN (24 tests in `__tests__/meta-state-schema.test.js` + 16 in `core/meta-state.test.js` = 40 in the relevant surface, all passing).
6. **Verify regression-safety floor:** run `pnpm test` (full suite). All existing tests still pass.

## Related Code Files

- Create: none (just tests added to an existing file)
- Modify:
  - `tools/learning-loop-mcp/core/meta-state.js` (rename + 2 new exports + readRegistry + filterEntries + comment)
  - `tools/learning-loop-mcp/tools/meta-state-report-tool.js` (import rename + schema + entry_kind)
  - `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (Phase 3 adds entry_kind; Phase 1 may rename import if applicable)
  - `tools/learning-loop-mcp/tools/meta-state-ack-tool.js` (rename import if applicable)
  - `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` (rename import if applicable)
  - `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` (rename import if applicable)
  - `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js` (rename import if applicable)
  - `tools/learning-loop-mcp/__tests__/meta-state-schema.test.js` (9 safeParse updates + 1 .shape update + 12 new tests)
- Delete: none

## Implementation Steps

1. **Update 10 existing test cases in `__tests__/meta-state-schema.test.js`** (9 `safeParse` + 1 `.shape`).
2. Run `pnpm test -- __tests__/meta-state-schema.test.js` — confirm the 12 updated tests still pass (no regression in test names/structure).
3. **Write 12 new tests** in `__tests__/meta-state-schema.test.js`.
4. Run `pnpm test -- __tests__/meta-state-schema.test.js` — confirm 12 new tests fail (RED).
5. Edit `core/meta-state.js`:
   - Rename `metaStateEntrySchema` → `metaStateFindingEntrySchema`; add `entry_kind: z.literal("finding").default("finding")` at the top
   - Add `metaStateChangeEntrySchema` export
   - Add new `metaStateEntrySchema` as `z.union([metaStateFindingEntrySchema, metaStateChangeEntrySchema])`
   - Modify `readRegistry()` for legacy coercion
   - Modify `filterEntries()` for `entry_kind` filter
   - Add compaction invariant comment
6. Update the 5 tool files (verify import + schema + entry_kind):
   - `meta-state-report-tool.js`: rename import, update `schema:`, add `entry_kind: "finding"` to entry built
   - Other 4 tools: rename import if applicable; the rest is unchanged
7. Run `pnpm test -- __tests__/meta-state-schema.test.js` — confirm 24 tests pass (GREEN).
8. Run `pnpm test` (full suite) — confirm no regression.

## Success Criteria

- [x] 10 existing test cases updated (9 safeParse + 1 .shape) and still pass after the schema rename
- [x] 12 new tests written and failing (RED)
- [x] 12 new tests pass after implementation (GREEN)
- [x] 16 existing `core/meta-state.test.js` tests still pass (regression-safety floor)
- [x] 12 existing `__tests__/meta-state-schema.test.js` tests still pass (now using the new schema names)
- [x] The 5 existing meta-state tools (`meta_state_report`, `meta_state_list`, etc.) work after their file updates
- [x] The legacy entries in `meta-state.jsonl` load correctly via `readRegistry()` (coercion works)
- [x] Compaction invariant is documented in `updateEntry`
- [x] `pnpm test` passes (full suite)

## Risk Assessment

- **Risk: the rename breaks a tool file that imports `metaStateEntrySchema` but the cook doesn't update it.** Mitigation: the 5 tool files are listed in "Related Code Files" with explicit verification steps; the cook must grep for `metaStateEntrySchema` and update each occurrence. The `pnpm test` regression-safety floor catches missed updates at runtime.
- **Risk: the 9 existing `safeParse` test updates accidentally change the test intent.** Mitigation: Path A (rename to `metaStateFindingEntrySchema.safeParse`) is a single-line, no-intent-change edit. Tests assert the same behavior (input validates, returns success/failure); only the schema object name changes.
- **Risk: `applyPromotedRules` filter (`category === "loop-anti-pattern"`) doesn't match change-log entries.** Cross-referenced from the lock report: change-log entries are NOT findings and cannot be promoted to rules. The `meta_state_promote_rule` category guard stays as `loop-anti-pattern` only. This is a known limitation, not a blocker. Future SP may extend.
- **Risk: legacy coercion fails for malformed entries.** Mitigation: round-trip tests + the `g8-subcommand-class-entry.test.js` smoke test (which reads the registry and depends on coercion working).
- **Risk: `filterEntries` becomes ambiguous when multiple filters are provided.** Mitigation: explicit AND-logic tests; the existing tests already cover the AND case for `category + status`.
