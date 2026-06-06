---
phase: 4
title: "loop_describe warm/cold tier surfaces active rule + loop-design lists (TDD)"
status: pending
priority: P2
effort: "1.5h"
dependencies: [3]
---

# Phase 4: loop_describe surfaces (TDD)

## Overview

Wire the new `entry_kind: "rule"` and `entry_kind: "loop-design"` entries into `loop_describe`'s warm and cold tiers so operators and agents can discover them in one query (instead of scanning the registry for nested payloads). The warm tier gains `rule_count`, `loop_design_count`, and renames `promoted_rules` to `rules` (reading from the new entry kind). The cold tier gains a new `loop_designs` list with `id`, `title`, `proposed_design_for`, `addresses`, `shipped_in_plan` for each active design. The existing `superseded_lineage` surface (sibling plan 260605) is preserved. 3-4 new tests cover the new surfaces.

## Requirements

### Functional

**`core/loop-introspect.js#listPromotedRules` rewrite (currently lines ~190-200):**

1. **Before** (current behavior):
   - Calls `loadPromotedRules(root)` (returns the legacy shape: findings with `promoted_to_rule` payloads, plus the new rule entries after Phase 2)
   - Filters out `pattern_type === "resolution-evidence-required"` rules (they are not command-path matches; not discoverable)
   - Returns the filtered list

