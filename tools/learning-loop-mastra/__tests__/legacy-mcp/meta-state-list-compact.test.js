import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateListTool } from "../../tools/handlers/meta-state-list-tool.js";
import { loopDescribeTool } from "../../tools/handlers/loop-describe-tool.js";

function makeTempRoot() {
  const tmp = mkdtempSync(join(tmpdir(), "compact-test-"));
  return tmp;
}

function writeRegistry(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");
}

describe("meta_state_list compact mode", () => {
  let root;
  let originalGateRoot;

  before(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;

    // Seed with a small synthetic registry covering all entry kinds + statuses
    writeRegistry(root, [
      {
        id: "compact-finding-active",
        entry_kind: "finding",
        status: "open",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Active finding for compact test (min 20 chars)",
        created_at: new Date().toISOString(),
      },
      {
        id: "compact-finding-resolved",
        entry_kind: "finding",
        status: "resolved",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Resolved finding for compact test (min 20 chars)",
        created_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
        resolved_by: "test",
      },
      {
        id: "compact-rule-active",
        entry_kind: "rule",
        status: "active",
        origin: "compact-finding-active",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: ".*",
        description: "Active rule for compact test (min 20 chars)",
        promoted_at: new Date().toISOString(),
        promoted_by: "test",
      },
      {
        id: "compact-change-log",
        entry_kind: "change-log",
        status: "open",
        change_dimension: "surface",
        change_target: "tools/test.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Change log for compact test (min 20 chars)",
        created_at: new Date().toISOString(),
      },
      {
        id: "compact-loop-design",
        entry_kind: "loop-design",
        status: "open",
        title: "Design for compact test",
        description: "Loop design for compact test (min 20 chars)",
        affected_system: "mcp-tools",
        proposed_design_for: ["compact-rule-active"],
        addresses: ["compact-finding-active"],
        created_at: new Date().toISOString(),
        created_by: "test",
      },
    ]);
  });

  after(() => {
    if (originalGateRoot === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalGateRoot;
    }
    rmSync(root, { recursive: true, force: true });
  });

  test("compact: true returns structural contract (id, entry_kind, status, no description)", async () => {
    const result = await metaStateListTool.handler({
      compact: true,
    });
    const text = JSON.parse(result.content[0].text);
    assert.ok(text.count > 0, "Should have entries");
    assert.strictEqual(text.compact, true);

    // Structural assertion: every compact entry has the expected shape.
    // The size budget is now a property of the L2 cache, not a threshold.
    for (const entry of text.entries) {
      assert.ok(typeof entry.id === "string", `entry missing id: ${JSON.stringify(entry)}`);
      assert.ok(typeof entry.entry_kind === "string", `entry missing entry_kind: ${JSON.stringify(entry)}`);
      assert.ok(typeof entry.status === "string", `entry missing status: ${JSON.stringify(entry)}`);
      assert.strictEqual(
        entry.description,
        undefined,
        "compact entry must NOT have description"
      );
      assert.strictEqual(
        entry.description_preview,
        undefined,
        "compact entry must NOT have description_preview"
      );
      assert.strictEqual(
        entry.evidence,
        undefined,
        "compact entry must NOT have evidence"
      );
      if (entry.evidence_code_ref) {
        assert.ok(
          typeof entry.evidence_code_ref === "string",
          "compact entry evidence_code_ref must be a string when present"
        );
      }
    }

    // Soft size check: on this small synthetic registry, compact should be < 50KB
    const payloadBytes = Buffer.byteLength(JSON.stringify(text.entries), "utf8");
    assert.ok(
      payloadBytes < 50000,
      `Compact payload ${payloadBytes}B exceeds 50KB budget — L2 cache or archive trims may be broken`
    );
  });

  test("compact: true default excludes terminal entries", async () => {
    const result = await metaStateListTool.handler({
      compact: true,
    });
    const text = JSON.parse(result.content[0].text);

    // Plan 260611-1000: the legacy 'expired' status was removed. Terminal
    // statuses are now auto-resolved, resolved, and superseded.
    const terminalStatuses = new Set(["auto-resolved", "resolved", "superseded"]);
    const hasTerminal = text.entries.some((e) => terminalStatuses.has(e.status));
    assert.strictEqual(
      hasTerminal,
      false,
      "compact default should not include terminal entries"
    );
  });

  test("compact: false returns full entries with descriptions", async () => {
    const result = await metaStateListTool.handler({
      compact: false,
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.compact, false);

    const fullEntries = text.entries.filter((e) => e.description);
    assert.ok(
      fullEntries.length > 0,
      "Non-compact mode should include entries with descriptions"
    );
  });

  test("compact entry preserves ref fields", async () => {
    const result = await metaStateListTool.handler({
      compact: true,
    });
    const text = JSON.parse(result.content[0].text);

    // Find entries with ref fields
    const withRefs = text.entries.filter(
      (e) =>
        e.origin ||
        e.addresses ||
        e.consolidated_into ||
        e.supersedes ||
        e.promoted_to_rule ||
        e.proposed_design_for
    );
    assert.ok(
      withRefs.length > 0,
      "Some entries should have ref fields in compact mode"
    );
  });

  test("I1: toCompact and summarize return consistent shapes", async () => {
    // I1 regression guard: meta_state_list({ compact: true }) and
    // loop_describe({ tier: 'cold', description_mode: 'summary' }) must
    // return the same field set for the same entry id (modulo
    // description_preview, which only summarize emits). A drift between
    // the two would force every downstream consumer to special-case
    // which shape they're getting.
    const listResult = await metaStateListTool.handler({
      compact: true,
    });
    const describeResult = await loopDescribeTool.handler({
      tier: "cold",
      description_mode: "summary",
    });
    const listText = JSON.parse(listResult.content[0].text);
    const describeText = JSON.parse(describeResult.content[0].text);

    // Build maps by id
    const compactById = new Map(listText.entries.map((e) => [e.id, e]));
    const summaryById = new Map(describeText.all_findings.map((e) => [e.id, e]));

    // Find a finding that exists in both (active_findings is the cold tier's
    // active subset; all_findings includes terminal ones)
    let commonId = null;
    for (const id of compactById.keys()) {
      if (summaryById.has(id) && compactById.get(id).entry_kind === "finding") {
        commonId = id;
        break;
      }
    }
    assert.ok(commonId, "Need at least one finding that appears in both compact and summary");

    const compactEntry = compactById.get(commonId);
    const summaryEntry = summaryById.get(commonId);

    // The two shapes should agree on the same relationship + metadata
    // fields. `summarize` emits `description_preview`; `toCompact` does not.
    const compactKeys = new Set(Object.keys(compactEntry));
    const summaryKeys = new Set(Object.keys(summaryEntry));
    summaryKeys.delete("description_preview");

    // Every field in compactEntry (except description_preview which
    // toCompact never emits) should be in summaryEntry.
    for (const key of compactKeys) {
      assert.ok(
        summaryKeys.has(key),
        `I1 drift: field '${key}' is in toCompact(${commonId}) but not summarize(${commonId})`
      );
    }
    // Conversely, every field in summaryEntry (except description_preview)
    // should be in compactEntry.
    for (const key of summaryKeys) {
      assert.ok(
        compactKeys.has(key),
        `I1 drift: field '${key}' is in summarize(${commonId}) but not toCompact(${commonId})`
      );
    }
  });
});

describe("meta_state_list compact mode session_id", () => {
  let root;
  let originalGateRoot;

  before(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;

    writeRegistry(root, [
      {
        id: "compact-finding-with-session",
        entry_kind: "finding",
        status: "open",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Finding with session_id for compact test (min 20 chars)",
        created_at: new Date().toISOString(),
        session_id: "test-session-abc-123",
      },
    ]);
  });

  after(() => {
    if (originalGateRoot === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalGateRoot;
    }
    rmSync(root, { recursive: true, force: true });
  });

  test("compact output includes session_id when present on entry", async () => {
    const result = await metaStateListTool.handler({
      compact: true,
    });
    const text = JSON.parse(result.content[0].text);
    const entry = text.entries.find((e) => e.id === "compact-finding-with-session");
    assert.ok(entry, "entry should be in compact output");
    assert.strictEqual(
      entry.session_id,
      "test-session-abc-123",
      "compact output should include session_id"
    );
  });
});
