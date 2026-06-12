import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runtimeStateRecordTool } from "./runtime-state-record-tool.js";

describe("runtime_state_record tool", () => {
  let tempDir;

  function createPreflightMarker(root) {
    const markerDir = join(root, ".claude", "coordination");
    mkdirSync(markerDir, { recursive: true });
    writeFileSync(join(markerDir, ".loop-preflight-runtime-state"), "", "utf8");
  }

  test("records with preflight marker succeeds", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-record-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;

    try {
      createPreflightMarker(tempDir);

      const result = await runtimeStateRecordTool.handler({
        affected_system: "vnstock",
        kind: "ledger-event",
        id: "vnstock-test-1",
        value: 1,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: "2026-05-08T10:17:23Z",
      });

      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.id, "vnstock-test-1");
      assert.ok(parsed.fingerprint.startsWith("sha256:"));

      // Verify sidecar was written
      const sidecarPath = join(tempDir, "runtime-state.jsonl");
      assert.ok(existsSync(sidecarPath));
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("returns preflight_required without marker", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-record-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;

    try {
      const result = await runtimeStateRecordTool.handler({
        affected_system: "vnstock",
        kind: "ledger-event",
        id: "vnstock-test-2",
        value: 1,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: "2026-05-08T10:17:23Z",
      });

      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.error, "preflight_required");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("rejects invalid source_ref via schema", async () => {
    const invalidInput = {
      affected_system: "vnstock",
      kind: "ledger-event",
      id: "vnstock-test-3",
      value: 1,
      delta: 0,
      source_ref: "invalid-ref",
      timestamp: "2026-05-08T10:17:23Z",
    };

    const result = runtimeStateRecordTool.schema.source_ref.safeParse(invalidInput.source_ref);
    assert.strictEqual(result.success, false, "invalid source_ref should fail schema validation");
  });
});
