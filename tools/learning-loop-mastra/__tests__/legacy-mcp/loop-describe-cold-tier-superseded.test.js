// Phase 3 tests: loop_describe({ tier: 'cold' }) `superseded_lineage` is
// re-derived from the citation log (`citations.jsonl`). The field name
// is retained for backward compat but the source of truth is now
// citation rows, not on-record `consolidated_into`/`consolidates`
// fields. The `orphans` array still surfaces citations whose target is
// a missing change-log.

import { describe, test } from "vitest";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loopDescribeTool } from "../../tools/handlers/loop-describe-tool.js";
import {
  readRegistry,
  writeEntry,
  appendCitationEntryAtomic,
  generateId,
} from "../../core/meta-state.js";

function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

// Test fixture IDs use a 'test-' prefix to avoid matching the meta-state ID
// format (which the secret-detection shield would flag as a potential token).
const TEST_IDS = {
  ORPHAN_BAD_TARGET: "test-fixture-orphan-with-bad-target",
  NONEXISTENT_TARGET: "test-fixture-does-not-exist",
  ACTIVE_FINDING: "test-fixture-active-finding",
  FINDING_1: "test-fixture-finding-1",
  FINDING_2: "test-fixture-finding-2",
  FINDING_3: "test-fixture-finding-3",
};

async function seedRegistry(root) {
  const changeLogId = generateId("g8-subcommand-class-false-positive-supersede-test");
  const finding1Id = TEST_IDS.FINDING_1;
  const finding2Id = TEST_IDS.FINDING_2;
  const finding3Id = TEST_IDS.FINDING_3;

  await writeEntry(root, {
    id: changeLogId,
    entry_kind: "change-log",
    change_dimension: "mechanical",
    change_target: "tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules",
    change_diff: { added: [], removed: [], changed: ["3 test G8 subcommand-class finding entries superseded"] },
    reason: "Consolidate 3 G8 test subcommand-class false-positive finding entries into a single change-log for the Phase 3 test fixture.",
    applies_to: { tools: ["meta_state_query_drift"], rules: ["rule-no-new-artifact-types"], statuses: ["resolved"] },
    consolidates: [finding1Id, finding2Id, finding3Id],
    evidence_code_ref: "tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules",
    status: "active",
    created_at: "2026-06-06T00:30:00.000Z",
    version: 0,
  });

  // Phase 3: status='resolved' (no longer 'superseded'); the canonical
  // consolidated edge is a citation row per finding.
  for (const [idx, id] of [[1, finding1Id], [2, finding2Id], [3, finding3Id]]) {
    await writeEntry(root, {
      id,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      subtype: "gate-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: `G8 subcommand-class false positive test finding #${idx}.`,
      evidence: { code_ref: "tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules" },
      status: "resolved",
      resolved_at: "2026-06-06T00:30:00.000Z",
      resolved_by: "operator",
      created_at: "2026-06-02T04:12:54.031Z",
      version: 0,
    });
    appendCitationEntryAtomic(root, {
      id: `citation-test-${idx}`,
      entry_kind: "citation",
      source: id,
      target: changeLogId,
      rationale: `consolidated into ${changeLogId}`,
      recorded_at: "2026-06-06T00:30:00.000Z",
      recorded_by: "operator",
      status: "active",
    });
  }

  return { changeLogId, finding1Id, finding2Id, finding3Id };
}

