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

  test("writes no nested evidence block (only top-level fields)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "report-top-level-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test report tool writes only top-level evidence fields.",
        evidence_code_ref: "test.js",
        evidence_journal: "journal.md",
        evidence_test: "test.js",
      });

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.evidence_code_ref, "test.js");
      assert.strictEqual(entry.evidence_journal, "journal.md");
      assert.strictEqual(entry.evidence_test, "test.js");
      assert.strictEqual(entry.evidence, undefined, "report tool must NOT write nested evidence block");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});
