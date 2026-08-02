// Phase 3 tests: 'superseded' was collapsed into 'resolved' + a citation row.
//
// Phase 1 tests had: status='superseded' + consolidated_into + drift filter.
// Phase 3 retires the status enum entry, drops the on-record consolidated_into
// stamp, and routes the canonical consolidated edge through the citation log
// (`citations.jsonl`). The drift filter still treats the finding as terminal
// (now via status='resolved'). The `consolidated_into` + `superseded_*`
// fields are inert-historical — old version lines still parse; the live
// write path stamps `resolved` + `resolved_at` + `resolved_by` and emits
// a citation.

import { describe, test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  metaStateFindingEntrySchema,
  metaStateChangeEntrySchema,
  metaStateCitationEntrySchema,
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
    status: "open",
    ...overrides,
  };
}

describe("Phase 3: 'superseded' status retired (collapsed into resolved + citation)", () => {
  // Test 1: schema rejects 'superseded' on a finding entry (the enum no
  // longer accepts it).
  test("status 'superseded' is rejected on a finding entry (Phase 3 enum collapse)", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      id: "meta-test-superseded-status",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Marking a stale entry as superseded (now via resolved + citation).",
      status: "superseded",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, false, "Phase 3 schema rejects the retired `superseded` status");
  });

  // Test 2: 'consolidated_into' is inert-historical — still parses on
  // read but is not stamped by the live write path.
  test("consolidated_into + session_id fields still parse (inert-historical)", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      id: "meta-test-superseded-consolidated-into",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Old version line carrying consolidated_into (inert-historical).",
      status: "resolved",
      consolidated_into: "meta-260606T0000Z-g8-subcommand-class-false-positive-supersede",
      session_id: "droid-abc-123",
      resolved_at: new Date().toISOString(),
      resolved_by: "operator",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.consolidated_into, "meta-260606T0000Z-g8-subcommand-class-false-positive-supersede");
    assert.strictEqual(result.data.session_id, "droid-abc-123");
  });

  // Test 3: change-log `consolidates` field is inert-historical — still
  // parses on read (post-migration canonical edge is the citation log).
  test("consolidates field still parses on a change-log entry (inert-historical)", () => {
    const result = metaStateChangeEntrySchema.safeParse({
      id: "meta-test-superseded-consolidates",
      entry_kind: "change-log",
      change_dimension: "mechanical",
      change_target: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
      change_diff: { added: [], removed: [], changed: ["4 G8 subcommand-class finding entries superseded"] },
      reason: "Consolidate 4 G8 subcommand-class false-positive finding entries (recurrences 1, 3, 4, 5) into a single change-log entry.",
      applies_to: { tools: ["meta_state_query_drift"], rules: ["rule-no-new-artifact-types"], statuses: ["resolved"] },
      consolidates: ["meta-260602T1112Z-live-g8-subcommand-class-false-positive-rule-no-new-artifact", "meta-260602T1635Z-third-documented-g8-subcommand-class-recurrence-rule-no-new"],
      evidence_code_ref: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
      status: "active",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, true);
    assert.ok(result.data.consolidates.includes("meta-260602T1112Z-live-g8-subcommand-class-false-positive-rule-no-new-artifact"));
  });

  // Test 4: a citation row parses with the canonical rationale for a
  // consolidated edge (source:finding, target:change-log).
  test("citation row parses with source=finding, target=change-log, rationale", () => {
    const result = metaStateCitationEntrySchema.safeParse({
      id: "citation-test-001",
      entry_kind: "citation",
      source: "meta-test-superseded-consolidated-into",
      target: "meta-260606T0000Z-g8-subcommand-class-false-positive-supersede",
      rationale: "consolidated into meta-260606T0000Z-g8-subcommand-class-false-positive-supersede",
      recorded_at: new Date().toISOString(),
      recorded_by: "operator",
      status: "active",
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.source, "meta-test-superseded-consolidated-into");
    assert.strictEqual(result.data.target, "meta-260606T0000Z-g8-subcommand-class-false-positive-supersede");
    assert.strictEqual(result.data.rationale, "consolidated into meta-260606T0000Z-g8-subcommand-class-false-positive-supersede");
    assert.strictEqual(result.data.status, "active");
  });
});

