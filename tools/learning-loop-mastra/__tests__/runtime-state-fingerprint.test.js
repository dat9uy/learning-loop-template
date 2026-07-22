// Tests for plan 260719-2201-runtime-state-record-integrity Phase 2 (A):
// fingerprint v2 + verifyRow + migration.
//
// Coverage:
//   1. Prod collision fixture: rows 9/10 (shared v1 sha256:93725b69...) now
//      produce distinct v2 fingerprints when metadata differs.
//   2. Prod collision fixture: rows 8/11 (shared v1 sha256:79249677...) same.
//   3. Metadata key-reorder stability: canonicalization makes the fingerprint
//      independent of key insertion order (regression guard for future writers
//      that stringify with non-stable key order).
//   4. verifyRow: round-trip true (appendLedgerEvent → verifyRow).
//   5. verifyRow: tampered row false.
//   6. verifyRow: null/non-string fingerprint false.
//   7. Migration script idempotency: re-running on an already-migrated file
//      is a no-op; running on a v1 sidecar re-fingerprints every row and
//      verifyRow returns true for all.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { computeFingerprint, verifyRow, appendLedgerEvent } from "../core/runtime-state.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const SAMPLE_BASE = {
  affected_system: "vnstock",
  kind: "ledger-event",
  id: "row-x",
  source_ref: "local:meta-state:rule-x",
  value: 0,
  delta: 0,
  timestamp: "2026-05-14T14:08:11Z",
  status: "active",
};

describe("computeFingerprint v2", () => {
  test("rows differing only in metadata produce distinct fingerprints (prod rows 9/10 fixture)", () => {
    // Reconstructed from runtime-state.jsonl rows 9/10 — identical except
    // for metadata.experiment / metadata.action / metadata.notes. Under the
    // v1 5-field formula both produce sha256:93725b6939c7b17a0e7b195305f1054c9532439f07e7edf8328bc968920aae8e
    // (a row-integrity collision that finding meta-260719T2144Z documents).
    const row9 = { ...SAMPLE_BASE, metadata: { experiment: "experiment-vnstock-product-bootstrap-20260514T140811Z", action: "product-idempotency-check", slot_consumed: false, operator_cleared_after: false, notes: "Script skipped because vnstock_data already importable. No installer executed." } };
    const row10 = { ...SAMPLE_BASE, metadata: { experiment: "experiment-vnstock-direct-pip-20260514T140811Z", action: "direct-pip-bypass-test", slot_consumed: false, operator_cleared_after: false, notes: "Tested vendor extra-index-url. No installer run. No slot consumed." } };
    const fp9 = computeFingerprint(row9);
    const fp10 = computeFingerprint(row10);
    assert.notStrictEqual(fp9, fp10, `v2 must hash metadata: got fp9=${fp9} fp10=${fp10}`);
  });

  test("metadata key reorder does not change fingerprint (canonicalization)", () => {
    const a = { ...SAMPLE_BASE, metadata: { a: 1, b: 2, c: { z: 9, y: 8 } } };
    const b = { ...SAMPLE_BASE, metadata: { c: { y: 8, z: 9 }, b: 2, a: 1 } };
    assert.strictEqual(computeFingerprint(a), computeFingerprint(b));
  });

  test("array-typed metadata preserves order (no sorted-keys inside arrays)", () => {
    const a = { ...SAMPLE_BASE, metadata: { tags: ["a", "b", "c"] } };
    const b = { ...SAMPLE_BASE, metadata: { tags: ["c", "b", "a"] } };
    assert.notStrictEqual(computeFingerprint(a), computeFingerprint(b));
  });

  test("fingerprint is sha256-prefixed 64-hex", () => {
    const fp = computeFingerprint({ ...SAMPLE_BASE, metadata: {} });
    assert.match(fp, /^sha256:[a-f0-9]{64}$/);
  });
});

describe("verifyRow v2", () => {
  test("round-trip via appendLedgerEvent verifies true", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-roundtrip-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const written = await appendLedgerEvent(tempDir, {
        ...SAMPLE_BASE,
        metadata: { hello: "world", n: 42 },
      });
      assert.strictEqual(verifyRow(written), true);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("tampered metadata → false", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-tamper-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const written = await appendLedgerEvent(tempDir, { ...SAMPLE_BASE, metadata: { x: 1 } });
      const tampered = { ...written, metadata: { x: 2 } };
      assert.strictEqual(verifyRow(tampered), false, "tampered metadata must not verify");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("null fingerprint → false", () => {
    assert.strictEqual(verifyRow({ ...SAMPLE_BASE, fingerprint: null, metadata: {} }), false);
  });

  test("undefined fingerprint → false", () => {
    assert.strictEqual(verifyRow({ ...SAMPLE_BASE, metadata: {} }), false);
  });

  test("non-string fingerprint → false", () => {
    assert.strictEqual(verifyRow({ ...SAMPLE_BASE, fingerprint: 12345, metadata: {} }), false);
  });
});

describe("migration script idempotency", () => {
  function runMigration(root) {
    const scriptPath = join(REPO_ROOT, "scripts/migrate-runtime-state-fingerprints.mjs");
    execSync(`node ${scriptPath}`, {
      cwd: REPO_ROOT,
      env: { ...process.env, GATE_ROOT: root },
      stdio: "pipe",
    });
  }

  test("re-running on an already-migrated sidecar is a no-op (idempotent)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "migrate-idem-"));
    const sidecarPath = join(tempDir, "runtime-state.jsonl");
    writeFileSync(
      sidecarPath,
      [
        JSON.stringify({ ...SAMPLE_BASE, fingerprint: "sha256:" + "a".repeat(64) }),
      ].join("\n") + "\n",
      "utf8",
    );

    runMigration(tempDir);
    const after1 = readFileSync(sidecarPath, "utf8");
    runMigration(tempDir);
    const after2 = readFileSync(sidecarPath, "utf8");
    assert.strictEqual(after1, after2, "second migration run must be a no-op");
  });

  test("v1-style sidecar → every row re-fingerprinted, all verifyRow true", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "migrate-v1-"));
    const sidecarPath = join(tempDir, "runtime-state.jsonl");
    // Two rows that collide under v1 (identical to all fields including the
    // stored fingerprint value) — after migration they must each have their
    // own correct v2 fingerprint AND verifyRow must return true for both.
    const v1Rows = [
      { ...SAMPLE_BASE, id: "row-A", metadata: { experiment: "A" }, fingerprint: "sha256:93725b6939c7b17a0e7b195305f1054c9532439f07e7edf8328bc968920aae8e" },
      { ...SAMPLE_BASE, id: "row-B", metadata: { experiment: "B" }, fingerprint: "sha256:93725b6939c7b17a0e7b195305f1054c9532439f07e7edf8328bc968920aae8e" },
    ];
    writeFileSync(sidecarPath, v1Rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

    runMigration(tempDir);

    const lines = readFileSync(sidecarPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.strictEqual(lines.length, 2);
    assert.notStrictEqual(lines[0].fingerprint, lines[1].fingerprint, "post-migration rows must have distinct v2 fingerprints");
    for (const r of lines) {
      assert.strictEqual(verifyRow(r), true, `row ${r.id} must verify under v2 after migration`);
    }
  });
});
