// Phase 3 tests: Apply 'resolved' + citation to the 4 G8 subcommand-class
// finding entries (1st, 3rd, 4th, 5th recurrences).
//
// Phase 2 used `meta_state_supersede`-style on-record stamps
// (status:'superseded' + consolidated_into). Phase 3 routes the canonical
// consolidated edge through `citations.jsonl`; meta_state_supersede stamps
// status:'resolved' + resolved_at/resolved_by AND emits a citation row
// ({source:finding, target:change-log, rationale:'consolidated into…'}).
// The change-log's on-record `consolidates` field is inert-historical
// post-Phase 3 — the live edge is the citation log.

import { describe, test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegistry, updateEntry, writeEntry, appendCitationEntryAtomic } from "../meta-state.js";
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

// Phase 3 mock for meta_state_supersede: stamp status='resolved' +
// resolved_at/resolved_by AND append a citation row to citations.jsonl.
// Mirrors the production tool handler (tools/handlers/meta-state-supersede-tool.js).
async function applyG8Supersede(root, changeLogId) {
  const now = new Date().toISOString();

  // 1. Write the change-log entry (the consolidated target).
  await writeEntry(root, {
    id: changeLogId,
    entry_kind: "change-log",
    change_dimension: "mechanical",
    change_target: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
    change_diff: { added: [], removed: [], changed: ["4 G8 subcommand-class finding entries resolved + cited"] },
    reason: "Consolidate 4 G8 subcommand-class false-positive finding entries (recurrences 1, 3, 4, 5) into a single change-log. Empirical test 2026-06-06 confirmed: bug is NOT fixed by mechanism. applyPromotedRules still matches bare 'create' in subcommand names.",
    applies_to: {
      tools: ["meta_state_query_drift"],
      rules: ["rule-no-new-artifact-types"],
      statuses: ["resolved"],
    },
    consolidates: G8_IDS,
    evidence_code_ref: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
    evidence_journal: "plans/260605-superseded-status-and-discoverability/phase-2-apply-g8-supersede.md",
    status: "active",
    created_at: now,
    version: 0,
  });

  // 2. Update each finding entry: stamp resolved + resolved_at + resolved_by.
  // 3. Emit a citation row per finding → change-log.
  for (const id of G8_IDS) {
    const annotation = `\n\nRESOLVED + CITED 2026-08-02 by change-log ${changeLogId}: bug is empirically NOT fixed by mechanism; the AGENTS.md 'use Create tool directly' workaround remains the active mitigation. The actual fix (regex qualifier or subcommand-name allowlist) is a separate plan.`;
    const cur = readRegistry(root).find((e) => e.id === id);
    if (!cur) continue;
    await updateEntry(root, id, {
      status: "resolved",
      resolved_at: now,
      resolved_by: "operator",
      description: cur.description + annotation,
    });
    appendCitationEntryAtomic(root, {
      id: `citation-g8-${id.slice(5, 30)}`,
      entry_kind: "citation",
      source: id,
      target: changeLogId,
      rationale: `consolidated into ${changeLogId}`,
      recorded_at: now,
      recorded_by: "operator",
      status: "active",
    });
  }
}

async function seedG8Findings(root) {
  const now = new Date().toISOString();
  for (const id of G8_IDS) {
    await writeEntry(root, {
      id,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      subtype: "gate-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: `G8 subcommand-class false positive recurrence for id ${id}.`,
      evidence_code_ref: "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
      status: "open",
      created_at: now,
      acked_at: null,
      version: 0,
    });
  }
}