describe("loop_describe cold-tier superseded_lineage (Phase 3: citation-sourced)", () => {
  // Test 1: cold tier includes resolved findings grouped by change-log,
  // sourced from citation rows.
  test("cold tier includes resolved findings grouped by change-log (citation rows)", async () => {
    const root = makeTempDir("loop-describe-cold-superseded-");
    const { changeLogId, finding1Id, finding2Id } = await seedRegistry(root);

    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    try {
      const result = await loopDescribeTool.handler({ tier: "cold" });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.tier, "cold");
      assert.ok(Array.isArray(text.superseded_lineage), "superseded_lineage must be an array");
      assert.strictEqual(text.superseded_lineage.length, 1, "expected 1 lineage group");

      const group = text.superseded_lineage[0];
      assert.strictEqual(group.change_log.id, changeLogId);
      assert.strictEqual(group.findings.length, 3, "expected 3 findings in the group");
      const findingIds = group.findings.map((f) => f.id).sort();
      assert.ok(findingIds.includes(finding1Id));
      assert.ok(findingIds.includes(finding2Id));
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // Test 2: cold tier excludes findings with no citation row (no
  // audit-trail pointer in the citation log).
  test("cold tier excludes findings with no citation row", async () => {
    const root = makeTempDir("loop-describe-cold-exclude-");
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    try {
      // Add a resolved finding with no citation row — must NOT appear
      // in either lineage or orphans.
      await writeEntry(root, {
        id: TEST_IDS.ORPHAN_BAD_TARGET, // reuse a fixture id
        entry_kind: "finding",
        category: "loop-anti-pattern",
        subtype: "gate-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "A resolved finding with no citation row — must be excluded from lineage (no audit-trail pointer).",
        evidence: { code_ref: "tools/learning-loop-mastra/core/gate-logic.js" },
        status: "resolved",
        resolved_at: "2026-06-06T00:01:00.000Z",
        resolved_by: "operator",
        created_at: "2026-06-06T00:01:00.000Z",
        version: 0,
      });

      // Seed the 3-finding fixture (each finding gets a citation row).
      const { changeLogId } = await seedRegistry(root);

      const result = await loopDescribeTool.handler({ tier: "cold" });
      const text = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(text.superseded_lineage));
      // The seeded fixture has 1 lineage group; the no-citation entry must NOT be in it.
      assert.strictEqual(text.superseded_lineage.length, 1);
      assert.strictEqual(text.superseded_lineage[0].change_log.id, changeLogId);
      // The no-citation entry must not appear in the lineage group.
      const ids = text.superseded_lineage[0].findings.map((f) => f.id);
      assert.ok(!ids.includes(TEST_IDS.ORPHAN_BAD_TARGET));
      // And it must not be in orphans (orphans is for citations whose target doesn't resolve).
      assert.strictEqual(text.orphans, undefined, "orphans must be omitted when no citation has a non-resolving target");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // Test 3: cold tier handles orphaned citations (target = non-existent change-log).
  test("cold tier surfaces orphaned citations in separate orphans array", async () => {
    const root = makeTempDir("loop-describe-cold-orphan-");
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    try {
      // Add a finding whose citation target points to a non-existent change-log.
      await writeEntry(root, {
        id: TEST_IDS.ORPHAN_BAD_TARGET,
        entry_kind: "finding",
        category: "loop-anti-pattern",
        subtype: "gate-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Finding whose citation points to a non-existent change-log id.",
        evidence: { code_ref: "tools/learning-loop-mastra/core/gate-logic.js" },
        status: "resolved",
        resolved_at: "2026-06-06T00:02:00.000Z",
        resolved_by: "operator",
        created_at: "2026-06-06T00:02:00.000Z",
        version: 0,
      });
      appendCitationEntryAtomic(root, {
        id: "citation-orphan-test",
        entry_kind: "citation",
        source: TEST_IDS.ORPHAN_BAD_TARGET,
        target: TEST_IDS.NONEXISTENT_TARGET,
        rationale: `consolidated into ${TEST_IDS.NONEXISTENT_TARGET}`,
        recorded_at: "2026-06-06T00:02:00.000Z",
        recorded_by: "operator",
        status: "active",
      });

      const result = await loopDescribeTool.handler({ tier: "cold" });
      const text = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(text.orphans));
      assert.strictEqual(text.orphans.length, 1);
      assert.strictEqual(text.orphans[0].id, TEST_IDS.ORPHAN_BAD_TARGET);
      assert.strictEqual(text.orphans[0].consolidated_into, TEST_IDS.NONEXISTENT_TARGET);
      assert.strictEqual(text.orphans[0].note, "change-log not found");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // Test 4: cold tier returns empty lineage when no citations exist.
  test("cold tier returns empty lineage when no citations exist (no orphans field)", async () => {
    const root = makeTempDir("loop-describe-cold-empty-");
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    try {
      // Add only an active finding (no citation row).
      await writeEntry(root, {
        id: TEST_IDS.ACTIVE_FINDING,
        entry_kind: "finding",
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "An active finding with no citation row for the empty lineage test.",
        evidence: { code_ref: "tools/learning-loop-mastra/core/gate-logic.js" },
        status: "open",
        created_at: "2026-06-06T00:03:00.000Z",
        version: 0,
      });

      const result = await loopDescribeTool.handler({ tier: "cold" });
      const text = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(text.superseded_lineage));
      assert.strictEqual(text.superseded_lineage.length, 0);
      // When there are no orphans, the field should be omitted (not an empty array)
      assert.strictEqual(text.orphans, undefined, "orphans field should be omitted when empty");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});