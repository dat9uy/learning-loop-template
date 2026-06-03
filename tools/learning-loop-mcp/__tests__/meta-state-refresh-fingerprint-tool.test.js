import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateRefreshFingerprintTool } from "../tools/meta-state-refresh-fingerprint-tool.js";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";

describe("meta_state_refresh_fingerprint tool", () => {
  const originalEnv = process.env.GATE_ROOT;

  // T1: updates code_fingerprint to current hash and returns status: "refreshed"
  test("updates code_fingerprint to current hash and returns status: 'refreshed'", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-refresh-tool-1-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");

      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Refresh fingerprint happy path test.",
        evidence_code_ref: "src.js",
        mechanism_check: true,
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      const result = await metaStateRefreshFingerprintTool.handler({ id });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.status, "refreshed");
      assert.strictEqual(parsed.id, id);
      assert.ok(parsed.code_fingerprint?.startsWith("sha256:"));
      assert.ok(parsed.refreshed_at);
      // Verify entry was updated
      const rawAfter = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entryAfter = JSON.parse(rawAfter.trim().split("\n")[0]);
      assert.strictEqual(entryAfter.code_fingerprint, parsed.code_fingerprint);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T2: returns error when mechanism_check is not true
  test("returns error when mechanism_check is not true (cannot refresh non-grounded entry)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-refresh-tool-2-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Refresh should fail when not grounded.",
        // No mechanism_check
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      const result = await metaStateRefreshFingerprintTool.handler({ id });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.error, "not_grounded");
      assert.strictEqual(parsed.id, id);
      assert.ok(parsed.reason);

      // Verify entry is NOT mutated
      const rawAfter = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entryAfter = JSON.parse(rawAfter.trim().split("\n")[0]);
      assert.strictEqual(entryAfter.code_fingerprint, undefined);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});
