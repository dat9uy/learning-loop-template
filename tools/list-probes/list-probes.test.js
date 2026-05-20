import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listProbes } from "./list-probes.js";

describe("list-probes", () => {
  it("lists all .py files under product/<stack>/capabilities/", () => {
    const root = mkdtempSync(join(tmpdir(), "lp-test-"));
    mkdirSync(join(root, "product", "api", "capabilities", "vnstock-data"), { recursive: true });
    writeFileSync(join(root, "product", "api", "capabilities", "vnstock-data", "capability-01-reference.py"), "", "utf8");

    const result = listProbes(root, { stack: "api" });
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].path.includes("capability-01-reference.py"));
    assert.strictEqual(result[0].stack, "api");
    assert.strictEqual(result[0].domain, "vnstock-data");

    rmSync(root, { recursive: true });
  });

  it("returns empty array when no probes exist", () => {
    const root = mkdtempSync(join(tmpdir(), "lp-empty-"));
    mkdirSync(join(root, "product", "api", "capabilities"), { recursive: true });

    const result = listProbes(root, { stack: "api" });
    assert.deepStrictEqual(result, []);

    rmSync(root, { recursive: true });
  });

  it("ignores directories and non-.py files", () => {
    const root = mkdtempSync(join(tmpdir(), "lp-filter-"));
    mkdirSync(join(root, "product", "api", "capabilities", "vnstock-data"), { recursive: true });
    writeFileSync(join(root, "product", "api", "capabilities", "vnstock-data", "capability-01-reference.py"), "", "utf8");
    writeFileSync(join(root, "product", "api", "capabilities", "vnstock-data", "README.md"), "", "utf8");

    const result = listProbes(root, { stack: "api" });
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].path.endsWith(".py"));

    rmSync(root, { recursive: true });
  });
});
