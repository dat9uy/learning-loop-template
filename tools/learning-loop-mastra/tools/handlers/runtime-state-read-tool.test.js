import { describe, test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runtimeStateReadTool } from "./runtime-state-read-tool.js";
import { appendLedgerEvent } from "../../core/runtime-state.js";

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

      const result = await runtimeStateReadTool.handler({ affected_system: "vnstock", compact: false });
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

      const result = await runtimeStateReadTool.handler({ kind: "budget-state", compact: false });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.count, 1);
      assert.strictEqual(parsed.rows[0].id, "vnstock-budget-1");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("default call (no compact arg) returns compact rows: drops metadata, retains fingerprint + total field", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-read-compact-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      setupSidecar(tempDir, [
        {
          kind: "ledger-event",
          affected_system: "vnstock",
          id: "vnstock-c1",
          source_ref: "local:meta-state:rule-test",
          timestamp: "2026-05-08T10:17:23Z",
          status: "active",
          metadata: { note: "compact mode should drop this" },
          fingerprint: "sha256:abc",
        },
      ]);

      const result = await runtimeStateReadTool.handler({});
      const parsed = JSON.parse(result.content[0].text);
      // total + count both reported so callers can detect truncation
      assert.strictEqual(parsed.total, 1);
      assert.strictEqual(parsed.count, 1);
      const row = parsed.rows[0];
      assert.strictEqual(row.id, "vnstock-c1");
      assert.strictEqual(
        row.metadata,
        undefined,
        "compact mode must drop metadata"
      );
      assert.strictEqual(
        row.fingerprint,
        "sha256:abc",
        "compact mode must retain fingerprint (SHA-256 integrity hash)"
      );
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("default limit is 20 (truncation visible via total > count)", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-read-limit-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const rows = [];
      for (let i = 0; i < 25; i++) {
        rows.push({
          kind: "ledger-event",
          affected_system: "vnstock",
          id: `vnstock-L${i}`,
          source_ref: "local:meta-state:rule-test",
          timestamp: "2026-05-08T10:17:23Z",
          status: "active",
        });
      }
      setupSidecar(tempDir, rows);

      const result = await runtimeStateReadTool.handler({ affected_system: "vnstock" });
      const parsed = JSON.parse(result.content[0].text);
      // Total reflects the filtered count BEFORE the limit slice; count
      // reflects what was actually returned. Callers detect truncation
      // via total > count.
      assert.strictEqual(parsed.total, 25);
      assert.strictEqual(parsed.count, 20);
      assert.strictEqual(parsed.rows.length, 20);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("explicit compact: false returns full rows including metadata", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-read-full-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      setupSidecar(tempDir, [
        {
          kind: "ledger-event",
          affected_system: "vnstock",
          id: "vnstock-f1",
          source_ref: "local:meta-state:rule-test",
          timestamp: "2026-05-08T10:17:23Z",
          status: "active",
          metadata: { note: "verbose mode should keep this" },
        },
      ]);
      const result = await runtimeStateReadTool.handler({ compact: false });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.rows[0].metadata.note, "verbose mode should keep this");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("skips malformed lines instead of throwing (shared readRuntimeStateRows path)", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-read-malformed-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      // Write the sidecar directly so we can interleave a corrupt line.
      // 3 valid rows + 1 malformed + 1 blank — the shared read path must
      // skip the malformed line and the blank without throwing, returning
      // only the 3 valid rows in file order.
      const path = join(tempDir, "runtime-state.jsonl");
      const lines = [
        JSON.stringify({ kind: "ledger-event", affected_system: "vnstock", id: "vnstock-1", source_ref: "local:meta-state:rule-test", timestamp: "2026-05-08T10:17:23Z", status: "active" }),
        JSON.stringify({ kind: "ledger-event", affected_system: "vnstock", id: "vnstock-2", source_ref: "local:meta-state:rule-test", timestamp: "2026-05-08T17:11:12Z", status: "active" }),
        JSON.stringify({ kind: "ledger-event", affected_system: "vnstock", id: "vnstock-3", source_ref: "local:meta-state:rule-test", timestamp: "2026-05-09T09:00:00Z", status: "active" }),
        "this is not json {{corrupt",
        "",
      ];
      writeFileSync(path, lines.join("\n") + "\n", "utf8");

      const result = await runtimeStateReadTool.handler({ affected_system: "vnstock", compact: false });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.total, 3, "total must reflect only valid rows");
      assert.strictEqual(parsed.count, 3, "count must reflect only valid rows");
      assert.deepStrictEqual(
        parsed.rows.map((r) => r.id),
        ["vnstock-1", "vnstock-2", "vnstock-3"],
        "valid rows must be returned in file order"
      );
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
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

  test("fingerprint_valid: true for a freshly-written row (full mode)", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-read-fpvalid-fresh-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      await appendLedgerEvent(tempDir, {
        kind: "ledger-event",
        affected_system: "vnstock",
        id: "vnstock-fpvalid-1",
        source_ref: "local:meta-state:rule-test",
        value: null,
        delta: null,
        timestamp: "2026-05-08T10:17:23Z",
        status: "active",
        metadata: { note: "fresh row" },
      });

      const result = await runtimeStateReadTool.handler({ compact: false });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.rows.length, 1);
      assert.strictEqual(parsed.rows[0].fingerprint_valid, true);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("fingerprint_valid: true for a freshly-written row (compact mode)", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-read-fpvalid-compact-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      await appendLedgerEvent(tempDir, {
        kind: "ledger-event",
        affected_system: "vnstock",
        id: "vnstock-fpvalid-2",
        source_ref: "local:meta-state:rule-test",
        value: null,
        delta: null,
        timestamp: "2026-05-08T10:17:23Z",
        status: "active",
        metadata: { secret: "must be dropped but verify still true" },
      });

      const result = await runtimeStateReadTool.handler({ compact: true });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.rows[0].fingerprint_valid, true);
      assert.strictEqual(parsed.rows[0].metadata, undefined, "compact mode still drops metadata");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("fingerprint_valid: false for a tampered row", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "runtime-read-fpvalid-tamper-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      await appendLedgerEvent(tempDir, {
        kind: "ledger-event",
        affected_system: "vnstock",
        id: "vnstock-fpvalid-3",
        source_ref: "local:meta-state:rule-test",
        value: null,
        delta: null,
        timestamp: "2026-05-08T10:17:23Z",
        status: "active",
        metadata: { x: 1 },
      });

      // Tamper the row on disk by rewriting the sidecar with the metadata mutated.
      const path = join(tempDir, "runtime-state.jsonl");
      const original = JSON.parse(readFileSync(path, "utf8").trim());
      const tampered = { ...original, metadata: { x: 999 } };
      writeFileSync(path, JSON.stringify(tampered) + "\n", "utf8");

      const result = await runtimeStateReadTool.handler({ compact: false });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.rows[0].fingerprint_valid, false);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
