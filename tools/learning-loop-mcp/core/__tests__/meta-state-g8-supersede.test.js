// Phase 2 tests: Apply 'superseded' status + consolidated_into / consolidates
// to the 4 G8 subcommand-class finding entries (1st, 3rd, 4th, 5th recurrences).
//
// TDD: this file is created BEFORE the implementation. Both tests are initially
// RED (failing) and turn GREEN after the housekeeping batched mutation is applied
// to meta-state.jsonl (or to a fixture registry in the test).

import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegistry, updateEntry, writeEntry } from "../meta-state.js";
import { queryDrift } from "../query-drift.js";

const G8_IDS = [
  "meta-260602T1112Z-live-g8-subcommand-class-false-positive-rule-no-new-artifact",
  "meta-260602T1635Z-third-documented-g8-subcommand-class-recurrence-rule-no-new",
  "meta-260602T1635Z-fourth-documented-g8-recurrence-and-a-partial-regression-of",
  "meta-260603T1435Z-g8-subcommand-class-false-positive-5th-recurrence-hit-ck-pla",
];

function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

async function applyG8Supersede(root, changeLogId) {
  // 1. Write the change-log entry
  await writeEntry(root, {
    id: changeLogId,
    entry_kind: "change-log",
    change_dimension: "mechanical",
    change_target: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
    change_diff: { added: [], removed: [], changed: ["4 G8 subcommand-class finding entries superseded"] },
    reason: "Consolidate 4 G8 subcommand-class false-positive finding entries (recurrences 1, 3, 4, 5) into a single change-log. Empirical test 2026-06-06 confirmed: bug is NOT fixed by mechanism. applyPromotedRules still matches bare 'create' in subcommand names.",
    applies_to: {
      tools: ["meta_state_query_drift"],
      rules: ["rule-no-new-artifact-types"],
      statuses: ["superseded"],
    },
    consolidates: G8_IDS.join(","),
    evidence_code_ref: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
    evidence_journal: "plans/260605-superseded-status-and-discoverability/phase-2-apply-g8-supersede.md",
    status: "active",
    created_at: new Date().toISOString(),
    version: 0,
  });

  // 2. Update each finding entry
  for (const id of G8_IDS) {
    const annotation = `\n\nSUPERSEDED 2026-06-06 by change-log ${changeLogId}: bug is empirically NOT fixed by mechanism; the AGENTS.md 'use Create tool directly' workaround remains the active mitigation. The actual fix (regex qualifier or subcommand-name allowlist) is a separate plan.`;
    const cur = readRegistry(root).find((e) => e.id === id);
    if (!cur) continue;
    await updateEntry(root, id, {
      status: "superseded",
      consolidated_into: changeLogId,
      description: cur.description + annotation,
    });
  }
}

async function seedG8Findings(root) {
  for (const id of G8_IDS) {
    await writeEntry(root, {
      id,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      subtype: "gate-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: `G8 subcommand-class false positive recurrence for id ${id}.`,
      evidence: { code_ref: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules" },
      status: "expired",
      created_at: "2026-06-02T04:12:54.031Z",
      expires_at: "2026-06-03T04:12:54.031Z",
      acked_at: null,
      version: 0,
    });
  }
}

describe("Phase 2: G8 housekeeping end-to-end", () => {
  // Test 1: G8 housekeeping end-to-end
  test("4 G8 finding entries transition to status='superseded' with consolidated_into, change-log has consolidates; 0 drift", async () => {
    const root = makeTempDir("meta-state-g8-supersede-e2e-");
    await seedG8Findings(root);

    const changeLogId = "meta-260606T0000Z-g8-subcommand-class-false-positive-supersede";
    await applyG8Supersede(root, changeLogId);

    // Verify the 4 finding entries are now superseded
    const after = readRegistry(root);
    for (const id of G8_IDS) {
      const entry = after.find((e) => e.id === id);
      assert.ok(entry, `Finding ${id} should still exist`);
      assert.strictEqual(entry.status, "superseded", `${id} should be superseded`);
      assert.strictEqual(entry.consolidated_into, changeLogId, `${id} should point to change-log`);
      assert.ok(
        entry.description.includes("SUPERSEDED 2026-06-06"),
        `${id} description should include SUPERSEDED annotation`,
      );
    }

    // Verify the change-log entry has consolidates
    const changeLog = after.find((e) => e.id === changeLogId);
    assert.ok(changeLog, "Change-log entry should exist");
    assert.strictEqual(changeLog.entry_kind, "change-log");
    const consolidatesIds = changeLog.consolidates.split(",");
    assert.deepStrictEqual(consolidatesIds.sort(), [...G8_IDS].sort());

    // Verify queryDrift returns 0 for the G8 entries (terminal)
    // Use evidence_code_ref that points to a real file to ensure SP1 would normally say drift
    mkdirSync(join(root, "tools/learning-loop-mcp/core"), { recursive: true });
    writeFileSync(join(root, "tools/learning-loop-mcp/core/gate-logic.js"), "// mock");
    const g8Entries = after.filter((e) => G8_IDS.includes(e.id));
    const driftResult = queryDrift(g8Entries, { root, run_grounding: false });
    assert.strictEqual(driftResult.drift_count, 0, "G8 superseded entries should not be drift candidates");
    assert.deepStrictEqual(driftResult.drift_events, []);
  });

  // Test 2: change-log/finding symmetry
  test("each G8 finding's consolidated_into points to a change-log whose consolidates contains the finding id", async () => {
    const root = makeTempDir("meta-state-g8-symmetry-");
    await seedG8Findings(root);

    const changeLogId = "meta-260606T0000Z-g8-subcommand-class-false-positive-supersede";
    await applyG8Supersede(root, changeLogId);

    const after = readRegistry(root);
    const changeLog = after.find((e) => e.id === changeLogId);
    assert.ok(changeLog, "Change-log entry should exist");
    const consolidatesIds = changeLog.consolidates.split(",");

    for (const id of G8_IDS) {
      const finding = after.find((e) => e.id === id);
      assert.ok(finding, `Finding ${id} should still exist`);
      assert.strictEqual(finding.consolidated_into, changeLogId);
      assert.ok(
        consolidatesIds.includes(id),
        `consolidates field should include ${id} (got: ${consolidatesIds.join(",")})`,
      );
    }
  });
});
