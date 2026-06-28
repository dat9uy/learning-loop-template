---
phase: 5
title: "MechanismB-TestsAndSnapshot"
status: pending
priority: P2
dependencies: [4]
effort: "0.5d"
---

# Phase 5: Mechanism B — Tests + Snapshot + Final Verification

## Overview

Closes the TDD red phase from Phases 3 and 4. Writes the unit tests for `core/entry/index.js` cross-cutting helpers, captures the snapshot test for `meta_state_relationships` wire shape, runs the full test suite (baseline + ~30 new), and verifies the soft-inversion safeguards from the `/ck:predict` verdict hold.

This phase is the green gate for Mechanism B as a whole.

## Requirements

- **Functional:** `core/entry/index.test.js` (sibling pattern per validation decision 2026-06-27) exists with ≥4 sub-tests covering `factoryFor`, `validateCrossRefs`, `findOrphans`, `outboundRefsAll`.
- **Functional:** snapshot test for `meta_state_relationships` captures wire shape BEFORE reimplementation (in Phase 4, using the fixture infrastructure created there) and asserts deepStrictEqual-equality AFTER (in this phase). One of the fixtures MUST be a legacy finding without `promoted_to_rule` to exercise the dual-field migration logic.
- **Functional:** the soft-inversion safeguards from §4.5 of the brainstorm are verified:
  1. `createRule.schema === metaStateRuleEntrySchema` (reference equality).
  2. `core/README.md` contains the "Schema = validation source. Factory = ergonomic surface." string.
  3. `core/README.md` contains the ADR-style reversion clause.
- **Functional:** full test suite (baseline tests + ~30 new) is green.

## Architecture

**`core/entry/index.test.js`** — 4 sub-tests + 1 integration test (sibling pattern per validation decision):

```js
import { test } from "node:test";
import assert from "node:assert";
import {
  factoryFor, validateCrossRefs, findOrphans, outboundRefsAll,
  createFinding, createRule, createChangeLog, createLoopDesign,
} from "../index.js";

// Fixtures: minimal valid entries per kind, plus a registry combining them.
const FIXTURES = {
  finding:      { id: "meta-test-finding",      entry_kind: "finding",      /* ... */ },
  rule:         { id: "rule-test-rule",         entry_kind: "rule",         /* ... */ },
  changeLog:    { id: "meta-test-changelog",    entry_kind: "change-log",   /* ... */ },
  loopDesign:   { id: "loop-design-test",       entry_kind: "loop-design",  /* ... */ },
};

test("factoryFor dispatches by entry_kind", () => {
  assert.strictEqual(factoryFor(FIXTURES.finding).kind, "finding");
  assert.strictEqual(factoryFor(FIXTURES.rule).kind, "rule");
  assert.strictEqual(factoryFor(FIXTURES.changeLog).kind, "change-log");
  assert.strictEqual(factoryFor(FIXTURES.loopDesign).kind, "loop-design");
});

test("factoryFor throws on unknown entry_kind", () => {
  assert.throws(() => factoryFor({ entry_kind: "unknown" }));
});

test("validateCrossRefs returns empty orphans for a clean registry", () => {
  const registry = Object.values(FIXTURES);
  const { orphans } = validateCrossRefs(registry);  // or (root) variant
  assert.deepStrictEqual(orphans, []);
});

test("validateCrossRefs surfaces missing outbound refs", () => {
  // Fixture: a Finding with consolidated_into pointing at a non-existent id.
  const orphanFinding = { ...FIXTURES.finding, consolidated_into: "meta-does-not-exist" };
  const { orphans } = validateCrossRefs([orphanFinding]);
  assert.strictEqual(orphans.length, 1);
  assert.deepStrictEqual(orphans[0], {
    from: orphanFinding.id,
    to: "meta-does-not-exist",
    field: "consolidated_into",
  });
});

test("outboundRefsAll returns a Map of id → refs", () => {
  const registry = Object.values(FIXTURES);
  const graph = outboundRefsAll(registry);
  for (const entry of registry) {
    assert.ok(graph.has(entry.id));
    assert.ok(Array.isArray(graph.get(entry.id)));
  }
});

test("soft inversion: instance.schema === canonical schema (reference equality)", () => {
  // Already covered in factory unit tests (Phase 3); restate here for the cross-cutting layer.
  assert.strictEqual(createFinding.schema, undefined);  // factory itself has no schema; instance has one
  const finding = createFinding(FIXTURES.finding);
  assert.strictEqual(finding.schema, FIXTURES.finding.constructor.prototype);  // placeholder; adjust to actual canonical schema import
});
```