describe("Phase 3: G8 housekeeping end-to-end (resolved + citation)", () => {
  // Test 1: G8 housekeeping end-to-end (Phase 3 shape).
  test("4 G8 finding entries transition to status='resolved' with a citation per finding; 0 drift", async () => {
    const root = makeTempDir("meta-state-g8-supersede-e2e-");
    await seedG8Findings(root);

    const changeLogId = "meta-260606T0000Z-g8-subcommand-class-false-positive-supersede";
    await applyG8Supersede(root, changeLogId);

    // Verify the 4 finding entries are now resolved (not 'superseded').
    const after = readRegistry(root);
    for (const id of G8_IDS) {
      const entry = after.find((e) => e.id === id);
      assert.ok(entry, `Finding ${id} should still exist`);
      assert.strictEqual(entry.status, "resolved", `${id} should be resolved`);
      assert.ok(entry.resolved_at, `${id} should carry resolved_at`);
      assert.strictEqual(entry.resolved_by, "operator", `${id} should carry resolved_by`);
      assert.ok(
        entry.description.includes("RESOLVED + CITED 2026-08-02"),
        `${id} description should include RESOLVED + CITED annotation`,
      );
    }

    // Verify the change-log entry still has `consolidates` (inert-historical).
    const changeLog = after.find((e) => e.id === changeLogId);
    assert.ok(changeLog, "Change-log entry should exist");
    assert.strictEqual(changeLog.entry_kind, "change-log");
    const consolidatesIds = changeLog.consolidates;
    assert.deepStrictEqual(consolidatesIds.sort(), [...G8_IDS].sort());

    // Verify the citation rows exist (Phase 3 canonical edge).
    // The union read includes meta-state.jsonl + change-log.jsonl +
    // citations.jsonl. The citation rows are appended to citations.jsonl.
    const citationRows = after.filter((e) => e.entry_kind === "citation");
    assert.strictEqual(citationRows.length, G8_IDS.length, "expected one citation per finding");
    for (const id of G8_IDS) {
      const cit = citationRows.find((c) => c.source === id && c.target === changeLogId);
      assert.ok(cit, `expected citation row for finding ${id} → ${changeLogId}`);
      assert.strictEqual(cit.rationale, `consolidated into ${changeLogId}`);
      assert.strictEqual(cit.status, "active");
    }

    // Verify queryDrift returns 0 for the G8 entries (terminal — resolved).
    mkdirSync(join(root, "tools/learning-loop-mcp/core"), { recursive: true });
    writeFileSync(join(root, "tools/learning-loop-mcp/core/gate-logic.js"), "// mock");
    const g8Entries = after.filter((e) => G8_IDS.includes(e.id));
    const driftResult = queryDrift(g8Entries, { root, run_grounding: false });
    assert.strictEqual(driftResult.drift_count, 0, "G8 resolved entries should not be drift candidates");
    assert.deepStrictEqual(driftResult.drift_events, []);
  });

  // Test 2: change-log/finding symmetry — the citation log carries the
  // forward (finding → change-log) edge; the change-log's `consolidates`
  // is inert-historical on disk.
  test("each G8 finding has a citation row whose target = change-log", async () => {
    const root = makeTempDir("meta-state-g8-symmetry-");
    await seedG8Findings(root);

    const changeLogId = "meta-260606T0000Z-g8-subcommand-class-false-positive-supersede";
    await applyG8Supersede(root, changeLogId);

    const after = readRegistry(root);
    const changeLog = after.find((e) => e.id === changeLogId);
    assert.ok(changeLog, "Change-log entry should exist");
    const consolidatesIds = changeLog.consolidates;

    const citationRows = after.filter((e) => e.entry_kind === "citation");
    for (const id of G8_IDS) {
      // On-record: inert-historical `consolidates` still lists this id.
      assert.ok(
        consolidatesIds.includes(id),
        `consolidates field should still list ${id} (inert-historical; got: ${consolidatesIds.join(",")})`,
      );
      // Live edge: a citation row sources from the finding.
      const cit = citationRows.find((c) => c.source === id);
      assert.ok(cit, `expected citation row sourced from ${id}`);
      assert.strictEqual(cit.target, changeLogId, `citation target should equal change-log id`);
    }
  });
});