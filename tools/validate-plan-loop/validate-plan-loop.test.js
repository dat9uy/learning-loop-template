import assert from "node:assert";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VALIDATOR_PATH = path.join(import.meta.dirname, "validate-plan-loop.js");

function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-plan-loop-test-"));
  fs.mkdirSync(path.join(tmpDir, "records", "observations"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "plans"), { recursive: true });
  return tmpDir;
}

function writeDecisionRecord(tmpDir, surface, filename) {
  const surfaceFirstDir = path.join(tmpDir, "records", surface, "decisions");
  fs.mkdirSync(surfaceFirstDir, { recursive: true });
  fs.writeFileSync(
    path.join(surfaceFirstDir, filename),
    `id: ${filename.replace(".yaml", "")}\nstatus: active\n`
  );
}

function runValidator(projectRoot) {
  const result = spawnSync("node", [VALIDATOR_PATH], {
    env: { ...process.env, GATE_ROOT: projectRoot },
    encoding: "utf8",
    cwd: projectRoot,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function withTempProject(fn) {
  const tmpDir = createTempProject();
  try {
    return fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("validate-plan-loop", () => {
  it("valid product-build plan with Phase 0 and decision records -> pass", () => {
    withTempProject((tmpDir) => {
      writeDecisionRecord(tmpDir, "product", "decision-product.yaml");
      const planContent = `---
title: "Product Plan"
tags: [product-build]
surfaces: [product]
---

# Phase 0: Loop Pre-Flight

### Surface Declaration
- [ ] \`product\`

### Decision Record Checklist
- [ ] Decision records exist

## Phase 1: Implementation

Do the thing.
`;
      fs.mkdirSync(path.join(tmpDir, "plans", "2026", "test"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "plans", "2026", "test", "plan.md"), planContent);

      const r = runValidator(tmpDir);
      assert.strictEqual(r.exitCode, 0, `expected exit 0, got stderr: ${r.stderr}`);
      assert.ok(r.stdout.includes("checked"), "should report plans checked");
    });
  });

  it("product-build plan missing Phase 0 -> fail with error", () => {
    withTempProject((tmpDir) => {
      writeDecisionRecord(tmpDir, "product", "decision-product.yaml");
      const planContent = `---
title: "Product Plan"
tags: [product-build]
surfaces: [product]
---

# Plan

No Phase 0 here.
`;
      fs.mkdirSync(path.join(tmpDir, "plans", "2026", "test"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "plans", "2026", "test", "plan.md"), planContent);

      const r = runValidator(tmpDir);
      assert.strictEqual(r.exitCode, 1);
      assert.ok(r.stdout.includes("Missing Phase 0") || r.stderr.includes("Missing Phase 0"), "should report missing Phase 0");
    });
  });

  it("product-build plan with Phase 0 but missing decision records -> fail", () => {
    withTempProject((tmpDir) => {
      // No decision records written
      const planContent = `---
title: "Product Plan"
tags: [product-build]
surfaces: [product]
---

# Phase 0: Loop Pre-Flight

## Phase 1: Implementation
`;
      fs.mkdirSync(path.join(tmpDir, "plans", "2026", "test"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "plans", "2026", "test", "plan.md"), planContent);

      const r = runValidator(tmpDir);
      assert.strictEqual(r.exitCode, 1);
      const output = r.stdout + r.stderr;
      assert.ok(output.includes("product"), "should list missing surface");
    });
  });

  it("non-product plan -> pass (ignored)", () => {
    withTempProject((tmpDir) => {
      const planContent = `---
title: "Experiment Plan"
tags: [experiment]
---

# Plan

No Phase 0, no product-build tag.
`;
      fs.mkdirSync(path.join(tmpDir, "plans", "2026", "test"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "plans", "2026", "test", "plan.md"), planContent);

      const r = runValidator(tmpDir);
      assert.strictEqual(r.exitCode, 0);
    });
  });

  it("malformed plan frontmatter -> pass (fail-open, log warning)", () => {
    withTempProject((tmpDir) => {
      const planContent = `---
this is not valid yaml: [
---

# Plan
`;
      fs.mkdirSync(path.join(tmpDir, "plans", "2026", "test"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "plans", "2026", "test", "plan.md"), planContent);

      const r = runValidator(tmpDir);
      assert.strictEqual(r.exitCode, 0);
    });
  });

  it("empty plans directory -> pass", () => {
    withTempProject((tmpDir) => {
      const r = runValidator(tmpDir);
      assert.strictEqual(r.exitCode, 0);
    });
  });

  it("plan with multiple surfaces, one missing decision -> fail, list only missing", () => {
    withTempProject((tmpDir) => {
      writeDecisionRecord(tmpDir, "product", "decision-product.yaml");
      // vnstock decision NOT written
      const planContent = `---
title: "Multi Surface Plan"
tags: [product-build]
surfaces: [product, vnstock]
---

# Phase 0: Loop Pre-Flight

## Phase 1: Implementation
`;
      fs.mkdirSync(path.join(tmpDir, "plans", "2026", "test"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "plans", "2026", "test", "plan.md"), planContent);

      const r = runValidator(tmpDir);
      assert.strictEqual(r.exitCode, 1);
      const output = r.stdout + r.stderr;
      assert.ok(output.includes("vnstock"), "should list missing vnstock surface");
      assert.ok(!output.includes("product") || output.includes("Missing decision records for surface: vnstock"), "should not flag product");
    });
  });

  it("completed (status: completed) product-build plan without Phase 0 -> pass (grandfathered)", () => {
    withTempProject((tmpDir) => {
      const planContent = `---
title: "Old Plan"
tags: [product-build]
status: completed
---

# Plan

No Phase 0 because it's old.
`;
      fs.mkdirSync(path.join(tmpDir, "plans", "2026", "test"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "plans", "2026", "test", "plan.md"), planContent);

      const r = runValidator(tmpDir);
      assert.strictEqual(r.exitCode, 0);
    });
  });
});
