import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runtimeStateReadTool } from "./runtime-state-read-tool.js";

describe("runtime_state_read tool", () => {
  let tempDir;

  function setupSidecar(root, rows) {
    const path = join(root, "runtime-state.jsonl");
    const lines = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    writeFileSync(path, lines, "utf8");
  }

  test("returns 18 rows for affected_system=vnstock", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-read-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;

    try {
      setupSidecar(tempDir, [
        { kind: "ledger-event", affected_system: "vnstock", id: "vnstock-1", source_ref: "local:meta-state:rule-test", timestamp: "2026-05-08T10:17:23Z", status: "active" },
        { kind: "ledger-event", affected_system: "vnstock", id: "vnstock-2", source_ref: "local:meta-state:rule-test", timestamp: "2026-05-08T17:11:12Z", status: "active" },
      ]);

      const result = await runtimeStateReadTool.handler({ affected_system: "vnstock" });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.count, 2);
      assert.strictEqual(parsed.rows[0].id, "vnstock-1");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("filters by kind=budget-state", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-read-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;

    try {
      setupSidecar(tempDir, [
        { kind: "ledger-event", affected_system: "vnstock", id: "vnstock-1", source_ref: "local:meta-state:rule-test", timestamp: "2026-05-08T10:17:23Z", status: "active" },
        { kind: "budget-state", affected_system: "vnstock", id: "vnstock-budget-1", source_ref: "local:meta-state:rule-test", timestamp: "2026-05-08T10:17:23Z", status: "active" },
      ]);

      const result = await runtimeStateReadTool.handler({ kind: "budget-state" });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.count, 1);
      assert.strictEqual(parsed.rows[0].id, "vnstock-budget-1");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("returns empty for unknown affected_system", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-read-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;

    try {
      setupSidecar(tempDir, [
        { kind: "ledger-event", affected_system: "vnstock", id: "vnstock-1", source_ref: "local:meta-state:rule-test", timestamp: "2026-05-08T10:17:23Z", status: "active" },
      ]);

      const result = await runtimeStateReadTool.handler({ affected_system: "fastapi" });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.count, 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});
