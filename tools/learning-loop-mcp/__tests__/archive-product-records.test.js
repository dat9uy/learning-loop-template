import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { archiveProductRecords } from "../../../scripts/archive-product-records.mjs";

describe("archive product records (Phase 5)", () => {
  let tempDir;

  function setupRecords(root) {
    // Create sample records structure
    const files = [
      "records/vnstock/decisions/decision-vnstock-test.yaml",
      "records/vnstock/experiments/experiment-vnstock-test.yaml",
      "records/vnstock/risks/risk-vnstock-test.yaml",
      "records/vnstock/claims/claim-vnstock-test.yaml",
      "records/vnstock/evidence/evidence-vnstock-test.md",
      "records/vnstock/index/index-vnstock-test.yaml",
      "records/observations/observation-test.yaml",
      "records/fastapi/capabilities/capability-fastapi-test.yaml",
    ];

    for (const file of files) {
      const path = join(root, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `id: test\n`, "utf8");
    }
  }

  test("archives all records to _unbound", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "archive-test-"));
    setupRecords(tempDir);

    const result = await archiveProductRecords({ root: tempDir });
    assert.ok(result.archived >= 7, `must archive at least 7 files, got ${result.archived}`);

    // Verify specific files were moved
    assert.ok(existsSync(join(tempDir, "records/_unbound/observation/_/observation-test.yaml")), "observation dest must exist");
    assert.ok(existsSync(join(tempDir, "records/_unbound/decisions/vnstock/decision-vnstock-test.yaml")), "decision dest must exist");
  });

  test("idempotent on second run", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "archive-test-"));
    setupRecords(tempDir);

    const result1 = await archiveProductRecords({ root: tempDir });
    const result2 = await archiveProductRecords({ root: tempDir });

    assert.strictEqual(result2.archived, 0, "second run must archive 0 new files");
    assert.ok(result2.log.every((l) => l.action === "skip"), "all entries must be skipped");
  });

  test("writes _README.md", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "archive-test-"));
    setupRecords(tempDir);

    await archiveProductRecords({ root: tempDir });

    const readmePath = join(tempDir, "records/_unbound/_README.md");
    assert.ok(existsSync(readmePath), "_README.md must exist");
  });
});
