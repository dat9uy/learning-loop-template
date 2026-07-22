// Tests for runtime-state versioned dedup:
//
//   - `appendLedgerEvent` assigns `version = maxExisting + 1` for the row id
//     under a registry lock (cross-process). First append → 0; subsequent
//     re-records increment.
//   - `readRuntimeStateRowsLatest` collapses to `max_by(version)` per id,
//     with newest-timestamp + last-in-file-order tie-break (legacy
//     unversioned rows default to 0 at read time).
//   - `runtime_state_read` (the public tool) uses the deduped source.
//   - Concurrent writers for the same id produce distinct `version`s — this
//     is the only coverage for the cross-process lock that wraps the
//     scan-then-append.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendLedgerEvent,
  readRuntimeStateRows,
  readRuntimeStateRowsLatest,
  verifyRow,
} from "../core/runtime-state.js";
import { runtimeStateReadTool } from "../tools/handlers/runtime-state-read-tool.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const BASE_ROW = {
  affected_system: "vnstock",
  kind: "ledger-event",
  id: "vnstock-dedup-1",
  source_ref: "local:meta-state:rule-dedup",
  value: 0,
  delta: 0,
  timestamp: "2026-05-08T10:00:00Z",
  status: "active",
  metadata: { note: "dedup test" },
};

function setupSidecar(root, rows) {
  const path = join(root, "runtime-state.jsonl");
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

function createPreflightMarker(root) {
  const markerDir = join(root, ".claude", "coordination");
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(join(markerDir, ".loop-preflight-runtime-state"), "", "utf8");
}

describe("appendLedgerEvent version assignment", () => {
  test("first append assigns version=0; re-records increment", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-append-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const r1 = await appendLedgerEvent(tempDir, { ...BASE_ROW, id: "dup", timestamp: "2026-05-08T10:00:00Z" });
      const r2 = await appendLedgerEvent(tempDir, { ...BASE_ROW, id: "dup", timestamp: "2026-05-08T11:00:00Z" });
      const r3 = await appendLedgerEvent(tempDir, { ...BASE_ROW, id: "dup", timestamp: "2026-05-08T12:00:00Z" });
      assert.strictEqual(r1.version, 0);
      assert.strictEqual(r2.version, 1);
      assert.strictEqual(r3.version, 2);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("distinct ids independently start at version=0", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-distinct-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const r1 = await appendLedgerEvent(tempDir, { ...BASE_ROW, id: "vnstock-A" });
      const r2 = await appendLedgerEvent(tempDir, { ...BASE_ROW, id: "vnstock-B" });
      assert.strictEqual(r1.version, 0);
      assert.strictEqual(r2.version, 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});

describe("readRuntimeStateRowsLatest", () => {
  test("collapses to max_by(version) per id", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-latest-"));
    try {
      setupSidecar(tempDir, [
        { ...BASE_ROW, id: "dup", version: 0, timestamp: "2026-05-08T10:00:00Z" },
        { ...BASE_ROW, id: "dup", version: 1, timestamp: "2026-05-08T11:00:00Z" },
        { ...BASE_ROW, id: "dup", version: 2, timestamp: "2026-05-08T12:00:00Z" },
      ]);
      const latest = readRuntimeStateRowsLatest(tempDir);
      assert.strictEqual(latest.length, 1);
      assert.strictEqual(latest[0].version, 2);
      assert.strictEqual(latest[0].timestamp, "2026-05-08T12:00:00Z");
    } finally {
      // mkdtempSync dirs are fine to leave; OS cleans up
    }
  });

  test("two distinct ids → two rows", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-latest-distinct-"));
    try {
      setupSidecar(tempDir, [
        { ...BASE_ROW, id: "a", version: 0, timestamp: "2026-05-08T10:00:00Z" },
        { ...BASE_ROW, id: "b", version: 1, timestamp: "2026-05-08T10:00:00Z" },
      ]);
      const latest = readRuntimeStateRowsLatest(tempDir);
      assert.strictEqual(latest.length, 2);
    } finally { /* OS cleanup */ }
  });

  test("unversioned legacy row + new append (v=1) → append wins", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-legacy-"));
    try {
      setupSidecar(tempDir, [
        // Legacy row written before versioning shipped — no `version` field.
        { ...BASE_ROW, id: "legacy", timestamp: "2026-05-01T08:00:00Z" },
      ]);
      setupSidecar(tempDir, [
        ...readFileSync(join(tempDir, "runtime-state.jsonl"), "utf8")
          .split("\n").filter(Boolean).map((l) => JSON.parse(l)),
        { ...BASE_ROW, id: "legacy", version: 1, timestamp: "2026-05-08T10:00:00Z" },
      ]);
      const latest = readRuntimeStateRowsLatest(tempDir);
      assert.strictEqual(latest.length, 1);
      assert.strictEqual(latest[0].version, 1);
      assert.strictEqual(latest[0].timestamp, "2026-05-08T10:00:00Z");
    } finally { /* OS cleanup */ }
  });

  test("tie-break: missing/non-monotonic timestamp loses to real newer timestamp", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-tie-missing-"));
    try {
      setupSidecar(tempDir, [
        // Legacy unversioned row, no timestamp — sorts oldest as "".
        { ...BASE_ROW, id: "t", timestamp: undefined, value: 1 },
        { ...BASE_ROW, id: "t", version: 1, timestamp: "2026-05-08T10:00:00Z", value: 2 },
      ]);
      const latest = readRuntimeStateRowsLatest(tempDir);
      assert.strictEqual(latest.length, 1);
      assert.strictEqual(latest[0].version, 1);
      assert.strictEqual(latest[0].value, 2);
    } finally { /* OS cleanup */ }
  });

  test("tie-break: same version + same/equal timestamps → last-in-file wins", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-tie-fileorder-"));
    try {
      setupSidecar(tempDir, [
        // Two unversioned rows, identical empty timestamps → last-in-file wins.
        { ...BASE_ROW, id: "t", timestamp: undefined, value: 1 },
        { ...BASE_ROW, id: "t", timestamp: undefined, value: 2 },
      ]);
      const latest = readRuntimeStateRowsLatest(tempDir);
      assert.strictEqual(latest.length, 1);
      assert.strictEqual(latest[0].value, 2);
    } finally { /* OS cleanup */ }
  });

  test("verifyRow still true on the latest row (v2 fingerprint unchanged)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-fp-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const r1 = await appendLedgerEvent(tempDir, { ...BASE_ROW, id: "fp", timestamp: "2026-05-08T10:00:00Z" });
      const r2 = await appendLedgerEvent(tempDir, { ...BASE_ROW, id: "fp", timestamp: "2026-05-08T11:00:00Z" });
      const latest = readRuntimeStateRowsLatest(tempDir);
      assert.strictEqual(latest.length, 1);
      // Fingerprint formula is v2 and unchanged — re-record must still verify.
      assert.strictEqual(verifyRow(latest[0]), true, "latest row must verify under v2 fingerprint");
      // And the intermediate row also verifies.
      assert.strictEqual(verifyRow(r1), true);
      assert.strictEqual(verifyRow(r2), true);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});