**Snapshot test for `meta_state_relationships`**:

```js
// __tests__/phase-e-foundation/meta-state-relationships-snapshot.test.js
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { metaStateRelationshipsTool } from "../../../tools/legacy/meta-state-relationships-tool.js";

const SNAPSHOT_DIR = join(import.meta.dirname, "snapshots");

const FIXTURE_ENTRIES = {
  finding:    { id: "meta-test-finding",   /* ... */ },
  rule:       { id: "rule-test-rule",      /* ... */ },
  changeLog:  { id: "meta-test-changelog", /* ... */ },
};

test("meta_state_relationships wire shape unchanged (snapshot)", async () => {
  for (const [name, entry] of Object.entries(FIXTURE_ENTRIES)) {
    const snapshotPath = join(SNAPSHOT_DIR, `${name}.json`);
    const expected = JSON.parse(readFileSync(snapshotPath, "utf8"));

    const result = await metaStateRelationshipsTool.handler({ id: entry.id, direction: "both" });
    const actual = JSON.parse(result.content[0].text);

    assert.deepStrictEqual(actual, expected, `snapshot mismatch for ${name}`);
  }
});
```

The snapshot files (`finding.json`, `rule.json`, `change-log.json`) are captured by running the OLD tool BEFORE Phase 4's reimplementation lands, then committed. This phase just verifies the new tool produces the same output.

**Soft-inversion safeguard tests** (folded into `core/entry/index.test.js` or a new file):

```js
test("createRule instance.schema === metaStateRuleEntrySchema (reference equality)", async () => {
  const { metaStateRuleEntrySchema } = await import("../../../meta-state.js");
  const { createRule } = await import("../rule.js");
  const rule = createRule(FIXTURES.rule);
  // instance.schema, NOT createRule.schema (factory function has no .schema)
  assert.strictEqual(rule.schema, metaStateRuleEntrySchema);
});

test("factory outputs are deep-frozen", () => {
  const rule = createRule(FIXTURES.rule);
  // Top-level is frozen
  assert.ok(Object.isFrozen(rule));
  // Nested objects are also frozen (deep-freeze contract)
  if (rule.data.verification !== undefined) {
    assert.ok(Object.isFrozen(rule.data.verification), "nested verification must be frozen");
  }
  // Mutation throws
  assert.throws(() => { rule.data = null; }, TypeError);
});

test("core/README.md documents the soft-inversion contract", () => {
  const readme = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "README.md"),
    "utf8",
  );
  assert.match(readme, /Schema = validation source/);
  assert.match(readme, /Factory = ergonomic surface/);
  assert.match(readme, /Soft inversion by operator decision 2026-06-27/);
  assert.match(readme, /factoryInstance\.schema/);  // not factory.schema
});
```

## Related Code Files

- Create: `tools/learning-loop-mastra/core/entry/index.test.js` (sibling pattern)
- Create: `tools/learning-loop-mastra/__tests__/phase-e-foundation/meta-state-relationships-snapshot.test.js`
- Create: `tools/learning-loop-mastra/__tests__/phase-e-foundation/fixtures/meta-state-fixtures.js` (mkdtempSync + seeded registry helper per validation decision)
- Create: `tools/learning-loop-mastra/__tests__/phase-e-foundation/snapshots/{finding,rule,change-log,loop-design}.json` (committed BEFORE Phase 4 reimplementation)

No other files modified.

## Implementation Steps

1. **Capture snapshots BEFORE Phase 4 reimplementation ships.**
   - This step ideally happens at the START of Phase 4. By the time Phase 5 runs, the snapshot files are committed.
   - If snapshots weren't captured: run the OLD `meta_state_relationships` tool against fixture entries, save the output as JSON, commit as the snapshot. Then proceed with Phase 4's reimplementation (which should produce identical output).

2. **Write `core/entry/index.test.js`** (sibling pattern per validation decision).
   - Implement the 4 sub-tests from the architecture above.
   - Run: `node --test tools/learning-loop-mastra/core/entry/index.test.js`
   - Expected: 4-5 passing tests (the helpers from Phase 4 are already in place).

