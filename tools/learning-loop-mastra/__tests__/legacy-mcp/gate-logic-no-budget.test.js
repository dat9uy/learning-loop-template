import assert from "node:assert";
import { test } from "node:test";
import { makeGateDecision } from "../../core/legacy/gate-logic.js";

// ─── makeGateDecision: no budget parameter, budget escalation removed ───

await test("makeGateDecision accepts only 2 parameters", () => {
  const result = makeGateDecision("vendor-api", { found: true });
  assert.strictEqual(result.decision, "ok");
});

await test("makeGateDecision: vendor-api with observation + exhausted budget → ok (not escalate)", () => {
  const result = makeGateDecision("vendor-api", { found: true });
  assert.strictEqual(result.decision, "ok");
});

await test("makeGateDecision: vendor-api with no observation → block", () => {
  const result = makeGateDecision("vendor-api", { found: false });
  assert.strictEqual(result.decision, "block");
  assert.ok(result.reason.includes("No active observation found"));
  assert.strictEqual(result.constraint_type, "vendor-api");
  assert.strictEqual(result.observation_required, true);
});

await test("makeGateDecision: side-effect-import always blocks regardless of observation", () => {
  const result = makeGateDecision("side-effect-import", { found: true });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.ok(result.reason.includes("importlib.util.find_spec"));
});

await test("makeGateDecision: side-effect-import blocks even with observation", () => {
  const result = makeGateDecision("side-effect-import", { found: true, observation: { id: "obs-1" } });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

await test("makeGateDecision: no constraint match → ok", () => {
  const result = makeGateDecision(null, { found: false });
  assert.strictEqual(result.decision, "ok");
});

await test("makeGateDecision: docker with no observation → block", () => {
  const result = makeGateDecision("docker", { found: false });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "docker");
  assert.strictEqual(result.observation_required, true);
});

await test("makeGateDecision: sudo with no observation → block", () => {
  const result = makeGateDecision("sudo", { found: false });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "sudo");
});

await test("makeGateDecision: package-manager with no observation → block", () => {
  const result = makeGateDecision("package-manager", { found: false });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "package-manager");
});

await test("makeGateDecision: vendor-api with observation found → ok even when budget would be exhausted", () => {
  // This is the key Option C change: the gate no longer enforces budget.
  // The agent is responsible for budget checking via budget_check MCP tool.
  const result = makeGateDecision("vendor-api", { found: true, observation: { id: "obs-vnstock-1" } });
  assert.strictEqual(result.decision, "ok");
  // No budget-related fields should be present
  assert.strictEqual(result.observation_id, undefined);
});