describe("Phase 3: drift filter terminal status check (resolved)", () => {
  function baseContext(overrides = {}) {
    return {
      root: makeTempDir("query-drift-superseded-"),
      run_grounding: false,
      now: () => 1700000000000,
      ...overrides,
    };
  }

  // Test 5: drift filter terminal check (status='resolved' returns no
  // drift — the closure that `superseded` previously expressed).
  test("status='resolved' returns 0 drift events (terminal check; supersede closure)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
      status: "resolved",
    });
    const result = queryDrift([entry], ctx);
    assert.strictEqual(result.drift_count, 0);
    assert.deepStrictEqual(result.drift_events, []);
  });

  // Test 6: drift filter unchanged for active (regression guard)
  test("status='open' still returns drift (regression guard)", () => {
    const ctx = baseContext();
    writeFileSync(join(ctx.root, "src.js"), "// code");
    writeFileSync(join(ctx.root, "src.test.js"), "// test");
    const entry = baseEntry({
      evidence_code_ref: "src.js",
      evidence_test: "src.test.js",
    });
    const result = queryDrift([entry], ctx);
    // No positive test_passed signal → code-only (active-uncertain) → investigate.
    assert.strictEqual(result.drift_count, 1);
    assert.strictEqual(result.drift_events[0].recommendation, "investigate");
  });
});

describe("Phase 3: terminal compaction invariant (resolved)", () => {
  // Test 7: terminal compaction — resolved entries older than 7 days are eligible for compaction.
  test("status='resolved' entries older than 7 days are eligible for compaction", async () => {
    const root = makeTempDir("meta-state-superseded-compaction-");
    const oldId = generateId("old-resolved");
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const newId = generateId("fresh-update-trigger");

    // Write the old resolved entry directly to the registry (mimics a
    // post-migration finding closed by meta_state_supersede; the citation
    // row also lives in citations.jsonl in production).
    const oldEntry = {
      id: oldId,
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Old resolved entry that should be compacted (>7 days old).",
      status: "resolved",
      resolved_at: oldDate,
      resolved_by: "operator",
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
      status: "open",
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
      status: "open",
      created_at: new Date().toISOString(),
      version: 0,
    };
    await writeEntry(root, thirdEntry);

    // Plan 260716-1101 Tier 2 Phase B: updateEntry no longer compacts inline
    // (true-append only). Compaction is now Phase C's `compact-registry.sh
    // --full` responsibility. We verify the new Phase B invariant: the old
    // resolved entry is NOT compacted by updateEntry (still in registry),
    // and the projection returns it as-is (no in-place filtering).
    await updateEntry(root, thirdEntry.id, { description: "Touch to invoke Phase B write path" });

    // Phase B: resolved entry stays in the file; compaction is Phase C.
    const after = readRegistry(root);
    const stillThere = after.find((e) => e.id === oldId);
    assert.ok(stillThere, "Phase B: resolved entry stays in registry (compaction is Phase C)");
    assert.equal(stillThere.status, "resolved", "status preserved across updateEntry on a different entry");
  });
});

describe("Phase 3: end-to-end G8 mock (resolved + citation)", () => {
  // Test 8: end-to-end G8 mock — resolved entries with valid evidence_code_ref are NOT drift
  test("end-to-end: G8 mock entry with status='resolved' returns 0 drift events", () => {
    const root = makeTempDir("query-drift-g8-mock-");
    mkdirSync(join(root, "tools/learning-loop-mcp/core"), { recursive: true });
    writeFileSync(join(root, "tools/learning-loop-mcp/core/gate-logic.js"), "// mock gate-logic.js content");
    const g8Entry = baseEntry({
      id: "meta-260606T0000Z-g8-subcommand-class-false-positive-7th-recurrence",
      evidence_code_ref: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
      evidence_test: "tools/learning-loop-mcp/__tests__/g8-subcommand-class-entry.test.js",
      status: "resolved",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
    });
    const result = queryDrift([g8Entry], { root, run_grounding: false });
    assert.strictEqual(result.drift_count, 0);
    assert.deepStrictEqual(result.drift_events, []);
  });
});