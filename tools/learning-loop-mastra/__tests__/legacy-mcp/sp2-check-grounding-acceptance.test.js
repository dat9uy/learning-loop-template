import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateCheckGroundingTool } from "../../tools/legacy/meta-state-check-grounding-tool.js";
import { metaStateRefreshFileIndexTool, _clearIdempotencyCacheForTests } from "../../tools/legacy/meta-state-refresh-file-index-tool.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";

describe("SP2 check_grounding acceptance", () => {
  const originalEnv = process.env.GATE_ROOT;

  // T-A1: Hash mismatch drift detection
  test("acceptance: meta_state_check_grounding detects hash mismatch after file mutation", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-acceptance-mismatch-"));
    process.env.GATE_ROOT = tempDir;
    try {
      // Setup: a temp file that we'll mutate
      const srcFile = join(tempDir, "src.js");
      writeFileSync(srcFile, "// original content\n", "utf8");

      // Create a finding with mechanism_check enabled
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Acceptance test for hash mismatch detection.",
        evidence_code_ref: "src.js",
        mechanism_check: true,
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      // First check: should record the fingerprint and return grounded
      const r1 = await metaStateCheckGroundingTool.handler({ id });
      const p1 = JSON.parse(r1.content[0].text);
      assert.strictEqual(p1.status, "grounded");
      assert.strictEqual(p1.fingerprint_was_recorded, true);
      assert.ok(p1.grounding.code_fingerprint?.startsWith("sha256:"));
      const originalHash = p1.grounding.code_fingerprint;

      // Mutate the file
      writeFileSync(srcFile, "// mutated content\n", "utf8");

      // Second check: should detect drift (hash_mismatch)
      const r2 = await metaStateCheckGroundingTool.handler({ id });
      const p2 = JSON.parse(r2.content[0].text);
      assert.strictEqual(p2.status, "drifted");
      assert.strictEqual(p2.drift_kind, "hash_mismatch");
      assert.strictEqual(p2.grounding.hash_match, false);
      assert.strictEqual(p2.grounding.code_fingerprint, originalHash);
      assert.notStrictEqual(p2.grounding.code_ref_hash, originalHash);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-A2: Refresh workflow round-trip — refresh_file_index re-grounds via the index
  test("acceptance: meta_state_refresh_file_index round-trips drifted state back to grounded", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-acceptance-roundtrip-"));
    process.env.GATE_ROOT = tempDir;
    _clearIdempotencyCacheForTests();
    try {
      const srcFile = join(tempDir, "src.js");
      writeFileSync(srcFile, "// original\n", "utf8");

      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Acceptance test for refresh round-trip.",
        evidence_code_ref: "src.js",
        mechanism_check: true,
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      // 1. Check (records initial fingerprint on the per-record field; index empty)
      const r1 = await metaStateCheckGroundingTool.handler({ id });
      assert.strictEqual(JSON.parse(r1.content[0].text).status, "grounded");

      // 2. Mutate
      writeFileSync(srcFile, "// mutated\n", "utf8");

      // 3. Check (drifted — per-record baseline no longer matches the live hash)
      const r2 = await metaStateCheckGroundingTool.handler({ id });
      const p2 = JSON.parse(r2.content[0].text);
      assert.strictEqual(p2.status, "drifted");
      assert.strictEqual(p2.drift_kind, "hash_mismatch");

      // 4. Refresh the path's hash into the shared fingerprint index
      const r3 = await metaStateRefreshFileIndexTool.handler({ path: "src.js" });
      const p3 = JSON.parse(r3.content[0].text);
      assert.strictEqual(p3.status, "refreshed");
      assert.ok(p3.code_fingerprint?.startsWith("sha256:"));
      assert.ok(p3.refreshed_at);

      // 5. Re-check (now grounded via the index — indexBaseline matches the live hash)
      const r4 = await metaStateCheckGroundingTool.handler({ id });
      const p4 = JSON.parse(r4.content[0].text);
      assert.strictEqual(p4.status, "grounded");
      assert.strictEqual(p4.drift_kind, null);
      assert.strictEqual(p4.grounding.hash_match, true);
    } finally {
      _clearIdempotencyCacheForTests();
      rmSync(tempDir, { recursive: true, force: true });
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});
