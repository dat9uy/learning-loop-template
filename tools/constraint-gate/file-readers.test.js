import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readObservations, readBudgets } from "./file-readers.js";

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), "gate-test-"));
}

describe("readObservations", () => {
  it("returns parsed YAML observations", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(obsDir, "test-obs.yaml"),
      `id: test-obs\nconstraint_type: sudo\nstatus: active\nnotes: test`
    );
    const result = readObservations(tmp);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "test-obs");
    assert.equal(result[0].constraint_type, "sudo");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty array when directory missing (fail-open)", () => {
    const result = readObservations("/nonexistent/path");
    assert.deepEqual(result, []);
  });

  it("handles malformed YAML gracefully (fail-open)", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(join(obsDir, "bad.yaml"), "{{{{invalid yaml");
    const result = readObservations(tmp);
    assert.ok(Array.isArray(result));
    rmSync(tmp, { recursive: true, force: true });
  });

  it("handles YAML with duplicate keys without crashing", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(obsDir, "dup-keys.yaml"),
      `constraint: a\nconstraint: b\nid: dup-test`
    );
    const result = readObservations(tmp);
    assert.ok(Array.isArray(result));
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("readBudgets", () => {
  it("returns parsed budget YAML files", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(obsDir, "test-resource-budget.yaml"),
      `id: budget-test\nexternal_system: vnstock\nresource: device_slot\nbudget: 1\ncurrent: 1\nlast_verified: "2026-05-10"`
    );
    const result = readBudgets(tmp);
    assert.equal(result.length, 1);
    assert.equal(result[0].external_system, "vnstock");
    assert.equal(result[0].budget, 1);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty array when directory missing (fail-open)", () => {
    const result = readBudgets("/nonexistent/path");
    assert.deepEqual(result, []);
  });

  it("returns empty array when no budget files exist", () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(join(obsDir, "non-budget.yaml"), `id: test`);
    const result = readBudgets(tmp);
    assert.deepEqual(result, []);
    rmSync(tmp, { recursive: true, force: true });
  });
});
