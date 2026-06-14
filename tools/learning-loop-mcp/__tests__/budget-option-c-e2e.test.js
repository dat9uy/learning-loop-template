import { describe, test } from "node:test";
import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { metaStateListTool } from "../tools/meta-state-list-tool.js";
import { gateCheckTool } from "../tools/gate-tool.js";
import { readRegistry } from "../core/meta-state.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASH_HOOK = join(__dirname, "..", "hooks", "bash-gate.js");

function runBashHook(input, envOverrides = {}) {
  const result = spawnSync("node", [BASH_HOOK], {
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 5000,
    env: { ...process.env, ...envOverrides },
  });
  let output = null;
  try {
    output = JSON.parse(result.stdout.trim());
  } catch {
    output = null;
  }
  return {
    exitCode: result.status ?? 0,
    output,
  };
}

function createRuntimeStateEntry(root, affectedSystem, constraints = ["vendor-api", "package-manager"]) {
  const sidecarPath = join(root, "runtime-state.jsonl");
  const entries = [];
  for (const constraint of constraints) {
    entries.push({
      kind: "ledger-event",
      affected_system: affectedSystem,
      id: `${affectedSystem}-test-${Date.now()}`,
      value: 0,
      delta: 0,
      source_ref: "local:meta-state:rule-test",
      fingerprint: "sha256:test",
      timestamp: new Date().toISOString(),
      status: "active",
      metadata: { action: "test", authorization: constraint },
    });
  }
  writeFileSync(sidecarPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
}

function createExhaustedBudget(root) {
  const sidecarPath = join(root, "runtime-state.jsonl");
  const entry = {
    kind: "budget-state",
    affected_system: "vnstock",
    id: "vnstock-budget-test",
    value: 1,
    delta: 0,
    source_ref: "local:meta-state:rule-test",
    fingerprint: "sha256:test",
    timestamp: new Date().toISOString(),
    status: "active",
    metadata: { budget: 1, current: 1, resource: "device_slots" },
  };
  writeFileSync(sidecarPath, JSON.stringify(entry) + "\n", "utf8");
}

function createDockerObservation(root) {
  // Docker remains hard-blocked; no runtime-state entry needed.
  // This helper is kept for test compatibility but is a no-op.
}

describe("Option C: Agent-Managed Budget end-to-end", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  test("bash gate: vendor-api with runtime-state entry + exhausted budget → ok", () => {
    tempDir = mkdtempSync(join(tmpdir(), "budget-optc-e2e-"));
    process.env.GATE_ROOT = tempDir;
    createRuntimeStateEntry(tempDir, "vnstock");
    createExhaustedBudget(tempDir);

    const result = runBashHook({
      tool_name: "Bash",
      tool_input: { command: "curl https://api.vnstock.com/data" },
    });

    try {
      assert.strictEqual(result.exitCode, 0, "Expected exit 0 (ok) — bash gate does not output for ok");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("bash gate: vendor-api with no runtime-state entry → block", () => {
    tempDir = mkdtempSync(join(tmpdir(), "budget-optc-noobs-"));
    process.env.GATE_ROOT = tempDir;
    // No runtime-state entry created — only a docker observation (which is no-op now)
    createDockerObservation(tempDir);

    const result = runBashHook({
      tool_name: "Bash",
      tool_input: { command: "curl https://api.vnstock.com/data" },
    });

    try {
      assert.strictEqual(result.exitCode, 2, "Expected exit 2 (block)");
      assert.strictEqual(result.output?.decision, "block");
      assert.strictEqual(result.output?.observation_required, true);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("bash gate: side-effect-import always blocks regardless of runtime-state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "budget-optc-sideeffect-"));
    process.env.GATE_ROOT = tempDir;
    createRuntimeStateEntry(tempDir, "vnstock");

    const result = runBashHook({
      tool_name: "Bash",
      tool_input: { command: "python -c 'import vnstock_data'" },
    });

    try {
      assert.strictEqual(result.exitCode, 2, "Expected exit 2 (hard block)");
      assert.strictEqual(result.output?.decision, "block");
      assert.strictEqual(result.output?.hard_block, true);
      assert.ok(result.output?.reason?.includes("importlib.util.find_spec"));
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("mcp gate_check: vendor-api with runtime-state entry + exhausted budget → ok", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "budget-optc-mcp-"));
    process.env.GATE_ROOT = tempDir;
    createRuntimeStateEntry(tempDir, "vnstock");
    createExhaustedBudget(tempDir);

    const result = await gateCheckTool.handler({
      command: "curl https://api.vnstock.com/data",
    });
    const text = JSON.parse(result.content[0].text);

    try {
      assert.strictEqual(text.decision, "ok");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("mcp gate_check: vendor-api with no runtime-state entry → block", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "budget-optc-mcp-noobs-"));
    process.env.GATE_ROOT = tempDir;
    // Only create a docker observation (no-op) — no vendor-api runtime-state entry
    createDockerObservation(tempDir);

    const result = await gateCheckTool.handler({
      command: "curl https://api.vnstock.com/data",
    });
    const text = JSON.parse(result.content[0].text);

    try {
      assert.strictEqual(text.decision, "block");
      assert.strictEqual(text.observation_required, true);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("meta_state_report with budget-check category writes to registry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "budget-optc-meta-"));
    process.env.GATE_ROOT = tempDir;

    const reportResult = await metaStateReportTool.handler({
      category: "budget-check",
      severity: "warning",
      affected_system: "vnstock_vendor",
      description: "Agent checked budget before vendor-api curl. Budget 1/1, fingerprint matches, proceeding.",
      evidence_code_ref: "records/observations/observation-vnstock-resource-budget.yaml",
    });
    const reportText = JSON.parse(reportResult.content[0].text);

    try {
      assert.strictEqual(reportText.reported, true);
      assert.ok(reportText.id);

      const entries = readRegistry(tempDir);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].category, "budget-check");
      assert.strictEqual(entries[0].affected_system, "vnstock_vendor");
      assert.strictEqual(entries[0].status, "reported");
      assert.ok(entries[0].id.startsWith("meta-"));
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("meta_state_list filters by budget-check category", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "budget-optc-list-"));
    process.env.GATE_ROOT = tempDir;

    await metaStateReportTool.handler({
      category: "budget-check",
      severity: "warning",
      affected_system: "vnstock_vendor",
      description: "Budget check entry for filtering test",
    });
    await metaStateReportTool.handler({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Unrelated gate logic issue",
    });

    try {
      const listResult = await metaStateListTool.handler({ category: "budget-check" });
      const listText = JSON.parse(listResult.content[0].text);
      assert.strictEqual(listText.count, 1);
      assert.strictEqual(listText.entries[0].category, "budget-check");
      assert.strictEqual(listText.entries[0].affected_system, "vnstock_vendor");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});
