import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert";
import { writeFileSync, rmSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheckBudget } from "./check-budget.js";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const observationsDir = join(root, "records", "observations");

function writeBudgetFile(name, content) {
  writeFileSync(join(observationsDir, name), content);
}

function cleanupBudgetFiles() {
  for (const file of readdirSync(observationsDir)) {
    if (file.startsWith("test-function-budget-")) {
      rmSync(join(observationsDir, file));
    }
  }
}

describe("runCheckBudget (pure function)", () => {
  before(() => {
    cleanupBudgetFiles();
  });

  after(() => {
    cleanupBudgetFiles();
  });

  afterEach(() => {
    cleanupBudgetFiles();
  });

  it("returns output with code 0 when budget is available", () => {
    writeBudgetFile("test-function-budget-available-resource-budget.yaml", `
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
    const result = runCheckBudget(root, { system: "test_system_available", resource: "test_resource_available" });
    assert.strictEqual(result.code, 0, `expected code 0, got error: ${result.error}`);
    assert.ok(result.output, "should return output");
    assert.strictEqual(result.output.remaining, 3);
  });

  it("returns code 1 when budget is exhausted", () => {
    writeBudgetFile("test-function-budget-exhausted-resource-budget.yaml", `
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
    const result = runCheckBudget(root, { system: "test_system_exhausted", resource: "test_resource_exhausted" });
    assert.strictEqual(result.code, 1);
    assert.ok(result.output);
    assert.strictEqual(result.output.remaining, 0);
  });

  it("returns code 2 when budget file is not found", () => {
    const result = runCheckBudget(root, { system: "nonexistent_system", resource: "nonexistent_resource" });
    assert.strictEqual(result.code, 2);
    assert.ok(result.error);
  });

  it("returns code 2 when YAML is invalid", () => {
    writeBudgetFile("test-function-budget-invalid-resource-budget.yaml", `
this is not: valid yaml: : :
`);
    const result = runCheckBudget(root, { system: "test_system_invalid", resource: "test_resource_invalid" });
    assert.strictEqual(result.code, 2);
    assert.ok(result.error);
  });

  it("returns code 0 with active window when allowActiveWindow is true", () => {
    writeBudgetFile("test-function-budget-window-resource-budget.yaml", `
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
    const result = runCheckBudget(root, {
      system: "test_system_window",
      resource: "test_resource_window",
      allowActiveWindow: true,
    });
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.output.validation_window_active, true);
  });

  it("returns code 1 with active window when allowActiveWindow is false", () => {
    writeBudgetFile("test-function-budget-window-resource-budget.yaml", `
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
    const result = runCheckBudget(root, {
      system: "test_system_window",
      resource: "test_resource_window",
      allowActiveWindow: false,
    });
    assert.strictEqual(result.code, 1);
    assert.strictEqual(result.output.validation_window_active, true);
  });

  it("returns error when system or resource is missing", () => {
    const result = runCheckBudget(root, { system: "sys" });
    assert.strictEqual(result.code, 2);
    assert.ok(result.error.includes("Missing required arguments"));
  });
});
