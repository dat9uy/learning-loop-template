import assert from "node:assert";
import { test } from "node:test";
import { evaluateBudget, makeGateDecision } from "../core/gate-logic.js";

// ─── evaluateBudget tests ───

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

// ─── makeGateDecision: scoped budget escalation ───

await test("makeGateDecision: matching constraint_type + exhausted → escalate", () => {
  const result = makeGateDecision(
    "vendor-api",
    { found: false },
    {
      exhausted: true,
      constraint_type: "vendor-api",
      external_system: "vnstock_vendor",
      resource: "device_slots",
    }
  );
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.constraint_type, "vendor-api");
  assert.ok(result.reason.includes("vnstock_vendor"), "reason should include external_system");
  assert.ok(result.reason.includes("device_slots"), "reason should include resource");
});

await test("makeGateDecision: mismatched constraint_type + exhausted → block (not escalate)", () => {
  const result = makeGateDecision(
    "package-manager",
    { found: false },
    {
      exhausted: true,
      constraint_type: "vendor-api",
      external_system: "vnstock_vendor",
      resource: "device_slots",
    }
  );
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "package-manager");
  assert.ok(result.reason.includes("No active observation found"), "reason should mention missing observation");
});

await test("makeGateDecision: sudo constraint + exhausted sudo budget → escalate", () => {
  const result = makeGateDecision(
    "sudo",
    { found: false },
    {
      exhausted: true,
      constraint_type: "sudo",
      external_system: "infra",
      resource: "escalation_tokens",
    }
  );
  assert.strictEqual(result.decision, "escalate");
  assert.ok(result.reason.includes("infra"));
  assert.ok(result.reason.includes("escalation_tokens"));
});

await test("makeGateDecision: windowActive + matching constraint → escalate", () => {
  const result = makeGateDecision(
    "vendor-api",
    { found: false },
    {
      exhausted: false,
      windowActive: true,
      constraint_type: "vendor-api",
      external_system: "vnstock_vendor",
      resource: "device_slots",
    }
  );
  assert.strictEqual(result.decision, "escalate");
  assert.ok(result.reason.includes("Validation window active"));
});

await test("makeGateDecision: windowActive + mismatched constraint → block", () => {
  const result = makeGateDecision(
    "docker",
    { found: false },
    {
      exhausted: false,
      windowActive: true,
      constraint_type: "vendor-api",
      external_system: "vnstock_vendor",
      resource: "device_slots",
    }
  );
  assert.strictEqual(result.decision, "block");
  assert.ok(result.reason.includes("No active observation found"));
});

await test("makeGateDecision: matching constraint but not exhausted → block (observation missing)", () => {
  const result = makeGateDecision(
    "vendor-api",
    { found: false },
    {
      exhausted: false,
      constraint_type: "vendor-api",
    }
  );
  assert.strictEqual(result.decision, "block");
});

await test("makeGateDecision: no budgetStatus, no observation → block", () => {
  const result = makeGateDecision("docker", { found: false }, null);
  assert.strictEqual(result.decision, "block");
});

await test("makeGateDecision: side-effect-import always blocks regardless of budget", () => {
  const result = makeGateDecision(
    "side-effect-import",
    { found: false },
    {
      exhausted: true,
      constraint_type: "vendor-api",
    }
  );
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});
