import assert from "node:assert";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOOK_PATH = path.join(
  process.cwd(),
  ".claude",
  "coordination",
  "hooks",
  "write-coordination-gate.cjs"
);
const VALIDATOR_PATH = path.join(import.meta.dirname, "validate-plan-loop.js");

function createTempProject() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-test-"));
  fs.mkdirSync(path.join(tmpDir, "records", "observations"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, ".claude", "coordination"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "plans"), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, "product"), { recursive: true });
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

function runHook(input, envOverrides = {}) {
  const result = spawnSync("node", [HOOK_PATH], {
    env: { ...process.env, ...envOverrides },
    encoding: "utf8",
    input: JSON.stringify(input),
  });
  return {
    exitCode: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
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

function parseOutput(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

describe("integration: full workflow simulation", () => {
  it("warn mode: missing decision records -> gate always blocks (exit 2)", () => {
    withTempProject((tmpDir) => {
      // Write product-build plan with no decision records
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

      // Gate should block on product code write regardless of response mode
      const hookResult = runHook(
        { tool_name: "Write", tool_input: { file_path: "product/api/main.py", content: "print(1)" } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: "warn" }
      );
      assert.strictEqual(hookResult.exitCode, 2);
      const hookOut = parseOutput(hookResult.stdout) || parseOutput(hookResult.stderr);
      assert.ok(hookOut, "gate should emit JSON block");
      assert.strictEqual(hookOut.decision, "block");

      // Validator should report violations
      const valResult = runValidator(tmpDir);
      assert.strictEqual(valResult.exitCode, 1);
      const valOutput = valResult.stdout + valResult.stderr;
      assert.ok(valOutput.includes("product"), "validator should list missing surface");
    });
  });

  it("escalate mode: missing decision records -> gate blocks", () => {
    withTempProject((tmpDir) => {
      const hookResult = runHook(
        { tool_name: "Write", tool_input: { file_path: "product/api/main.py", content: "print(1)" } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: "escalate" }
      );
      assert.strictEqual(hookResult.exitCode, 2);
      const hookOut = parseOutput(hookResult.stdout) || parseOutput(hookResult.stderr);
      assert.ok(hookOut, "gate should emit JSON block");
      assert.strictEqual(hookOut.decision, "block");
    });
  });

  it("present decision records -> gate allows, validator clean", () => {
    withTempProject((tmpDir) => {
      writeDecisionRecord(tmpDir, "product", "decision-product.yaml");

      // Write product-build plan
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

      // Gate should allow product code write
      const hookResult = runHook(
        { tool_name: "Write", tool_input: { file_path: "product/api/main.py", content: "print(1)" } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: "escalate" }
      );
      assert.strictEqual(hookResult.exitCode, 0);

      // Validator should pass
      const valResult = runValidator(tmpDir);
      assert.strictEqual(valResult.exitCode, 0);
      assert.ok(valResult.stdout.includes("0 violations"), "validator should report clean");
    });
  });

  it("surface-first path convention works", () => {
    withTempProject((tmpDir) => {
      writeDecisionRecord(tmpDir, "product", "decision-product.yaml");

      const hookResult = runHook(
        { tool_name: "Write", tool_input: { file_path: "product/web/app.ts", content: "const x = 1;" } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: "escalate" }
      );
      assert.strictEqual(hookResult.exitCode, 0);
    });
  });

  it("flat fallback path convention works", () => {
    withTempProject((tmpDir) => {
      // Write flat fallback decision record matching surface "product"
      const flatDir = path.join(tmpDir, "records", "decisions");
      fs.mkdirSync(flatDir, { recursive: true });
      fs.writeFileSync(
        path.join(flatDir, "decision-product-001.yaml"),
        "id: decision-product-001\nstatus: active\n"
      );

      const hookResult = runHook(
        { tool_name: "Write", tool_input: { file_path: "product/web/app.ts", content: "const x = 1;" } },
        { GATE_ROOT: tmpDir, GATE_RESPONSE_MODE: "escalate" }
      );
      assert.strictEqual(hookResult.exitCode, 0);
    });
  });
});
