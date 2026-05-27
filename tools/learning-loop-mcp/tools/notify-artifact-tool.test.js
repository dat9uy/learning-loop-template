import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workflowNotifyArtifactTool } from "./notify-artifact-tool.js";

const { handler } = workflowNotifyArtifactTool;

describe("workflow_notify_artifact", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  function setupTemp() {
    tempDir = mkdtempSync(join(tmpdir(), "notify-artifact-test-"));
    process.env.GATE_ROOT = tempDir;
    mkdirSync(join(tempDir, ".claude", "coordination"), { recursive: true });
  }

  function cleanup() {
    process.env.GATE_ROOT = originalEnv;
  }

  test("returns recommendations without spawning for evidence changes", async () => {
    setupTemp();
    const result = await handler({ path: "records/product/evidence/foo.md", change_type: "updated" });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.logged, true);
    assert.ok(Array.isArray(parsed.matched_workflows));
    assert.deepStrictEqual(parsed.matched_workflows, ["evidence-changed"]);
    assert.ok(Array.isArray(parsed.recommended_next_tools));
    assert.ok(parsed.recommended_next_tools.includes("index_extract"));
    assert.ok(parsed.recommended_next_tools.includes("index_validate"));
    assert.ok(parsed.reasoning);
    assert.ok(parsed.reasoning.includes("evidence-changed"));
    cleanup();
  });

  test("returns empty for unmatched paths", async () => {
    setupTemp();
    const result = await handler({ path: "docs/journals/foo.md", change_type: "updated" });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.logged, true);
    assert.deepStrictEqual(parsed.matched_workflows, []);
    assert.deepStrictEqual(parsed.recommended_next_tools, []);
    assert.ok(parsed.reasoning.includes("No matching"));
    cleanup();
  });

  test("returns recommendations for observation changes", async () => {
    setupTemp();
    const result = await handler({ path: "records/observations/obs-001.yaml", change_type: "created" });
    const parsed = JSON.parse(result.content[0].text);

    assert.deepStrictEqual(parsed.matched_workflows, ["observation-changed"]);
    assert.deepStrictEqual(parsed.recommended_next_tools, ["index_validate"]);
    cleanup();
  });

  test("returns recommendations for capability changes", async () => {
    setupTemp();
    const result = await handler({ path: "records/meta/capabilities/api.yaml", change_type: "updated" });
    const parsed = JSON.parse(result.content[0].text);

    assert.deepStrictEqual(parsed.matched_workflows, ["capability-changed"]);
    assert.ok(parsed.recommended_next_tools.includes("index_validate"));
    assert.ok(parsed.recommended_next_tools.includes("capability_generate"));
    cleanup();
  });

  test("returns recommendations for index changes", async () => {
    setupTemp();
    const result = await handler({ path: "records/product/index/decisions.yaml", change_type: "created" });
    const parsed = JSON.parse(result.content[0].text);

    assert.deepStrictEqual(parsed.matched_workflows, ["index-changed"]);
    assert.deepStrictEqual(parsed.recommended_next_tools, ["index_validate"]);
    cleanup();
  });

  test("stale escalation preserved when matching observations exist", async () => {
    setupTemp();
    // Create a stale observation
    const obsDir = join(tempDir, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(obsDir, "obs-test.yaml"),
      `id: obs-test\nschema_version: "1.0"\ntype: observation\nstatus: active\n` +
      `constraint_type: write-path\nconstraint: records-evidence\n` +
      `created_at: "2026-01-01T00:00:00Z"\nupdated_at: "2026-01-01T00:00:00Z"\n` +
      `source_refs: []\nwrite_path: records/product/evidence/\n`
    );
    // Create a newer operator message marker so the obs appears stale
    writeFileSync(
      join(tempDir, ".claude", "coordination", ".last-operator-message"),
      JSON.stringify({ timestamp: "2026-05-27T12:00:00Z", prompt_snippet: "test" })
    );

    const result = await handler({ path: "records/product/evidence/foo.md", change_type: "updated" });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.stale_escalation, true);
    cleanup();
  });
});
