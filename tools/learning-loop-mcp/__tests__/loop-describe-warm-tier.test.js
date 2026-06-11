import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loopDescribeTool } from "../tools/loop-describe-tool.js";
import { buildDiscoverabilityHints } from "../core/loop-introspect.js";

describe("loop_describe warm tier discoverability_hints", () => {
  test("warm tier returns discoverability_hints with 11 strings", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.discoverability_hints));
    assert.strictEqual(parsed.discoverability_hints.length, 11);
    for (const hint of parsed.discoverability_hints) {
      assert.strictEqual(typeof hint, "string");
      assert.ok(hint.length > 0);
    }
  });

  test("each hint contains the documented substrings", async () => {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const parsed = JSON.parse(result.content[0].text);
    const [citation, autoDefault, sourceRef, grounding, noCode, statusLifecycle, reopensHint, ruleLifecycle, toolSelection, layerSplit, relationshipScript] = parsed.discoverability_hints;

    assert.ok(citation.includes("meta_state_report"));
    assert.ok(citation.includes("evidence_code_ref"));

    assert.ok(autoDefault.includes("evidence_code_ref"));
    assert.ok(autoDefault.includes("mechanism_check"));

    assert.ok(sourceRef.includes("local:meta-state:<id>"));

    assert.ok(grounding.includes("meta_state_derive_status"));
    assert.ok(grounding.includes("meta_state_refresh_fingerprint"));

    assert.ok(noCode.includes("meta_state_log_change"));
    assert.ok(noCode.includes("change_target"));

    assert.ok(statusLifecycle.includes("reported"));
    assert.ok(statusLifecycle.includes("active"));
    assert.ok(statusLifecycle.includes("resolved"));
    assert.ok(statusLifecycle.includes("expired"));
    assert.ok(statusLifecycle.includes("superseded"));

    assert.ok(reopensHint.includes("reopens"));
    assert.ok(reopensHint.includes("cascade-resolve"));

    assert.ok(ruleLifecycle.includes("meta_state_list"));
    assert.ok(ruleLifecycle.includes("loop_describe"));
    assert.ok(ruleLifecycle.includes("loop_designs"));

    assert.ok(toolSelection.includes("canonical MCP tool"));
    assert.ok(toolSelection.includes("4-question framework"));

    assert.ok(layerSplit.includes("priority-1 prompt"));
    assert.ok(layerSplit.includes("AGENTS.md"));

    assert.ok(relationshipScript.includes("relationship_validate"));
    assert.ok(relationshipScript.includes("meta_state_report"));
    assert.ok(relationshipScript.includes("migrate_expired_to_stale"));
    assert.ok(relationshipScript.includes("2-step"));
  });

  test("summary tier does NOT include discoverability_hints", async () => {
    const result = await loopDescribeTool.handler({ tier: "summary" });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.discoverability_hints, undefined);
  });

  test("cold tier includes discoverability_hints", async () => {
    const result = await loopDescribeTool.handler({ tier: "cold" });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.discoverability_hints));
    assert.strictEqual(parsed.discoverability_hints.length, 11);
  });

  test("buildDiscoverabilityHints is exported as a pure function", () => {
    const hints = buildDiscoverabilityHints();
    assert.strictEqual(hints.length, 11);
    assert.ok(Object.isFrozen(hints));
  });

  test("warm tier surfaces pending_expired_migration advisory when backlog > 7d", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "warm-advisory-test-"));
    process.env.GATE_ROOT = tempRoot;
    try {
      // Write an expired finding older than 7 days
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      writeFileSync(
        join(tempRoot, "meta-state.jsonl"),
        JSON.stringify({
          id: "meta-old-expired",
          entry_kind: "finding",
          status: "expired",
          category: "loop-anti-pattern",
          severity: "warning",
          affected_system: "mcp-tools",
          description: "Old expired finding for advisory test (min 20 chars)",
          created_at: oldDate,
          expires_at: oldDate,
          version: 0,
        }) + "\n",
        "utf8",
      );

      const result = await loopDescribeTool.handler({ tier: "warm" });
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(parsed.pending_expired_migration);
      assert.equal(parsed.pending_expired_migration.count, 1);
      assert.ok(parsed.pending_expired_migration.oldest_age_days >= 7);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
      delete process.env.GATE_ROOT;
    }
  });
});
