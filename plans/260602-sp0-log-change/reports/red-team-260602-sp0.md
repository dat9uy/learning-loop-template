---
date: "2026-06-02T13:30:00Z"
status: proposed
tags: [red-team, meta-state, sp0, discriminator, schema, backward-compat, plan-review]
related:
  - plans/260602-sp0-log-change/plan.md
  - plans/260602-sp0-log-change/phase-01-core-schema-change.md
  - plans/260602-sp0-log-change/phase-04-manifest-and-slugify-refactor.md
  - plans/260602-sp0-log-change/phase-05-first-real-change-log-entry.md
  - plans/reports/brainstorm-260602-sp0-log-change.md
  - tools/learning-loop-mcp/core/meta-state.js
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js
  - tools/learning-loop-mcp/__tests__/meta-state-schema.test.js
---

# Red-Team Review: SP0 Plan (`plans/260602-sp0-log-change/plan.md`)

> **Verdict: Plan has 2 CRITICAL silent-breakage paths.** Phase 1's discriminated-union refactor breaks the 5 existing meta-state tools and 1 existing test. The plan is salvageable with a cleaner export structure (rename `metaStateEntrySchema` to `metaStateFindingEntrySchema`, add a sibling change-log schema, add a thin `z.union` helper for cross-cutting validation). Plus 4 lower-severity items that need plan updates.
>
> **Reviewer stance: hostile.** I am looking for ways the plan silently breaks things, misses edge cases, or underestimates effort.

## CRITICAL-1: `.shape` access on `metaStateEntrySchema` is used in 3 places

**Evidence:**
- `tools/learning-loop-mcp/tools/meta-state-report-tool.js:12` — `schema: metaStateEntrySchema.shape,`
- `tools/learning-loop-mcp/__tests__/meta-state-schema.test.js:122` — `const sharedKeys = Object.keys(metaStateEntrySchema.shape).sort();`
- `tools/learning-loop-mcp/__tests__/meta-state-schema.test.js:126` — `metaStateEntrySchema.shape[key]`

**Problem:** `z.discriminatedUnion(...)` produces a `ZodDiscriminatedUnion` instance, which has no `.shape` property. `.shape` is only on `ZodObject`. The plan's Phase 1 change to "flat zod → discriminated union" would break all 3 usages at runtime (undefined access → TypeError when the MCP server tries to load the tool's schema, or test failures).

**Plan impact:** The Phase 1 plan is missing the cost of updating these 3 call sites. The lock report is silent on this. **This is a silent regression path.**

**Fix:** Rename the existing `metaStateEntrySchema` to `metaStateFindingEntrySchema` (a `z.object(...)` with `.shape`). Add a new `metaStateChangeEntrySchema` (also a `z.object(...)`). Add a new `metaStateEntrySchema` as a thin `z.union([metaStateFindingEntrySchema, metaStateChangeEntrySchema])` for cross-cutting use cases. The 5 finding tools update to use `metaStateFindingEntrySchema.shape`; the new tool uses `metaStateChangeEntrySchema.shape`; cross-cutting validation uses `metaStateEntrySchema.safeParse(...)`.

## CRITICAL-2: Existing tools build entries without `entry_kind` field

