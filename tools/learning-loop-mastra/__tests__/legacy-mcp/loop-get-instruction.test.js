import { describe, test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loopGetInstructionTool } from "../../tools/handlers/loop-get-instruction-tool.js";
import { withMcpServer } from "../with-mcp-server.js";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

describe("loop_get_instruction", () => {
  test("returns hint by named slug 'reopens-script'", async () => {
    const result = await loopGetInstructionTool.handler({ key: "reopens-script" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 1);
    assert.strictEqual(parsed.results[0].key, "reopens-script");
    assert.strictEqual(parsed.results[0].index, 10);
    assert.ok(parsed.results[0].hint.includes("meta_state_relationship_validate"));
    assert.ok(parsed.results[0].suggestion.length > 0);
  });

  test("returns hint by numeric index", async () => {
    const result = await loopGetInstructionTool.handler({ key: 0 });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.results[0].index, 0);
    assert.ok(parsed.results[0].hint.includes("evidence_code_ref"));
  });

  test("accepts an array of keys and returns multiple results", async () => {
    const result = await loopGetInstructionTool.handler({
      key: ["internalization-rule", 10, "loop-get-instruction"],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 3);
    assert.ok(parsed.results.every((r) => r.hint && r.suggestion));
  });

  test("returns error entry for unknown slug", async () => {
    const result = await loopGetInstructionTool.handler({ key: "no-such-hint" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 1);
    assert.ok(parsed.results[0].error);
    assert.ok(parsed.results[0].error.includes("no-such-hint"));
  });

  test("returns hint by named slug 'narrow-query'", async () => {
    const result = await loopGetInstructionTool.handler({ key: "narrow-query" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 1);
    assert.strictEqual(parsed.results[0].key, "narrow-query");
    assert.strictEqual(parsed.results[0].index, 12);
    assert.ok(parsed.results[0].hint.includes("meta_state_list"));
    assert.ok(parsed.results[0].hint.includes("id:"));
    assert.ok(parsed.results[0].suggestion.length > 0);
  });

  test("schema advertises key as string | number | array", () => {
    const keySchema = loopGetInstructionTool.schema.key;
    assert.ok(keySchema, "schema.key should be defined");
  });
});

describe("loop_get_instruction (rule-skip stability)", () => {
  // Plan 260726-0029 phase 2: numeric keys are session-ephemeral (they
  // follow the current merged view, not a fixed registry position). The
  // regression guard for the original positional-misalignment defect is
  // now anchored to SLUG stability (the stable lookup contract): a
  // missing rule's slug returns an explicit `unavailable` instead of
  // wrong content, and other slugs continue to resolve correctly.
  //
  // Fixture: copy the live registry minus one rule
  // (rule-fallow-brief-on-gate-failure), plus a .mcp.json so
  // scope_predicate=project_has_learning_loop_mcp rules stay visible
  // under the temp root.
  let tempRoot;
  let prevGateRoot;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "lgi-rule-skip-"));
    const live = readFileSync(join(PROJECT_ROOT, "meta-state.jsonl"), "utf8");
    const kept = live
      .trim()
      .split("\n")
      .map(JSON.parse)
      .filter((e) => e.id !== "rule-fallow-brief-on-gate-failure");
    writeFileSync(
      join(tempRoot, "meta-state.jsonl"),
      kept.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    writeFileSync(
      join(tempRoot, ".mcp.json"),
      JSON.stringify({ mcpServers: { "learning-loop": { command: "node", args: [] } } }),
    );
    prevGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempRoot;
  });

  afterEach(() => {
    if (prevGateRoot === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = prevGateRoot;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test("slug lookup after the skipped position returns its own hint (no shift)", async () => {
    const result = await loopGetInstructionTool.handler({ key: "short-slug-for-risk-records" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(!parsed.results[0].error, `must resolve, not error: ${parsed.results[0].error}`);
    assert.ok(
      parsed.results[0].hint.includes("records/**/risks/"),
      "hint must be the short-slug rule prose, not the next entry's",
    );
    assert.ok(
      parsed.results[0].suggestion.includes("sanitizeSlug"),
      "suggestion must come from the same registry entry",
    );
  });

  test("slug whose rule is excluded from the registry returns unknown, not wrong content (no shifting)", async () => {
    // Plan 260726-0029 phase 2: the rule is excluded from the registry, so
    // the view doesn't include `fallow-gate-triage` — the lookup returns
    // "Unknown hint key" (no shift, no wrong content). The C2 wrong-content
    // regression is structurally impossible: the view reflects the current
    // rulesById, and an absent rule produces no entry to mis-resolve.
    const result = await loopGetInstructionTool.handler({ key: "fallow-gate-triage" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.results[0].error, "must error");
    assert.ok(parsed.results[0].error.includes("Unknown hint key"), "error must say unknown");
    assert.ok(!parsed.results[0].hint, "no hint payload on unknown");
  });

  test("numeric keys are session-ephemeral: a key that pointed at a now-missing rule returns unavailable, not wrong content", async () => {
    // The previous C2 test pinned numeric key 20 to fallow-gate-triage's
    // position. Phase 2 makes numeric keys ephemeral: this test asserts the
    // SEMANTIC guarantee (no wrong content on shift) without fixing a
    // specific position. We probe the discoverability range (0..15) and the
    // full process range (16..26) and assert: at most one unavailable per
    // missing rule, and every OTHER probe resolves without error.
    for (let key = 16; key <= 25; key++) {
      const result = await loopGetInstructionTool.handler({ key });
      const parsed = JSON.parse(result.content[0].text);
      const r = parsed.results[0];
      if (r.error) {
        assert.ok(r.error.includes("unavailable"), `key ${key} error must say unavailable, got: ${r.error}`);
        assert.ok(!r.hint, `key ${key} must not carry hint payload on unavailable`);
      } else {
        assert.ok(r.hint, `key ${key} must carry hint on success`);
        assert.ok(r.suggestion, `key ${key} must carry suggestion on success`);
      }
    }
  });
});

// Stdio transport regression test: top-level array input over MCP stdio
// must round-trip without being wrapped to {item: [...]} by the
// wire-format coercion helper. Pairs with the meta-260610T1458Z fix.
describe("loop_get_instruction (stdio transport)", () => {
  test("accepts top-level array key input over stdio", async () => {
    await withMcpServer(async ({ callTool }) => {
      const result = await callTool("mastra_loop_get_instruction", {
        key: ["reopens-script", "internalization-rule"],
      });

      assert.strictEqual(result.count, 2, "array of 2 keys should return count=2");
      assert.strictEqual(result.results.length, 2);
      const reopens = result.results.find((r) => r.index === 10);
      const internalization = result.results.find((r) => r.index === 0);
      assert.ok(reopens, "results should contain the reopens-script hint (index 10)");
      assert.ok(internalization, "results should contain the internalization-rule hint (index 0)");
      assert.ok(reopens.hint.includes("meta_state_relationship_validate"));
      assert.ok(internalization.hint.includes("evidence_code_ref"));
    });
  });
});
