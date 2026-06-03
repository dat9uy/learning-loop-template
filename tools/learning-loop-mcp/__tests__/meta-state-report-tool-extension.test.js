import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";

describe("metaStateReportTool mechanism_check extension", () => {
  const originalEnv = process.env.GATE_ROOT;

  // T33: metaStateReportTool stores mechanism_check on the entry when provided
  test("stores mechanism_check on the entry when provided (SP2 C-2 mitigation)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-report-ext-1-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test mechanism_check field extension.",
        mechanism_check: true,
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.mechanism_check, true);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("backward compat: omitting mechanism_check leaves it undefined on the entry", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp2-report-ext-2-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test mechanism_check omission backward compat.",
        // No mechanism_check field
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.mechanism_check, undefined);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});
