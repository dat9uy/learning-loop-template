// Phase 1 tests: 'superseded' status + consolidated_into + session_id + consolidates fields + drift filter.
//
// TDD: this file is created BEFORE the implementation. All 7 tests are initially RED
// (failing) and turn GREEN after the schema + drift filter changes are applied.

import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  metaStateFindingEntrySchema,
  metaStateChangeEntrySchema,
  readRegistry,
  updateEntry,
  writeEntry,
  generateId,
} from "../meta-state.js";
import { queryDrift } from "../query-drift.js";

function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function baseEntry(overrides = {}) {
  return {
    id: "meta-260606T0000Z-test",
    entry_kind: "finding",
    status: "active",
    ...overrides,
  };
}

describe("Phase 1: superseded status enum", () => {
  // Test 1: status enum roundtrip
  test("status 'superseded' is accepted on a finding entry", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Marking a stale entry as superseded for audit trail purposes.",
      status: "superseded",
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.status, "superseded");
  });

  // Test 2: consolidated_into + session_id field roundtrips
  test("consolidated_into + session_id fields roundtrip on a finding entry", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "G8 subcommand-class false positive superseded into a change-log entry.",
      status: "superseded",
      consolidated_into: "meta-260606T0000Z-g8-subcommand-class-false-positive-supersede",
      session_id: "droid-abc-123",
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.consolidated_into, "meta-260606T0000Z-g8-subcommand-class-false-positive-supersede");
    assert.strictEqual(result.data.session_id, "droid-abc-123");
  });

  // Test 3: change-log field roundtrip (consolidates)
  test("consolidates field roundtrips on a change-log entry", () => {
    const result = metaStateChangeEntrySchema.safeParse({
      entry_kind: "change-log",
      change_dimension: "mechanical",
      change_target: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
      change_diff: { added: [], removed: [], changed: ["4 G8 subcommand-class finding entries superseded"] },
      reason: "Consolidate 4 G8 subcommand-class false-positive finding entries (recurrences 1, 3, 4, 5) into a single change-log entry.",
      applies_to: { tools: ["meta_state_query_drift"], rules: ["rule-no-new-artifact-types"], statuses: ["superseded"] },
      consolidates: "meta-260602T1112Z-live-g8-subcommand-class-false-positive-rule-no-new-artifact,meta-260602T1635Z-third-documented-g8-subcommand-class-recurrence-rule-no-new,meta-260602T1635Z-fourth-documented-g8-recurrence-and-a-partial-regression-of,meta-260603T1435Z-g8-subcommand-class-false-positive-5th-recurrence-hit-ck-pla",
      evidence: { code_ref: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules", journal: "plans/260605-superseded-status-and-discoverability/phase-2-apply-g8-supersede.md" },
      status: "active",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, true);
    assert.ok(result.data.consolidates.includes("meta-260602T1112Z-live-g8-subcommand-class-false-positive-rule-no-new-artifact"));
  });
});

describe("Phase 1: drift filter terminal status check", () => {
  function baseContext(overrides = {}) {
    return {
      root: makeTempDir("query-drift-superseded-"),
      run_grounding: false,
      now: () => 1700000000000,
      ...overrides,
    };
  }

  // Test 4: drift filter terminal check (status: 'superseded' returns no drift)
  test("status='superseded' returns 0 drift events (terminal check)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
      status: "superseded",
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 0);
    assert.deepStrictEqual(result.drift_events, []);
  });

  // Test 5: drift filter unchanged for active (regression guard)
  test("status='active' unchanged: still returns drift (regression guard)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].recommendation, "resolve");
  });
});

describe("Phase 1: terminal compaction invariant", () => {
  // Test 6: terminal compaction — superseded entries older than 7 days are eligible for compaction.
  test("status='superseded' entries older than 7 days are eligible for compaction", async () => {
    const root = makeTempDir("meta-state-superseded-compaction-");
    const oldId = generateId("old-superseded");
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const newId = generateId("fresh-update-trigger");

    // Write the old superseded entry directly to the registry
    const oldEntry = {
      id: oldId,
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Old superseded entry that should be compacted (>7 days old).",
      status: "superseded",
      consolidated_into: "meta-260606T0000Z-g8-supersede",
      created_at: oldDate,
      expires_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      version: 0,
    };
    await writeEntry(root, oldEntry);

    // Write a fresh entry to trigger updateEntry's compaction
    const freshEntry = {
      id: newId,
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Fresh entry to trigger updateEntry on.",
      status: "reported",
      created_at: new Date().toISOString(),
      version: 0,
    };
    await writeEntry(root, freshEntry);

    // Trigger updateEntry on a separate fresh entry to invoke the compaction pass
    const thirdEntry = {
      id: generateId("third"),
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Third entry that exists to ensure the compaction path runs.",
      status: "reported",
      created_at: new Date().toISOString(),
      version: 0,
    };
    await writeEntry(root, thirdEntry);

    // Update the third entry — this triggers the compaction filter.
    await updateEntry(root, thirdEntry.id, { status: "active" });

    // After updateEntry, the old superseded entry should be compacted away
    const after = readRegistry(root);
    const stillThere = after.find((e) => e.id === oldId);
    assert.strictEqual(stillThere, undefined, "superseded entry older than 7 days should be compacted");
  });
});

describe("Phase 1: end-to-end G8 mock", () => {
  // Test 7: end-to-end G8 mock — superseded entries with valid evidence_code_ref are NOT drift
  test("end-to-end: G8 mock entry with status='superseded' returns 0 drift events", () => {
    const root = makeTempDir("query-drift-g8-mock-");
    mkdirSync(join(root, "tools/learning-loop-mcp/core"), { recursive: true });
    writeFileSync(join(root, "tools/learning-loop-mcp/core/gate-logic.js"), "// mock gate-logic.js content");
    const g8Entry = baseEntry({
      id: "meta-260606T0000Z-g8-subcommand-class-false-positive-7th-recurrence",
      evidence_code_ref: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
      evidence_test: "tools/learning-loop-mcp/__tests__/g8-subcommand-class-entry.test.js",
      status: "superseded",
      consolidated_into: "meta-260606T0000Z-g8-subcommand-class-false-positive-supersede",
    });
    const result = queryDrift([g8Entry], { root, run_grounding: false });
    assert.strictEqual(result.drift_count, 0);
    assert.deepStrictEqual(result.drift_events, []);
  });
});