3. **Write the snapshot test.**
   - Implement the snapshot test from the architecture above.
   - Run: `node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/meta-state-relationships-snapshot.test.js`
   - Expected: passing (snapshot was captured in step 1; reimplementation in Phase 4 produced identical output).

4. **Write the soft-inversion safeguard tests.**
   - Implement the 2 safeguard tests from the architecture above (one for schema reference equality, one for `core/README.md` content).
   - Run: `node --test ...`
   - Expected: passing.

5. **Run the full test suite.**
   - `pnpm test`
   - Expected: all baseline tests pass; new tests:
     - 4-5 in `finding.test.js`
     - 5-7 in `rule.test.js` (matches + appliesTo branches)
     - 3-4 in `change-log.test.js`
     - 3-4 in `loop-design.test.js`
     - 5-6 in `index.test.js`
     - 1-4 in `meta-state-relationships-snapshot.test.js` (one per kind, including the legacy-finding fixture)
     - 3-4 in soft-inversion safeguards (instance.schema equality, deep-freeze, README content)
   - Total new tests: ~25-35.

6. **Final FCIS check.**
   - `node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/fcis-invariant.test.js`
   - Expected: still green (the new `core/entry/` files contain zero `@mastra/*` imports — verify this).

7. **Run meta-state-specific tests if they exist.**
   - `node --test tools/learning-loop-mastra/core/meta-state.test.js`
   - Expected: still green (factories wrap schemas; raw schema usage still works).

8. **Commit.**
   - One commit: `test(phase-e): factory unit tests + meta_state_relationships snapshot + soft-inversion safeguards`
   - Body: `~30 new tests covering factories, cross-cutting helpers, snapshot-locked wire shape, and soft-inversion safeguards. All tests green.`

## Success Criteria

- [ ] `core/entry/index.test.js` (sibling pattern) exists with ≥4 sub-tests
- [ ] Snapshot test (`meta-state-relationships-snapshot.test.js`) passes against the reimplemented tool, **including the legacy-finding fixture that exercises the dual-field `promoted_to_rule` migration**
- [ ] Soft-inversion safeguard tests pass: **instance.schema** === canonicalSchema, deep-freeze works, README contains the contract + ADR + factoryInstance.schema wording
- [ ] All existing tests still pass (baseline measured at Phase-0)
- [ ] ~25-35 new tests pass
- [ ] FCIS invariant still holds (zero `@mastra/*` imports in `core/`)
- [ ] The `__tests__/phase-e-foundation/` suite is green (4 existing + placement-manifest + snapshot = 6 tests)

## Risk Assessment

- **R1 (snapshot was captured against the OLD tool, and the reimplementation has a subtle wire diff):** if the snapshot test fails, the diff is most likely whitespace, key-order, or a missing field. Mitigation: read the diff carefully; if it's structural, revert Phase 4 and investigate. If it's cosmetic (whitespace), update the snapshot with a one-line justification in the PR.
- **R2 (soft-inversion safeguard test fails because README drifts from the test):** the test hardcodes the expected strings ("Schema = validation source", "Factory = ergonomic surface", "Soft inversion by operator decision 2026-06-27"). If the README is edited in the future, the test breaks. Mitigation: the safeguard test is intentional — README drift is a problem. If the strings change, the test should be updated in the same PR (don't relax the test independently).
- **R3 (`core/entry/` accidentally imports a shell file):** the new directory sits under `core/`, so the FCIS test should catch it. Mitigation: the FCIS test runs as part of the standard suite; any `@mastra/*` import triggers failure. Verify by adding a deliberate violation, watching the test fail, then removing it.
- **R4 (snapshot test makes the project brittle to incidental JSON ordering):** Node's `JSON.stringify` is stable for objects with the same key insertion order. The reimplemented tool builds the result object in the same order as the old tool. Mitigation: if ordering drift appears, normalize via `JSON.stringify` with a replacer that sorts keys (a one-line change).
- **R5 (the snapshot test depends on a fixture entry that gets modified):** the fixtures use generic ids (`meta-test-finding`, `rule-test-rule`); they should be stable. If a future test cleanup removes them, the snapshot test breaks. Mitigation: document the fixture ids in the test file's comment header; fixture entries are NOT cleaned up by the project standard (`meta-state.test.js` keeps its fixtures too).