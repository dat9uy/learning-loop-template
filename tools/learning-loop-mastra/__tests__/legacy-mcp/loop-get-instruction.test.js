import { describe, test, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loopGetInstructionTool } from "../../tools/handlers/loop-get-instruction-tool.js";
import { loadPromotedRules } from "../../core/gate-logic.js";
import { buildProcessView, listHints } from "../../core/hint-registry.js";
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
  // Regression guard for the positional-misalignment defect: when a
  // rule-derived entry's rule cannot supply text, resolution must never
  // return the NEXT entry's hint under the queried key. Numeric keys are
  // session-ephemeral (they follow the current merged view), so the guard
  // is anchored to correspondence: a numeric key must return the same hint
  // as the slug at that view position, and a text-less rule must surface an
  // explicit `unavailable` — never wrong content.
  //
  // Fixture: copy the live registry with rule-fallow-brief-on-gate-failure
  // kept but its `hint_text` stripped (a rule that exists but cannot supply
  // text — the state that makes `unavailable` reachable), plus a .mcp.json
  // so scope_predicate=project_has_learning_loop_mcp rules stay visible
  // under the temp root.
  const STRIPPED_RULE_ID = "rule-fallow-brief-on-gate-failure";
  let tempRoot;
  let prevGateRoot;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "lgi-rule-skip-"));
    const live = readFileSync(join(PROJECT_ROOT, "meta-state.jsonl"), "utf8");
    const kept = live
      .trim()
      .split("\n")
      .map(JSON.parse)
      .map((e) => {
        if (e.id !== STRIPPED_RULE_ID) return e;
        const { hint_text, ...rest } = e;
        return rest;
      });
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

  test("slug whose rule cannot supply text returns an explicit unavailable, not wrong content", async () => {
    // The stripped rule still appears in the view, but resolveHintText has
    // nothing to read — the lookup must error with `unavailable`, never
    // return a neighboring entry's hint under this slug.
    const result = await loopGetInstructionTool.handler({ key: "fallow-gate-triage" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.results[0].error, "must error");
    assert.ok(parsed.results[0].error.includes("unavailable"), "error must say unavailable");
    assert.ok(!parsed.results[0].hint, "no hint payload on unavailable");
  });

  test("numeric keys correspond to the view: each position returns its own entry's hint or unavailable", async () => {
    // Compute the expected view from the SAME resolution source the handler
    // uses, then assert per-position correspondence: numeric key k must
    // return the identical hint as the slug at view position (k - 16), the
    // stripped rule's position must say `unavailable`, and no two positions
    // may return the same hint text (the misalignment signature).
    const rulesById = new Map(loadPromotedRules(tempRoot).map((r) => [r.id, r]));
    const view = buildProcessView({ rulesById });
    assert.ok(
      view.some((e) => e.derived_from_rule === STRIPPED_RULE_ID),
      "fixture sanity: the stripped rule must still appear in the view",
    );

    const discoverabilityLen = listHints({ kind: "discoverability" }).length;
    const seenHints = new Set();
    let unavailableCount = 0;
    for (let i = 0; i < view.length; i++) {
      const key = discoverabilityLen + i;
      const entry = view[i];
      const numeric = JSON.parse((await loopGetInstructionTool.handler({ key })).content[0].text).results[0];

      if (entry.derived_from_rule === STRIPPED_RULE_ID) {
        unavailableCount++;
        assert.ok(numeric.error?.includes("unavailable"),
          `key ${key} (${entry.slug}) must say unavailable, got: ${numeric.error}`);
        assert.ok(!numeric.hint, `key ${key} must not carry hint payload on unavailable`);
        continue;
      }

      assert.ok(!numeric.error, `key ${key} (${entry.slug}) must resolve, got: ${numeric.error}`);
      const bySlug = JSON.parse((await loopGetInstructionTool.handler({ key: entry.slug })).content[0].text).results[0];
      assert.ok(!bySlug.error, `slug ${entry.slug} must resolve, got: ${bySlug.error}`);
      assert.strictEqual(numeric.hint, bySlug.hint,
        `numeric key ${key} must return the same hint as slug ${entry.slug} (no shift)`);
      assert.strictEqual(numeric.suggestion, bySlug.suggestion,
        `numeric key ${key} must return the same suggestion as slug ${entry.slug}`);
      // Uniqueness assumes no two live rules share identical hint_text —
      // true today; a legitimate duplication would false-fail here (drift signal).
      assert.ok(!seenHints.has(numeric.hint),
        `key ${key} (${entry.slug}) returned a hint already seen at another position (misalignment)`);
      seenHints.add(numeric.hint);
    }
    assert.strictEqual(unavailableCount, 1, "exactly one unavailable position (the stripped rule)");
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
