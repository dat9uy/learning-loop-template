import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateResolveTool } from "../tools/meta-state-resolve-tool.js";
import { metaStateLogChangeTool } from "../tools/meta-state-log-change-tool.js";

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
      process.env.GATE_ROOT = originalEnv;
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
        status: "reported",
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
      process.env.GATE_ROOT = originalEnv;
    }
  });

  // Sanity: log_change tool still produces a resolveable finding-style structure
  // (i.e. change-log entries cannot be "found" by resolve's existing happy path)
  test("change_log_immutable branch is hit when change-log entry exists alongside findings", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "mixed-registry-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateLogChangeTool.handler({
        change_dimension: "mechanical",
        change_target: "test/mixed.js",
        change_diff: { added: [], removed: [], changed: ["x"] },
        reason: "Mixed registry test: change-log entry should be immutable.",
      });

      // Now find the generated id from the registry
      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8");
      const id = JSON.parse(raw.trim().split("\n")[0]).id;

      const result = await metaStateResolveTool.handler({ id });
      const parsed = JSON.parse(result.content[0].text);

      assert.strictEqual(parsed.resolved, false);
      assert.strictEqual(parsed.reason, "change_log_immutable");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});