describe("runtime_state_read tool integration", () => {
  test("re-recording same id N times → tool returns one row (latest), total=1", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-read-handler-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createPreflightMarker(tempDir);

      // Re-record same id three times via the public record tool.
      for (const ts of [
        "2026-05-08T10:00:00Z",
        "2026-05-08T11:00:00Z",
        "2026-05-08T12:00:00Z",
      ]) {
        const recRes = await (await import("../tools/handlers/runtime-state-record-tool.js"))
          .runtimeStateRecordTool.handler({
            affected_system: "vnstock",
            kind: "ledger-event",
            id: "vnstock-rec-read",
            value: 0,
            delta: 0,
            source_ref: "local:meta-state:rule-dedup",
            timestamp: ts,
          });
        assert.strictEqual(JSON.parse(recRes.content[0].text).ok, true, `record at ${ts} should succeed`);
      }

      // Read the same id via the public read tool.
      const readRes = await runtimeStateReadTool.handler({ affected_system: "vnstock", compact: false });
      const parsed = JSON.parse(readRes.content[0].text);
      assert.strictEqual(parsed.total, 1, "deduped total must equal 1");
      assert.strictEqual(parsed.count, 1);
      assert.strictEqual(parsed.rows.length, 1);
      assert.strictEqual(parsed.rows[0].id, "vnstock-rec-read");
      assert.strictEqual(parsed.rows[0].version, 2, "latest version must be 2 (third append)");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});

describe("concurrent-append race test (exercises withRegistryLock)", () => {
  test("Promise.all of two appendLedgerEvent for the same id → distinct versions, no collision", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-race-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      await Promise.all([
        appendLedgerEvent(tempDir, { ...BASE_ROW, id: "race", timestamp: "2026-05-08T10:00:00Z" }),
        appendLedgerEvent(tempDir, { ...BASE_ROW, id: "race", timestamp: "2026-05-08T11:00:00Z" }),
      ]);
      const rows = readRuntimeStateRows(tempDir);
      const raceRows = rows.filter((r) => r.id === "race");
      assert.strictEqual(raceRows.length, 2, "both writers should append exactly one row each");
      const versions = raceRows.map((r) => r.version).sort((a, b) => a - b);
      assert.deepStrictEqual(versions, [0, 1], "concurrent writers must produce DISTINCT versions — lock serializes scan-then-append");
      const latest = readRuntimeStateRowsLatest(tempDir);
      assert.strictEqual(latest.length, 1, "latest projection must collapse to a single row per id");
      assert.strictEqual(latest[0].timestamp, "2026-05-08T11:00:00Z");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("Promise.all of N=4 concurrent appends → versions are 0..3 with no duplicates", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-race-n-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const N = 4;
      await Promise.all(
        Array.from({ length: N }, (_, i) =>
          appendLedgerEvent(tempDir, { ...BASE_ROW, id: "race-n", timestamp: `2026-05-08T1${i}:00:00Z` })
        )
      );
      const rows = readRuntimeStateRows(tempDir).filter((r) => r.id === "race-n");
      assert.strictEqual(rows.length, N);
      const versions = rows.map((r) => r.version).sort((a, b) => a - b);
      assert.deepStrictEqual(versions, [0, 1, 2, 3], "all versions must be unique — no collision under N concurrent writers");
      const latest = readRuntimeStateRowsLatest(tempDir);
      assert.strictEqual(latest.length, 1);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  // Cross-process lock test. The in-process Promise.all variant above
  // serializes through the SAME Node process's proper-lockfile mutex;
  // this test actually forks two child processes so they race at the
  // filesystem layer (the production threat model: two CLI one-shots
  // hitting the same GATE_ROOT, OR CLI + a sibling runtime).
  test("two child processes appending the same id produce DISTINCT versions (cross-process lock)", { timeout: 30_000 }, async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dedup-race-xproc-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      // Write the runtime-tracking and runtime-state preflight markers
      // — runtime_state_record requires its per-surface preflight, which
      // includes the runtime-tracking surface (Phase 2 unified gate).
      mkdirSync(join(tempDir, ".claude", "coordination"), { recursive: true });
      writeFileSync(join(tempDir, ".claude", "coordination", ".loop-preflight-runtime-state"), "", "utf8");
      writeFileSync(join(tempDir, ".claude", "coordination", ".loop-preflight-runtime-tracking"), "", "utf8");

      const { spawn } = await import("node:child_process");
      const cliPath = join(PROJECT_ROOT, "tools/learning-loop-mastra/bin/loop.mjs");

      // Spawn N=2 child processes; all append the SAME id with
      // distinct timestamps. Cross-process lock guarantees each writer
      // sees the prior's row + assigns a distinct version.
      const childPromise = (id, timestamp) =>
        new Promise((resolve, reject) => {
          const args = JSON.stringify({
            affected_system: "vnstock",
            kind: "ledger-event",
            id,
            value: 0,
            delta: 0,
            source_ref: "local:meta-state:rule-test",
            timestamp,
          });
          const child = spawn("node", [cliPath, "runtime_state_record", args], {
            env: { ...process.env, GATE_ROOT: tempDir, LOOP_SURFACE: ".claude" },
            stdio: ["ignore", "pipe", "pipe"],
          });
          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (b) => { stdout += b.toString(); });
          child.stderr.on("data", (b) => { stderr += b.toString(); });
          child.on("error", reject);
          child.on("exit", (code) => resolve({ code, stdout, stderr }));
        });

      const id = "race-xproc";
      const N = 2;
      const results = await Promise.all(
        Array.from({ length: N }, (_, i) =>
          childPromise(id, `2026-05-08T1${i}:00:00Z`),
        ),
      );
      for (const r of results) {
        assert.strictEqual(r.code, 0,
          `child exited ${r.code} stderr=${r.stderr} stdout=${r.stdout}`);
      }

      const rows = readRuntimeStateRows(tempDir).filter((r) => r.id === id);
      assert.strictEqual(rows.length, N, `cross-process: all ${N} writes must land, got ${rows.length}`);
      const versions = rows.map((r) => r.version).sort((a, b) => a - b);
      assert.deepStrictEqual(versions, Array.from({ length: N }, (_, i) => i),
        `${N} cross-process writers must produce DISTINCT versions — filesystem lock serializes`);
      const latest = readRuntimeStateRowsLatest(tempDir);
      assert.strictEqual(latest.length, 1, "latest projection collapses all versions to one row");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});
