import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ledger conversion (Phase 2)", () => {
  let tempDir;

  function setupYaml(root) {
    const obsDir = join(root, "records/observations");
    mkdirSync(obsDir, { recursive: true });
    // Write a minimal test yaml with 3 ledger entries
    const yamlContent = `id: observation-vnstock-device-slot-ledger
schema_version: "1.0"
type: observation
status: inactive
created_at: 2026-05-15T00:30:00Z
updated_at: 2026-06-06T12:55:49.384Z
source_refs: []
capability: vnstock-data
ledger:
  - timestamp: 2026-05-08T10:17:23Z
    experiment: experiment-vnstock-install-20260508T101723Z
    fingerprint: unknown
    action: first-install-discovery
    slot_consumed: unknown
    operator_cleared_after: true
    notes: First experiment.
  - timestamp: 2026-05-08T17:11:12Z
    experiment: experiment-vnstock-install-20260508T171112Z
    fingerprint: unknown
    action: env-var-auth-test
    slot_consumed: true
    operator_cleared_after: true
    notes: First device-limit hit.
  - timestamp: 2026-05-09T07:18:00Z
    experiment: experiment-vnstock-install-20260509T071800Z-sandbox-1
    fingerprint: unknown
    action: first-successful-full-install
    slot_consumed: true
    operator_cleared_after: true
    notes: First complete install.
`;
    writeFileSync(join(obsDir, "observation-vnstock-device-slot-ledger.yaml"), yamlContent, "utf8");
  }

  test("conversion script produces 3 sidecar rows", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-conversion-"));
    setupYaml(tempDir);

    // Import and run the conversion script
    const { convertLedgerToSidecar } = await import("../../../scripts/convert-ledger-to-sidecar.mjs");
    const result = await convertLedgerToSidecar({ root: tempDir, sourceRef: "local:meta-state:rule-test", expectedCount: 3 });

    assert.strictEqual(result.count, 3, "must convert 3 ledger entries");
    assert.strictEqual(result.deltaSum, 0, "delta sum must be 0 (all cleared)");

    // Verify sidecar file exists
    const sidecarPath = join(tempDir, "runtime-state.jsonl");
    assert.ok(existsSync(sidecarPath), "runtime-state.jsonl must exist");

    // Verify sidecar content
    const lines = readFileSync(sidecarPath, "utf8").trim().split("\n").filter(l => l.trim());
    assert.strictEqual(lines.length, 3, "sidecar must have 3 rows");

    const rows = lines.map(l => JSON.parse(l));
    assert.strictEqual(rows[0].kind, "ledger-event");
    assert.strictEqual(rows[0].affected_system, "vnstock");
    assert.strictEqual(rows[0].id, "vnstock-device-slot-2026-05-08T10:17:23Z");
    assert.strictEqual(rows[0].value, 0); // unknown -> 0
    assert.strictEqual(rows[0].delta, 0); // unknown or cleared -> 0
    assert.strictEqual(rows[0].status, "active");

    assert.strictEqual(rows[1].value, 1); // true -> 1
    assert.strictEqual(rows[1].delta, 0); // cleared -> 0

    assert.strictEqual(rows[2].value, 1); // true -> 1
    assert.strictEqual(rows[2].delta, 0); // cleared -> 0
  });

  test("conversion script is idempotent", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-conversion-"));
    setupYaml(tempDir);

    const { convertLedgerToSidecar } = await import("../../../scripts/convert-ledger-to-sidecar.mjs");
    const result1 = await convertLedgerToSidecar({ root: tempDir, sourceRef: "local:meta-state:rule-test", expectedCount: 3 });
    assert.strictEqual(result1.count, 3);

    // Second run should be a no-op
    const result2 = await convertLedgerToSidecar({ root: tempDir, sourceRef: "local:meta-state:rule-test" });
    assert.strictEqual(result2.count, 3);
    assert.strictEqual(result2.skipped, true, "second run must skip");
  });

  test("yaml is archived to records/_unbound/observation/", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "ledger-conversion-"));
    setupYaml(tempDir);

    const { convertLedgerToSidecar } = await import("../../../scripts/convert-ledger-to-sidecar.mjs");
    await convertLedgerToSidecar({ root: tempDir, sourceRef: "local:meta-state:rule-test", expectedCount: 3 });

    const originalPath = join(tempDir, "records/observations/observation-vnstock-device-slot-ledger.yaml");
    const archivePath = join(tempDir, "records/_unbound/observation/observation-vnstock-device-slot-ledger.yaml");

    assert.ok(!existsSync(originalPath), "original yaml must be moved");
    assert.ok(existsSync(archivePath), "archived yaml must exist");
  });
});
