import assert from "node:assert";
import { test } from "node:test";
import { evaluateBudget, makeGateDecision } from "../../core/gate-logic.js";

// ─── evaluateBudget tests (utility function, no longer called by gate) ───

await test("evaluateBudget: exhausted returns metadata fields", () => {
  const budget = {
    budget: 1,
    current: 1,
    constraint_type: "vendor-api",
    external_system: "vnstock_vendor",
    resource: "device_slots",
  };
  const result = evaluateBudget(budget);
  assert.strictEqual(result.exhausted, true);
  assert.strictEqual(result.remaining, 0);
  assert.strictEqual(result.constraint_type, "vendor-api");
  assert.strictEqual(result.external_system, "vnstock_vendor");
  assert.strictEqual(result.resource, "device_slots");
});

await test("evaluateBudget: not exhausted returns metadata fields", () => {
  const budget = {
    budget: 1,
    current: 0,
    constraint_type: "vendor-api",
    external_system: "vnstock_vendor",
    resource: "device_slots",
  };
  const result = evaluateBudget(budget);
  assert.strictEqual(result.exhausted, false);
  assert.strictEqual(result.remaining, 1);
  assert.strictEqual(result.constraint_type, "vendor-api");
  assert.strictEqual(result.external_system, "vnstock_vendor");
  assert.strictEqual(result.resource, "device_slots");
});

await test("evaluateBudget: missing fields returns null metadata", () => {
  const budget = { budget: 1, current: 0 };
  const result = evaluateBudget(budget);
  assert.strictEqual(result.exhausted, false);
  assert.strictEqual(result.constraint_type, null);
  assert.strictEqual(result.external_system, null);
  assert.strictEqual(result.resource, null);
});

await test("evaluateBudget: null input fail-open", () => {
  const result = evaluateBudget(null);
  assert.strictEqual(result.exhausted, false);
  assert.strictEqual(result.windowActive, false);
  assert.strictEqual(result.constraint_type, null);
  assert.strictEqual(result.external_system, null);
  assert.strictEqual(result.resource, null);
});

// ─── makeGateDecision: budget parameter removed (Option C) ───

await test("makeGateDecision: vendor-api with no observation → block (no budget check)", () => {
  const result = makeGateDecision("vendor-api", { found: false });
  assert.strictEqual(result.decision, "block");
  assert.ok(result.reason.includes("No active observation found"));
  assert.strictEqual(result.constraint_type, "vendor-api");
  assert.strictEqual(result.observation_required, true);
});

await test("makeGateDecision: vendor-api with observation → ok (no budget escalation)", () => {
  const result = makeGateDecision("vendor-api", { found: true, observation: { id: "obs-vnstock-1" } });
  assert.strictEqual(result.decision, "ok");
  // No budget-related fields should be present
  assert.strictEqual(result.observation_id, undefined);
  assert.strictEqual(result.reason, undefined);
});

await test("makeGateDecision: docker with no observation → block", () => {
  const result = makeGateDecision("docker", { found: false });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "docker");
  assert.strictEqual(result.observation_required, true);
});

await test("makeGateDecision: side-effect-import always blocks regardless of observation", () => {
  const result = makeGateDecision("side-effect-import", { found: true });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.ok(result.reason.includes("importlib.util.find_spec"));
});
