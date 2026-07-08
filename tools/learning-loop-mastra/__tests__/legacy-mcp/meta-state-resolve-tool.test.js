import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateResolveTool } from "../../tools/legacy/meta-state-resolve-tool.js";
import { metaStateLogChangeTool } from "../../tools/legacy/meta-state-log-change-tool.js";

describe("meta_state_resolve change-log immutability", () => {
  test("resolve refuses to change a change-log entry (immutable audit log)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "resolve-change-log-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      // First, write a change-log entry directly (mirror log_change tool's contract)
      const changeEntry = {
        id: "meta-260602T0000Z-test-change-log",
        entry_kind: "change-log",
        change_dimension: "surface",
        change_target: "test/path.js",
        change_diff: { added: ["x"], removed: [], changed: [] },
        reason: "Test entry to verify resolve rejects change-log entries.",
        status: "active",
        created_at: "2026-06-02T00:00:00.000Z",
        version: 0,
      };
      writeFileSync(
        join(tempDir, "meta-state.jsonl"),
        JSON.stringify(changeEntry) + "\n",
        "utf8"
      );

      // Attempt to resolve the change-log entry
      const result = await metaStateResolveTool.handler({
        id: "meta-260602T0000Z-test-change-log",
        resolution: "should fail",
        resolved_by: "operator",
      });
      const parsed = JSON.parse(result.content[0].text);

      assert.strictEqual(parsed.resolved, false);
      assert.strictEqual(parsed.reason, "change_log_immutable");
      assert.strictEqual(parsed.id, "meta-260602T0000Z-test-change-log");

      // Confirm the entry was NOT modified
      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.status, "active");
      assert.strictEqual(entry.resolved_at, undefined);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          process.env.GATE_ROOT = originalEnv;
        }
      }
    }
  });

  test("resolve still works on a finding entry (regression check)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "resolve-finding-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      // Write a finding entry
      const findingEntry = {
        id: "meta-260602T0000Z-test-finding",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test finding for resolve regression check.",
        status: "open",
        created_at: "2026-06-02T00:00:00.000Z",
      };
      writeFileSync(
        join(tempDir, "meta-state.jsonl"),
        JSON.stringify(findingEntry) + "\n",
        "utf8"
      );

      const result = await metaStateResolveTool.handler({
        id: "meta-260602T0000Z-test-finding",
        resolved_by: "operator",
      });
      const parsed = JSON.parse(result.content[0].text);

      assert.strictEqual(parsed.resolved, true);
      assert.strictEqual(parsed.status, "resolved");
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          process.env.GATE_ROOT = originalEnv;
        }
      }
    }
  });

  // Sanity: log_change tool still produces a resolveable finding-style structure
  // (i.e. change-log entries cannot be "found" by resolve's existing happy path)
  test("resolve refuses to resolve a rule entry", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "resolve-rule-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const ruleEntry = {
        id: "rule-test-resolve-rejected",
        entry_kind: "rule",
        origin: "meta-260602T0000Z-test-rule",
        enforcement: "gate",
        pattern_type: "glob",
        pattern: "test/**",
        description: "Test rule that must not be resolved via meta_state_resolve.",
        status: "active",
        created_at: "2026-06-02T00:00:00.000Z",
      };
      writeFileSync(
        join(tempDir, "meta-state.jsonl"),
        JSON.stringify(ruleEntry) + "\n",
        "utf8"
      );

      const result = await metaStateResolveTool.handler({
        id: "rule-test-resolve-rejected",
        resolution: "should fail",
        resolved_by: "operator",
      });
      const parsed = JSON.parse(result.content[0].text);

      assert.strictEqual(parsed.resolved, false);
      assert.strictEqual(parsed.reason, "not_a_finding");
      assert.strictEqual(parsed.entry_kind, "rule");

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const entry = JSON.parse(raw.trim().split("\n")[0]);
      assert.strictEqual(entry.status, "active");
      assert.strictEqual(entry.resolved_at, undefined);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          process.env.GATE_ROOT = originalEnv;
        }
      }
    }
  });
});
