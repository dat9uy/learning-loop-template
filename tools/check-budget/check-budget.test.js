import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { writeFileSync, rmSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const observationsDir = join(root, "records", "observations");

function runCheckBudget(system, resource) {
  return execSync(
    `node ${join(root, "tools", "check-budget", "check-budget.js")} --system ${system} --resource ${resource}`,
    { encoding: "utf8", cwd: root }
  );
}

function runCheckBudgetWithCode(system, resource) {
  try {
    const stdout = runCheckBudget(system, resource);
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

function writeBudgetFile(name, content) {
  writeFileSync(join(observationsDir, name), content);
}

function cleanupBudgetFiles() {
  for (const file of readdirSync(observationsDir)) {
    if (file.startsWith("test-budget-")) {
      rmSync(join(observationsDir, file));
    }
  }
}

describe("check-budget", () => {
  before(() => {
    cleanupBudgetFiles();
  });

  after(() => {
    cleanupBudgetFiles();
  });

  it("returns exit 0 when budget is available", () => {
    writeBudgetFile("test-budget-available-resource-budget.yaml", `
id: test-available
external_system: test_system_available
resource: test_resource_available
budget: 5
current: 2
last_verified: "2026-05-16T00:00:00Z"
verification_method: test
validation_window:
  active: false
  opened_at: null
  closed_at: null
  reason: null
`);
    const result = runCheckBudgetWithCode("test_system_available", "test_resource_available");
    assert.strictEqual(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.remaining, 3);
    assert.strictEqual(output.stale, false);
    assert.strictEqual(output.validation_window_active, false);
  });

  it("returns exit 1 when budget is exhausted", () => {
    writeBudgetFile("test-budget-exhausted-resource-budget.yaml", `
id: test-exhausted
external_system: test_system_exhausted
resource: test_resource_exhausted
budget: 1
current: 1
last_verified: "2026-05-16T00:00:00Z"
verification_method: test
validation_window:
  active: false
  opened_at: null
  closed_at: null
  reason: null
`);
    const result = runCheckBudgetWithCode("test_system_exhausted", "test_resource_exhausted");
    assert.strictEqual(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.remaining, 0);
  });

  it("returns stale: true when last_verified is older than 7 days", () => {
    writeBudgetFile("test-budget-stale-resource-budget.yaml", `
id: test-stale
external_system: test_system_stale
resource: test_resource_stale
budget: 5
current: 2
last_verified: "2026-05-01T00:00:00Z"
verification_method: test
validation_window:
  active: false
  opened_at: null
  closed_at: null
  reason: null
`);
    const result = runCheckBudgetWithCode("test_system_stale", "test_resource_stale");
    assert.strictEqual(result.code, 0);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.stale, true);
  });

  it("returns exit 1 when validation_window is active (gate blocks concurrent)", () => {
    writeBudgetFile("test-budget-window-resource-budget.yaml", `
id: test-window
external_system: test_system_window
resource: test_resource_window
budget: 5
current: 2
last_verified: "2026-05-16T00:00:00Z"
verification_method: test
validation_window:
  active: true
  opened_at: "2026-05-16T00:00:00Z"
  closed_at: null
  reason: "operator validation in progress"
`);
    const result = runCheckBudgetWithCode("test_system_window", "test_resource_window");
    assert.strictEqual(result.code, 1);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.validation_window_active, true);
  });

  it("returns exit 0 when validation_window is active with --allow-active-window", () => {
    const checkBudgetPath = join(root, "tools", "check-budget", "check-budget.js");
    try {
      const stdout = execSync(
        `node ${checkBudgetPath} --system test_system_window --resource test_resource_window --allow-active-window`,
        { encoding: "utf8", cwd: root }
      );
      const output = JSON.parse(stdout);
      assert.strictEqual(output.validation_window_active, true);
    } catch (err) {
      assert.fail(`Expected exit 0 but got exit ${err.status}`);
    }
  });

  it("returns exit 2 when budget file is not found", () => {
    const result = runCheckBudgetWithCode("nonexistent_system", "nonexistent_resource");
    assert.strictEqual(result.code, 2);
  });

  it("returns exit 2 when YAML is invalid", () => {
    writeBudgetFile("test-budget-invalid-resource-budget.yaml", `
this is not: valid yaml: : :
`);
    const result = runCheckBudgetWithCode("test_system_invalid", "test_resource_invalid");
    assert.strictEqual(result.code, 2);
  });
});