**Evidence:** `tools/learning-loop-mcp/tools/meta-state-report-tool.js:30-46` — the handler constructs the entry object with `{id, category, subtype, severity, affected_system, description, evidence, status, ...}` but **no `entry_kind` field**. Same pattern in the 4 other finding tools (`meta_state_ack`, `meta_state_list`, `meta_state_resolve`, `meta_state_promote_rule`, `meta_state_sweep` — the latter 4 are confirmed by grep; ack/resolve/promote don't construct full entries, they patch via `updateEntry`).

Also: 9 existing test cases in `__tests__/meta-state-schema.test.js` (lines 11, 21, 31, 41, 56, 66, 77, 88, 99) call `metaStateEntrySchema.safeParse({...})` with input that has no `entry_kind` field. These are the regression-safety floor for the existing schema.

**Problem:** A `z.discriminatedUnion("entry_kind", [...])` rejects input without `entry_kind`. The default `.default("finding")` on the finding branch's `entry_kind` is NOT applied by the union's dispatch logic (defaults are applied at parse time, not dispatch time). The 9 existing tests would all fail after Phase 1.

**Plan impact:** The Phase 1 plan claims "16 existing tests in `core/meta-state.test.js` pass without modification" — but doesn't mention the 9 tests in `__tests__/meta-state-schema.test.js` that would also fail. The lock report says "all 5 existing meta-state tools continue to work without changes" — false, they all need `entry_kind: "finding"` set explicitly.

**Fix:**
- Update the 9 existing test cases to use `metaStateFindingEntrySchema.safeParse(...)` (more specific) or add `entry_kind: "finding"` to their input.
- Update `metaStateReportTool.handler` to set `entry_kind: "finding"` on the entry it builds.
- Update `metaStateListTool`, `metaStateResolveTool`, `metaStatePromoteRuleTool`, `metaStateSweepTool` similarly (where applicable).
- Update the 1 test that compares `.shape` keys to use `metaStateFindingEntrySchema.shape`.

## MEDIUM-1: Manifest placement is wrong

**Problem:** Phase 4 says "add a new line in alphabetical order (between `loop-describe-tool` and `meta-state-ack-tool`)". But the manifest groups `meta-state-*` tools together (lines 38-43 of `tools/learning-loop-mcp/tools/manifest.json`). Adding `meta-state-log-change-tool` between `loop-describe-tool` and `meta-state-ack-tool` breaks the group convention.

**Plan impact:** A small consistency issue. The manifest is JSON; future maintainers reading the manifest see the new tool out of place.

**Fix:** Place the new line in the `meta-state-*` group, between `meta-state-list-tool` and `meta-state-ack-tool` (or at the end of the group). The exact position within the group is a judgment call; "end of group" is the safest.

## MEDIUM-2: Compaction logic should defensively skip change-log entries

**Evidence:** `tools/learning-loop-mcp/core/meta-state.js:96-102` — `updateEntry` compacts terminal entries >7 days old. The filter is `TERMINAL_STATUSES.has(entry.status)`. Change-log entries have `status: "active"` (not in TERMINAL_STATUSES), so they are NOT compacted. **No current bug.**

**Problem:** This is a future-hardening concern. If a future change-log subtype evolves to have a terminal status (e.g., "superseded"), the compaction logic would compact it, which is wrong. A defensive check `if (entry.entry_kind === "change-log") return true;` would protect against this.

**Plan impact:** Low — change-log entries are guaranteed `status: "active"` in Phase 1's design. But the plan doesn't document the invariant. Future maintainers may not know.

**Fix:** Add a comment in `updateEntry`'s compaction block documenting the invariant: "change-log entries are never compacted (they are immutable audit log with status=active)." Optionally, add the defensive check.

## LOW-1: Phase 5 "first change-log entry" assertion is brittle

**Evidence:** Phase 5 test asserts the entry is the first `entry_kind: "change-log"` entry in the registry.

**Problem:** If a future plan runs Phase 5 of SP0 partially (e.g., writes the entry, then fails to update the test), or if multiple sessions run the plan, the "first" assertion becomes fragile.

**Fix:** Change the test to match by shape (find entry with `change_target` matching the tool path AND `change_dimension: "surface"` AND `change_diff.added` containing `"meta_state_log_change"`). Don't assert "first." The "first" property is a side effect of running Phase 5 once, not a test invariant.

## LOW-2: Test coverage gaps in Phase 2 (tool contract)

**Evidence:** Phase 2's 8 tests cover the happy path and basic rejections. Missing:
- Very long `change_target` strings (>60 chars triggers slugify truncation)
- Unicode in `change_target` (slugify strips non-alphanumeric; unicode becomes hyphens)
- Very long `reason` strings (>20 chars — fine, but not tested at the boundary)
- Error propagation from zod (`safeParse` failure → handler throws vs. returns error response)
- Empty `change_diff` arrays (default values)
- Missing `applies_to` (optional field)
- `supersedes` pointing to a non-existent entry (no validation in this design — but should test that the field is stored as-is)

**Plan impact:** Acceptable for SP0 (the design is well-bounded, the existing 16 core tests cover concurrency, the 12 schema tests cover validation). The 8 tool tests cover the contract. Edge cases can be added in a follow-up.

**Fix:** Optional. Add 2-3 edge-case tests if the cook has time. Not a blocker.

## LOW-3: `applyPromotedRules` interaction with `entry_kind`

**Evidence:** `tools/learning-loop-mcp/core/gate-logic.js#loadPromotedRules` filters rules by `status === "active"` and `category === "loop-anti-pattern"`. Change-log entries are NOT findings, so they don't enter the rules list. **No current bug.**

**Problem:** The plan doesn't document that change-log entries cannot be promoted to rules (because the `meta_state_promote_rule` category guard is `loop-anti-pattern`, which is a finding-only category). This is already noted in the lock report as a "known limitation," but the plan's risk table is silent.

**Fix:** Add a row to Phase 1's risk assessment documenting this. The lock report covers it; the plan should cross-reference.

## Plan Updates Required (CRITICAL path)

The 2 CRITICAL findings are not optional — they block cook. The fix is a structural change to Phase 1:

### Updated Phase 1 architecture (proposed)

```js
// core/meta-state.js

// RENAMED from the existing metaStateEntrySchema
export const metaStateFindingEntrySchema = z.object({
  entry_kind: z.literal("finding").default("finding"),
  category: z.enum([...]),  // existing 7 values
  severity: z.enum([...]),
  affected_system: z.enum([...]),
  description: z.string().min(20),
  subtype: z.string().optional(),
  evidence: z.object({...}).optional(),
  status: z.enum(["reported"]).optional(),
  // ... existing fields preserved
});

// NEW
export const metaStateChangeEntrySchema = z.object({
  entry_kind: z.literal("change-log"),
  change_dimension: z.enum(["semantic", "mechanical", "surface"]),
  change_target: z.string().min(1),
  change_diff: z.object({
    added: z.array(z.string()).default([]),
    removed: z.array(z.string()).default([]),
    changed: z.array(z.string()).default([]),
  }),
  reason: z.string().min(20),
  applies_to: z.object({...}).optional(),
  supersedes: z.string().optional(),
  evidence: z.object({...}).optional(),
  status: z.literal("active").default("active"),
  created_at: z.string(),
  version: z.number().default(0),
});

// NEW: cross-cutting validator (for readRegistry validation, loop_describe, etc.)
export const metaStateEntrySchema = z.union([
  metaStateFindingEntrySchema,
  metaStateChangeEntrySchema,
]);
```

### Tool file updates (Phase 1 expanded scope)

- `meta-state-report-tool.js`: import `metaStateFindingEntrySchema` (rename from `metaStateEntrySchema`); `schema: metaStateFindingEntrySchema.shape`; build entry with `entry_kind: "finding"` set explicitly
- `meta-state-list-tool.js`: same pattern (if it uses the schema)
- `meta-state-resolve-tool.js`, `meta-state-ack-tool.js`, `meta-state-promote-rule-tool.js`, `meta-state-sweep-tool.js`: same pattern (these patch via `updateEntry`, may or may not need updates)
- `__tests__/meta-state-schema.test.js`: update the 9 `safeParse` cases + the 1 `.shape` comparison test

### Effort re-estimate

Phase 1's "3h" estimate is now too low. The actual scope is:
- 12 new tests (as planned) + 9 existing test updates = 21 test changes
- 1 schema rename + 2 new exports + 1 union helper = 4 core schema changes
- 5 tool file updates = 5 tool changes
- Total: roughly 6-8h, not 3h

The plan should re-estimate Phase 1 to 6-8h (or split into 1a: core schema, 1b: tool/test updates).

## Risk Re-rating

| Original risk | Original mitigation | New risk after review |
|---|---|---|
| Discriminated union breaks the 5 existing meta-state tools | "Backward-compat coercion in readRegistry" | **Confirmed real** — but the fix is broader than coercion. Tool files need updates. |
| Legacy entry coercion fails for malformed entries | "Round-trip tests" | **Confirmed** — and the round-trip tests need the schema change to be in place first. |
| `entry_kind` discrimination fails in mixed registry | "Tests for both branches" | **Confirmed** — and the mixed-registry tests need the renamed exports. |
| Schema evolution path unclear | "Recursive but principled" | **Confirmed** — and Phase 5's self-log makes the recursion explicit. |
| G8 subcommand-class false positive recurs | "Phase 0 records a fresh entry" | **Confirmed real** — Phase 0's plan is correct. |
| (NEW) Manifest placement out of group | (not in plan) | Low — easy fix in Phase 4 |
| (NEW) Compaction invariant undocumented | (not in plan) | Low — comment in core |
| (NEW) Phase 5 "first" assertion brittle | (not in plan) | Low — match by shape |

## Recommendation

**Do not cook the plan as-is.** The 2 CRITICAL findings are silent breakage paths that the TDD structure would catch only when the cook runs Phase 1's tests and sees them fail — at which point the cook has to debug the discriminator vs. shape issue. Better to fix the plan first.

**Update the plan with the following changes:**
1. Phase 1: rename `metaStateEntrySchema` → `metaStateFindingEntrySchema`; add new `metaStateChangeEntrySchema`; add a thin `z.union` as `metaStateEntrySchema`.
2. Phase 1: update the 5 existing finding tools to use `metaStateFindingEntrySchema.shape` and set `entry_kind: "finding"` explicitly on the entries they build.
3. Phase 1: update the 9 existing test cases in `__tests__/meta-state-schema.test.js` to use `metaStateFindingEntrySchema.safeParse` (or add `entry_kind: "finding"` to input).
4. Phase 1: re-estimate effort from 3h to 6-8h.
5. Phase 4: fix manifest placement (end of `meta-state-*` group).
6. Phase 1: add a comment in `updateEntry` documenting the change-log compaction invariant.
7. Phase 5: change "first change-log entry" assertion to "match by shape."
8. Phase 1: add risk row for `applyPromotedRules` interaction with `entry_kind` (already in lock report, cross-reference in plan).

After the plan is updated, the post-plan handoff can proceed to /ck:cook.
