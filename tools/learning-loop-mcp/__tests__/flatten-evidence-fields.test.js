import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  metaStateFindingEntrySchema,
  metaStateChangeEntrySchema,
  metaStateRuleEntrySchema,
  metaStateLoopDesignSchema,
  readRegistry,
} from "#mcp/core/meta-state.js";

function runScript(root) {
  const cmd = `node tools/learning-loop-mcp/scripts/flatten-evidence-fields.mjs --root=${root}`;
  return execSync(cmd, { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, GATE_ROOT: root } });
}

let entryCounter = 0;
function createEntry(kind, base) {
  const now = new Date().toISOString();
  const suffix = ++entryCounter;
  if (kind === "finding") {
    return {
      id: `meta-260601T0000Z-test-finding-${suffix}`,
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A test finding with nested evidence for migration.",
      status: "reported",
      created_at: now,
      version: 1,
      ...base,
    };
  }
  if (kind === "change-log") {
    return {
      id: `meta-260601T0001Z-test-changelog-${suffix}`,
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "test",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "A test change-log with nested evidence for migration.",
      status: "active",
      created_at: now,
      version: 1,
      ...base,
    };
  }
  if (kind === "rule") {
    return {
      id: `rule-test-evidence-migration-${suffix}`,
      entry_kind: "rule",
      origin: "meta-260601T0000Z-test-finding",
      enforcement: "agent",
      pattern_type: "regex",
      pattern: "test",
      description: "A test rule with nested evidence for migration.",
      promoted_at: now,
      promoted_by: "test",
      version: 1,
      ...base,
    };
  }
  if (kind === "loop-design") {
    return {
      id: `loop-design-test-evidence-migration-${suffix}`,
      entry_kind: "loop-design",
      title: "Test design for evidence migration",
      proposed_design_for: ["test"],
      addresses: [],
      description: "A test loop-design with nested evidence for migration.",
      affected_system: "gate-logic",
      created_at: now,
      created_by: "test",
      version: 1,
      ...base,
    };
  }
  throw new Error(`Unknown kind: ${kind}`);
}

function writeRegistry(root, entries) {
  const path = join(root, "meta-state.jsonl");
  writeFileSync(path, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

function readRegistryRaw(root) {
  const path = join(root, "meta-state.jsonl");
  return readFileSync(path, "utf8");
}

function assertNoNestedEvidence(entries) {
  for (const e of entries) {
    assert.strictEqual(
      e.evidence?.code_ref,
      undefined,
      `Entry ${e.id} still has nested evidence.code_ref`
    );
    assert.strictEqual(
      e.evidence?.journal,
      undefined,
      `Entry ${e.id} still has nested evidence.journal`
    );
    assert.strictEqual(
      e.evidence?.test,
      undefined,
      `Entry ${e.id} still has nested evidence.test`
    );
  }
}

describe("flatten-evidence-fields", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flatten-evidence-"));
    process.env.GATE_ROOT = tempDir;
  });

  // ── T-A: roundtrip ──────────────────────────────────────────────────────
  test("T-A: 4 dual-form entries are flattened and validate", () => {
    const entries = [
      createEntry("finding", {
        evidence: { code_ref: "a.js", journal: "a.md" },
      }),
      createEntry("change-log", {
        evidence: { code_ref: "b.js", journal: "b.md", test: "b.test.js" },
      }),
      createEntry("rule", {
        evidence: { code_ref: "c.js", test: "c.test.js" },
      }),
      createEntry("loop-design", {
        evidence: { code_ref: "d.js", journal: "d.md" },
      }),
    ];
    writeRegistry(tempDir, entries);

    const out = runScript(tempDir);
    assert.ok(out.includes("Flattened: 4"), `Expected 4 flattened, got:\n${out}`);

    const migrated = readRegistry(tempDir);
    assert.strictEqual(migrated.length, 4);

    assertNoNestedEvidence(migrated);

    for (const e of migrated) {
      const kind = e.entry_kind || "finding";
      const schema = {
        finding: metaStateFindingEntrySchema,
        "change-log": metaStateChangeEntrySchema,
        rule: metaStateRuleEntrySchema,
        "loop-design": metaStateLoopDesignSchema,
      }[kind];
      const result = schema.safeParse(e);
      assert.ok(result.success, `Entry ${e.id} failed ${kind} schema: ${result.error?.issues.map(i => i.path.join(".") + ": " + i.message).join(", ")}`);
    }

    // Verify top-level fields are present
    assert.strictEqual(migrated[0].evidence_code_ref, "a.js");
    assert.strictEqual(migrated[0].evidence_journal, "a.md");
    assert.strictEqual(migrated[1].evidence_code_ref, "b.js");
    assert.strictEqual(migrated[1].evidence_journal, "b.md");
    assert.strictEqual(migrated[1].evidence_test, "b.test.js");
    assert.strictEqual(migrated[2].evidence_code_ref, "c.js");
    assert.strictEqual(migrated[2].evidence_test, "c.test.js");
    assert.strictEqual(migrated[3].evidence_code_ref, "d.js");
    assert.strictEqual(migrated[3].evidence_journal, "d.md");
  });

  // ── T-B: idempotency ──────────────────────────────────────────────────────
  test("T-B: second run produces 0 changes and byte-identical registry", () => {
    const entries = [
      createEntry("finding", {
        evidence: { code_ref: "a.js", journal: "a.md" },
      }),
      createEntry("change-log", {
        evidence: { code_ref: "b.js", journal: "b.md" },
      }),
    ];
    writeRegistry(tempDir, entries);

    runScript(tempDir);
    const afterFirst = readRegistryRaw(tempDir);

    const out2 = runScript(tempDir);
    assert.ok(out2.includes("Flattened: 0"), `Expected 0 flattened on second run, got:\n${out2}`);

    const afterSecond = readRegistryRaw(tempDir);
    assert.strictEqual(
      afterSecond,
      afterFirst,
      "Registry must be byte-identical after idempotent second run"
    );
  });

  // ── T-C: partial-state recovery ───────────────────────────────────────────
  test("T-C: only un-migrated entry is rewritten; migrated entry untouched", () => {
    const alreadyMigrated = createEntry("finding", {
      evidence_code_ref: "already.js",
      evidence: undefined,
      version: 3,
    });
    const notMigrated = createEntry("finding", {
      evidence: { code_ref: "needs.js", journal: "needs.md" },
      version: 5,
    });
    writeRegistry(tempDir, [alreadyMigrated, notMigrated]);

    const out = runScript(tempDir);
    assert.ok(out.includes("Flattened: 1"), `Expected 1 flattened, got:\n${out}`);
    assert.ok(out.includes("Skipped: 1"), `Expected 1 skipped, got:\n${out}`);

    const migrated = readRegistry(tempDir);
    const already = migrated.find((e) => e.id === alreadyMigrated.id);
    const needs = migrated.find((e) => e.id === notMigrated.id);

    assert.strictEqual(already.version, 3, "Already-migrated entry must be untouched (CAS match)");
    assert.strictEqual(needs.version, 6, "Un-migrated entry must be updated (version bumped)");
    assert.strictEqual(needs.evidence_code_ref, "needs.js");
    assert.strictEqual(needs.evidence_journal, "needs.md");
    assert.strictEqual(needs.evidence, undefined);
  });

  // Cleanup: restore env
  after(() => {
    process.env.GATE_ROOT = originalEnv;
  });
});