2. **After** (Phase 4):
   - Calls `loadPromotedRules(root)` (Phase 1's transitional filter: returns both rule entries AND legacy findings with `promoted_to_rule`)
   - For rule entries (`e.entry_kind === "rule"`): include in the result. The shape returned is the rule entry directly (with `rule_id` synthesized from `id` for backward compat with the existing `promoted_rules` field shape)
   - For legacy findings (`e.entry_kind === "finding" && e.promoted_to_rule`): include in the result (same as before; transitional; Phase 1's filter still loads them)
   - Filters out `pattern_type === "resolution-evidence-required"` (preserved behavior; these rules are not command-path matches)
   - Returns the filtered list

3. **Shape returned** (per entry):
   - For rule entries: `{ id, rule_id, pattern_type, pattern, enforcement, status, origin, scope_predicate, applies_to_resolution, description }` (the rule entry's fields, with `rule_id` synthesized from `id` for backward compat)
   - For legacy findings: `{ id, rule_id: e.promoted_to_rule.rule_id, pattern_type: e.promoted_to_rule.pattern_type, pattern: e.promoted_to_rule.pattern, ... }` (the existing shape; preserved)
   - The synthesized shape is consistent across both: the `id` field is the rule's canonical id (e.g., `rule-no-new-artifact-types`); the `rule_id` field is also the same value. This is a minor duplication; the 2nd field is preserved for backward compat with downstream callers that read `r.rule_id`.

**New `core/loop-introspect.js#listLoopDesigns`:**

4. **Function** (mirrors `listPromotedRules`):
   ```js
   export function listLoopDesigns(root, { statuses = ["active"] } = {}) {
     const entries = readRegistry(root);
     return entries.filter(
       (e) => e.entry_kind === "loop-design" && statuses.includes(e.status)
     );
   }
   ```

5. **Shape returned** (per entry): the loop-design entry's fields (id, title, status, proposed_design_for, addresses, description, affected_system, severity_hint, created_at, created_by, shipped_in_plan, shipped_at).

**`tools/loop-describe-tool.js` warm tier updates (lines 60-72):**

6. **Rename `promoted_rules` to `rules`** in the warm tier output (per Locked #8 in plan.md):
   - Before: `result.promoted_rules = promotedRules.map(...)`
   - After: `result.rules = promotedRules.map(...)` (the synthesized shape from Step 3)
   - The `rule_count` field stays (it's already a count)

7. **Add `loop_design_count`** to the warm tier:
   ```js
   const loopDesigns = introspect.listLoopDesigns(root);
   result.loop_design_count = loopDesigns.length;
   ```
   (Note: this is a top-level count, not the full list. The full list is in cold tier only.)

8. **The `discoverability_hints` array** (warm tier) gets 1 new hint:
   ```js
   "For rule and loop-design lifecycle, use `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` (Phase 3) or `loop_describe({ tier: 'cold' })` (Phase 4).",
   ```

**`tools/loop-describe-tool.js` cold tier updates (lines 75-130):**

9. **Rename `promoted_rules` to `rules`** in the cold tier output (consistent with warm tier):
   - Before: `result.promoted_rules = promotedRules;` (returns the full shape from `listPromotedRules`)
   - After: `result.rules = promotedRules;`

10. **Add `loop_designs` list** in the cold tier output:
    ```js
    result.loop_designs = introspect.listLoopDesigns(root).map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      proposed_design_for: d.proposed_design_for,
      addresses: d.addresses,
      shipped_in_plan: d.shipped_in_plan,
      shipped_at: d.shipped_at,
      severity_hint: d.severity_hint,
      affected_system: d.affected_system,
    }));
    ```

11. **The `superseded_lineage` surface** (lines 100-125) is unchanged. The new loop-designs list is a separate, additive field.

**`summary` and `hot` tier updates (lines 50-58):**

12. **`summary` tier** (lines 50-58):
    - Before: `result.rule_count = promotedRules.length;`
    - After: `result.rule_count = promotedRules.length;` (unchanged; the rule count is the same) + `result.loop_design_count = listLoopDesigns(root).length;` (new)

13. **`hot` tier** (lines 60-72):
    - Before: `result.promoted_rules = promotedRules.map(...)`
    - After: `result.rules = promotedRules.map(...)` (renamed; same shape)

### Non-functional

- The new `listLoopDesigns` function is exported from `core/loop-introspect.js` so future plans (e.g., a plan that surfaces loop-designs in a UI) can use it directly without going through `loop_describe`.
- The cold tier's `loop_designs` list is the canonical surface for designs; the warm tier's `loop_design_count` is a quick count for context-budgeted sessions.
- The `discoverability_hints` array in `core/loop-introspect.js` (currently `DISCOVERABILITY_HINTS` constant) is the single source of truth for hint text; the new hint is added there, not in `loop-describe-tool.js`.

## Architecture

```
            ┌─────────────────────────────────────────────────────────┐
            │ Phase 4 deliverable                                     │
            └─────────────────────────┬───────────────────────────────┘
                                      │
        ┌─────────────────────────────┼──────────────────────────────┐
        ▼                             ▼                              ▼
  ┌────────────────────┐    ┌────────────────────┐    ┌────────────────────────┐
  │ listPromotedRules  │    │ listLoopDesigns    │    │ loop_describe tiers    │
  │ (rewrite)          │    │ (new function)     │    │ (warm/hot/cold/        │
  │                    │    │                    │    │  summary updates)      │
  │ + synthesize shape │    │ mirrors            │    │                        │
  │   for rule entries │    │ listPromotedRules  │    │ + rules (renamed)      │
  │ + preserve legacy  │    │                    │    │ + rule_count           │
  │   finding shape    │    │                    │    │ + loop_design_count    │
  └────────────────────┘    └────────────────────┘    │ + loop_designs         │
                                                       │ + discoverability_hints│
                                                       └────────────────────────┘
```

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/loop-introspect.js` — rewrite `listPromotedRules`, add `listLoopDesigns`, extend `DISCOVERABILITY_HINTS`
- **Modify:** `tools/learning-loop-mcp/tools/loop-describe-tool.js` — rename `promoted_rules` to `rules` in warm/hot/cold tiers, add `loop_design_count` (warm/summary), add `loop_designs` (cold)
- **Create:** `tools/learning-loop-mcp/__tests__/loop-describe-rule-and-loop-design.test.js` — 3-4 new tests
- **Read-only:** `tools/learning-loop-mcp/core/meta-state.js#readRegistry`, `#metaStateRuleEntrySchema`, `#metaStateLoopDesignSchema` (Phase 1)
- **Read-only:** `tools/learning-loop-mcp/core/gate-logic.js#loadPromotedRules` (Phase 1's transitional filter)

## Implementation Steps

### Step 1: Write the 3-4 new tests (TDD red)

Create `tools/learning-loop-mcp/__tests__/loop-describe-rule-and-loop-design.test.js`:

```js
// loop-describe-rule-and-loop-design.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loopDescribeTool } from "#mcp/tools/loop-describe-tool.js";
import { writeEntry } from "#mcp/core/meta-state.js";

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "loop-describe-"));
  writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");
  return root;
}

async function call(args) {
  return JSON.parse((await loopDescribeTool.handler(args)).content[0].text);
}

test("loop_describe warm tier returns rules (renamed from promoted_rules) and loop_design_count", async () => {
  const root = setupFixture();
  process.chdir(root);
  await writeEntry(root, {
    id: "rule-test-1",
    entry_kind: "rule",
    origin: "meta-test-origin",
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "test-pattern-1",
    description: "Test rule description that is at least 20 characters long.",
    status: "active",
    promoted_at: "2026-06-06T20:00:00.000Z",
    promoted_by: "operator",
  });
  await writeEntry(root, {
    id: "loop-design-test-1",
    entry_kind: "loop-design",
    title: "Test design that is at least 10 chars",
    status: "active",
    proposed_design_for: ["rule-test-1"],
    addresses: [],
    description: "Test design description that is at least 20 characters long.",
    affected_system: "mcp-tools",
    created_at: "2026-06-06T20:00:00.000Z",
    created_by: "operator",
  });

  const result = await call({ tier: "warm" });
  assert.equal(result.tier, "warm");
  assert(result.rules, "rules field missing in warm tier (should replace promoted_rules)");
  assert.equal(result.rules.length, 1);
  assert.equal(result.rules[0].id, "rule-test-1");
  assert.equal(result.rule_count, 1);
  assert.equal(result.loop_design_count, 1);
  // promoted_rules should be GONE (replaced by rules)
  assert.equal(result.promoted_rules, undefined, "promoted_rules still present (should be renamed to rules)");
});

test("loop_describe cold tier returns loop_designs list with id, title, proposed_design_for, addresses, shipped_in_plan", async () => {
  const root = setupFixture();
  process.chdir(root);
  await writeEntry(root, {
    id: "loop-design-test-2",
    entry_kind: "loop-design",
    title: "Test design 2 with shipped_in_plan",
    status: "inactive",
    proposed_design_for: ["rule-test-2"],
    addresses: ["meta-test-finding"],
    description: "Test design 2 description that is at least 20 characters long.",
    affected_system: "gate-logic",
    created_at: "2026-06-06T20:00:00.000Z",
    created_by: "operator",
    shipped_in_plan: "plans/260606-test/",
    shipped_at: "2026-06-06T21:00:00.000Z",
  });

  const result = await call({ tier: "cold" });
  assert(result.loop_designs, "loop_designs field missing in cold tier");
  assert.equal(result.loop_designs.length, 1);
  const design = result.loop_designs[0];
  assert.equal(design.id, "loop-design-test-2");
  assert.equal(design.title, "Test design 2 with shipped_in_plan");
  assert.deepEqual(design.proposed_design_for, ["rule-test-2"]);
  assert.deepEqual(design.addresses, ["meta-test-finding"]);
  assert.equal(design.shipped_in_plan, "plans/260606-test/");
});

test("loop_describe summary tier includes rule_count and loop_design_count", async () => {
  const root = setupFixture();
  process.chdir(root);
  // Write 2 rules and 2 loop-designs
  for (let i = 0; i < 2; i++) {
    await writeEntry(root, {
      id: `rule-test-${i}`,
      entry_kind: "rule",
      origin: `meta-origin-${i}`,
      enforcement: "gate",
      pattern_type: "regex",
      pattern: `pattern-${i}`,
      description: `Rule ${i} description that is at least 20 characters long.`,
      status: "active",
      promoted_at: "2026-06-06T20:00:00.000Z",
      promoted_by: "operator",
    });
  }
  for (let i = 0; i < 2; i++) {
    await writeEntry(root, {
      id: `loop-design-test-${i}`,
      entry_kind: "loop-design",
      title: `Test design ${i} with at least 10 chars`,
      status: "active",
      proposed_design_for: [`rule-test-${i}`],
      addresses: [],
      description: `Design ${i} description that is at least 20 characters long.`,
      affected_system: "mcp-tools",
      created_at: "2026-06-06T20:00:00.000Z",
      created_by: "operator",
    });
  }

  const result = await call({ tier: "summary" });
  assert.equal(result.rule_count, 2);
  assert.equal(result.loop_design_count, 3);
});

test("loop_describe hot tier returns rules (renamed from promoted_rules)", async () => {
  const root = setupFixture();
  process.chdir(root);
  await writeEntry(root, {
    id: "rule-test-3",
    entry_kind: "rule",
    origin: "meta-test-origin-3",
    enforcement: "gate",
    pattern_type: "glob",
    pattern: "records/**/risks/*.yaml",
    description: "Rule 3 description that is at least 20 characters long.",
    status: "active",
    promoted_at: "2026-06-06T20:00:00.000Z",
    promoted_by: "operator",
  });

  const result = await call({ tier: "hot" });
  assert(result.rules, "rules field missing in hot tier (should replace promoted_rules)");
  assert.equal(result.rules[0].rule_id, "rule-test-3");
  assert.equal(result.promoted_rules, undefined, "promoted_rules still present in hot tier");
});
```

Run the tests to confirm RED.

### Step 2: Rewrite `listPromotedRules` in `core/loop-introspect.js`

```js
export function listPromotedRules(root) {
  const rules = loadPromotedRules(root);
  return rules
    .filter((r) => r.promoted_to_rule?.pattern_type !== "resolution-evidence-required")
    .map((r) => {
      if (r.entry_kind === "rule") {
        return {
          id: r.id,
          rule_id: r.id,  // synthesized for backward compat
          pattern_type: r.pattern_type,
          pattern: r.pattern,
          enforcement: r.enforcement,
          status: r.status,
          origin: r.origin,
          scope_predicate: r.scope_predicate,
          applies_to_resolution: r.applies_to_resolution,
          description: r.description,
        };
      }
      // Legacy finding shape (preserved)
      return {
        id: r.id,
        rule_id: r.promoted_to_rule.rule_id,
        pattern_type: r.promoted_to_rule.pattern_type,
        pattern: r.promoted_to_rule.pattern,
        enforcement: r.promoted_to_rule.enforcement,
        status: r.status,
        origin: r.promoted_to_rule.promoted_at,  // legacy: no separate origin field
      };
    });
}
```

### Step 3: Add `listLoopDesigns` in `core/loop-introspect.js`

```js
export function listLoopDesigns(root, { statuses = ["active"] } = {}) {
  const entries = readRegistry(root);
  return entries.filter(
    (e) => e.entry_kind === "loop-design" && statuses.includes(e.status)
  );
}
```

### Step 4: Extend `DISCOVERABILITY_HINTS` in `core/loop-introspect.js`

```js
const DISCOVERABILITY_HINTS = Object.freeze([
  // ... existing 5 hints
  "For rule and loop-design lifecycle, use `meta_state_list({ entry_kind: 'rule' | 'loop-design' })` (Phase 3) or `loop_describe({ tier: 'cold' })` (Phase 4). The cold tier surfaces a `loop_designs` list with `id`, `title`, `proposed_design_for`, `addresses`, and `shipped_in_plan`.",
]);
```

### Step 5: Update `loop-describe-tool.js` warm tier

Lines 60-72 (warm tier):

```js
} else if (tier === "warm") {
  result.tools = tools.map((t) => ({
    name: t.name,
    description: t.description,
  }));
  result.record_types = recordTypes;
  result.gate_patterns = Object.keys(gatePatterns);
  result.rules = promotedRules;  // RENAMED from promoted_rules
  result.active_findings = activeFindings.map((f) => ({
    id: f.id,
    category: f.category,
    status: f.status,
    description: f.description,
  }));
  result.anti_patterns = antiPatterns.map((f) => ({
    id: f.id,
    subtype: f.subtype,
    status: f.status,
    description: f.description,
  }));
  result.rule_count = promotedRules.length;
  result.loop_design_count = introspect.listLoopDesigns(root).length;  // NEW
  result.discoverability_hints = introspect.buildDiscoverabilityHints();
}
```

### Step 6: Update `loop-describe-tool.js` hot tier

Lines 60-72 (hot tier; the same block as warm, just without the `record_types` etc.):

```js
} else if (tier === "hot") {
  result.tools = tools.map((t) => ({ name: t.name }));
  result.rules = promotedRules;  // RENAMED from promoted_rules
  result.rule_count = promotedRules.length;
}
```

### Step 7: Update `loop-describe-tool.js` cold tier

Lines 75-130 (cold tier):

```js
} else if (tier === "cold") {
  // ... existing logic
  result.rules = promotedRules;  // RENAMED from promoted_rules
  result.active_findings = activeFindings;
  result.all_findings = introspect.listAllFindings(root, { categories });
  result.anti_patterns = antiPatterns;
  result.loop_designs = introspect.listLoopDesigns(root).map((d) => ({  // NEW
    id: d.id,
    title: d.title,
    status: d.status,
    proposed_design_for: d.proposed_design_for,
    addresses: d.addresses,
    shipped_in_plan: d.shipped_in_plan,
    shipped_at: d.shipped_at,
    severity_hint: d.severity_hint,
    affected_system: d.affected_system,
  }));

  // Superseded lineage surface (UNCHANGED)
  const allEntries = introspect.readAllEntriesForLineage(root);
  // ... existing superseded_lineage logic
}
```

### Step 8: Update `loop-describe-tool.js` summary tier

Lines 50-58 (summary tier):

```js
if (tier === "summary") {
  result.tool_count = tools.length;
  result.record_type_count = recordTypes.length;
  result.rule_count = promotedRules.length;
  result.active_finding_count = activeFindings.length;
  result.loop_design_count = introspect.listLoopDesigns(root).length;  // NEW
}
```

### Step 9: Run the full test suite

```bash
cd tools/learning-loop-mcp && node --test __tests__/loop-describe-rule-and-loop-design.test.js __tests__/loop-describe.test.js __tests__/loop-describe-warm-tier.test.js __tests__/loop-describe-cold-tier-superseded.test.js __tests__/meta-state-propose-design-tool.test.js __tests__/meta-state-list-entry-kind-extended.test.js __tests__/migrate-rule-entry-kind.test.js __tests__/meta-state-rule-schema.test.js __tests__/meta-state-loop-design-schema.test.js __tests__/meta-state-promote-rule-rule-entry.test.js __tests__/gate-promoted-rules.test.js __tests__/gate-scope-predicate.test.js __tests__/gate-resolution-evidence.test.js __tests__/integration-promoted-rule.test.js
```

All tests pass: 3-4 new + 4 existing loop-describe tests (regression) + 6-8 Phase 3 tests + 4 Phase 2 tests + 10-14 Phase 1 tests + 4 existing rule test files.

## Success Criteria

- [ ] `core/loop-introspect.js#listPromotedRules` returns a synthesized shape that includes both rule entries and legacy findings (Phase 1's transitional filter is in effect)
- [ ] `core/loop-introspect.js#listLoopDesigns` returns active (or all-status) loop-design entries from the registry
- [ ] `core/loop-introspect.js#DISCOVERABILITY_HINTS` has 6 hints (5 existing + 1 new)
- [ ] `tools/loop-describe-tool.js` warm/hot/cold tiers use `rules` (renamed from `promoted_rules`)
- [ ] `loop_describe({ tier: "warm" })` returns `rules`, `rule_count`, and `loop_design_count`
- [ ] `loop_describe({ tier: "cold" })` returns `rules` and `loop_designs` (with id, title, proposed_design_for, addresses, shipped_in_plan, shipped_at, severity_hint, affected_system)
- [ ] `loop_describe({ tier: "summary" })` returns `rule_count` and `loop_design_count`
- [ ] `loop_describe({ tier: "hot" })` returns `rules` (renamed)
- [ ] `__tests__/loop-describe-rule-and-loop-design.test.js` has 3-4 new tests, all pass
- [ ] All 4 existing loop-describe test files (`loop-describe.test.js`, `loop-describe-warm-tier.test.js`, `loop-describe-cold-tier-superseded.test.js`, plus any others) pass with no assertion changes
- [ ] All ~580+ prior tests still pass

## Risk Assessment

- **Risk 1:** Renaming `promoted_rules` to `rules` is a breaking change for downstream consumers (e.g., the SessionStart hook's `LOCAL_DISCOVERABILITY_HINTS` reads `r.promoted_rules`). Mitigation: search the codebase for `promoted_rules` references and update them in the same commit. The hook in `.factory/hooks/loop-surface-inject.cjs` (per the change-log) is one consumer; verify and update. **Known test breaks:** `integration-promoted-rule.test.js` (line 186 checks `text.promoted_rules`), `loop-describe.test.js` (line 88 checks `text.promoted_rules`), and `loop-describe-warm-tier.test.js` (line 7 checks `discoverability_hints.length === 5` which becomes 6). These tests MUST be updated in the same commit.
- **Risk 2:** The synthesized shape in `listPromotedRules` (rule_id = id) is a small duplication that might confuse future maintainers. Mitigation: add a JSDoc comment on the function explaining the synthesis.
- **Risk 3:** The `listLoopDesigns` function returns ALL active loop-designs. If the count grows large, the cold tier's `loop_designs` list could exceed the cold tier's 25-100KB budget. Mitigation: the cold tier is "audit only" per `loop_describe`'s tier table; the budget is generous. If the count exceeds 100, a future plan could paginate or filter.
- **Risk 4:** The new discoverability hint mentions "Phase 3" and "Phase 4" by their plan-phase numbers. If a future agent reads this hint in 2027, the phase numbers are meaningless. Mitigation: the hint should reference the plan name (`260606-rule-loop-design-first-class`) not the phase numbers.
- **Risk 5:** The cold tier's `loop_designs` list might include inactive designs (status: "inactive") if the operator explicitly sets `include_expired` or similar. Mitigation: the `listLoopDesigns` function defaults to `statuses: ["active"]`; inactive designs are excluded by default. The cold tier calls `listLoopDesigns(root)` without overriding the default, so only active designs are returned. (A future plan could add a `statuses` parameter to the cold tier surface.)
- **Risk 6:** The `loop_designs` list returns the full entry (including `description`, `severity_hint`, `affected_system`); the cold tier's existing fields (e.g., `all_findings`, `anti_patterns`) return the full entry. This is consistent. The "subset shape" mapping in Step 7 is intentional: it picks a few key fields for discoverability while keeping the full entry available via `meta_state_list`.

## TDD Tests Added (this phase)

| Test File | Test Count | Asserts |
|-----------|------------|---------|
| `__tests__/loop-describe-rule-and-loop-design.test.js` (new) | 3-4 | warm tier renamed + loop_design_count; cold tier loop_designs list with full shape; summary tier counts; hot tier renamed |

**Total: 3-4 new tests across 1 new file; 0 regressions in the ~580 prior tests.**

## References

- `tools/learning-loop-mcp/core/loop-introspect.js#listPromotedRules` (lines ~190-200) — the rewrite target
- `tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS` (lines ~99-105) — the hint extension
- `tools/learning-loop-mcp/tools/loop-describe-tool.js` (lines 50-130) — the tier updates
- `tools/learning-loop-mcp/core/gate-logic.js#loadPromotedRules` (Phase 1's transitional filter) — provides the input to `listPromotedRules`
- `tools/learning-loop-mcp/core/meta-state.js#readRegistry` — the registry reader used by `listLoopDesigns`
- `tools/learning-loop-mcp/core/meta-state.js#metaStateRuleEntrySchema` and `#metaStateLoopDesignSchema` (Phase 1) — the schemas that validate the returned entries
- Locked Decisions in `plan.md` — `rules` rename (in plan body), `discoverability_hints` extension, no consultation
