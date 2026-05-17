import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONSTRAINT_PATTERNS,
  matchConstraintPattern,
  checkObservationExists,
  evaluateBudget,
  makeGateDecision,
} from "./gate-logic.js";

describe("matchConstraintPattern", () => {
  it("matches docker command", () => {
    assert.equal(matchConstraintPattern("docker run ubuntu"), "docker");
  });

  it("matches sudo command", () => {
    assert.equal(matchConstraintPattern("sudo chown root file"), "sudo");
  });

  it("matches package-manager (pip install)", () => {
    assert.equal(matchConstraintPattern("pip install requests"), "package-manager");
  });

  it("matches package-manager (npm install)", () => {
    assert.equal(matchConstraintPattern("npm install express"), "package-manager");
  });

  it("matches package-manager (pnpm add)", () => {
    assert.equal(matchConstraintPattern("pnpm add zod"), "package-manager");
  });

  it("matches vendor-api (curl ... api)", () => {
    assert.equal(matchConstraintPattern("curl https://api.example.com"), "vendor-api");
  });

  it("does NOT match cat docker-compose.yml (word boundary)", () => {
    assert.equal(matchConstraintPattern("cat docker-compose.yml"), null);
  });

  it("does NOT match 'see undocumented feature'", () => {
    assert.equal(matchConstraintPattern('echo "see undocumented feature"'), null);
  });

  it("does NOT match ls -la", () => {
    assert.equal(matchConstraintPattern("ls -la"), null);
  });

  it("checks each segment when split on semicolon", () => {
    const result = matchConstraintPattern("ls -la; docker run ubuntu");
    assert.equal(result, "docker");
  });

  it("checks each segment when split on pipe", () => {
    const result = matchConstraintPattern("cat file | sudo tee /etc/hosts");
    assert.equal(result, "sudo");
  });

  it("checks each segment when split on &&", () => {
    const result = matchConstraintPattern("echo hi && pip install requests");
    assert.equal(result, "package-manager");
  });

  it("returns null for empty command", () => {
    assert.equal(matchConstraintPattern(""), null);
  });

  it("returns null for null command", () => {
    assert.equal(matchConstraintPattern(null), null);
  });

  // Phase 1: python import of vendor packages
  it("matches python import vnstock_data as vendor-api", () => {
    assert.equal(matchConstraintPattern('python -c "import vnstock_data"'), "vendor-api");
  });

  it("matches python import vnstock as vendor-api", () => {
    assert.equal(matchConstraintPattern("python -c 'import vnstock'"), "vendor-api");
  });

  it("matches python3 import vnstock_data as vendor-api", () => {
    assert.equal(matchConstraintPattern("python3 -c 'import vnstock_data'"), "vendor-api");
  });

  // Phase 1: bootstrap/setup commands
  it("matches pnpm bootstrap:api as package-manager", () => {
    assert.equal(matchConstraintPattern("pnpm bootstrap:api"), "package-manager");
  });

  it("matches pnpm setup as package-manager", () => {
    assert.equal(matchConstraintPattern("pnpm setup"), "package-manager");
  });

  it("matches uv sync as package-manager", () => {
    assert.equal(matchConstraintPattern("uv sync"), "package-manager");
  });

  // Phase 1: negative cases
  it("does NOT match python print as vendor-api", () => {
    assert.equal(matchConstraintPattern('python -c "print(1)"'), null);
  });

  it("does NOT match import os as vendor-api", () => {
    assert.equal(matchConstraintPattern('python -c "import os"'), null);
  });
});

describe("checkObservationExists", () => {
  const observations = [
    { constraint_type: "sudo", status: "active", id: "obs-1" },
    { constraint_type: "docker", status: "archived", id: "obs-2" },
    { constraint_type: "device_limit", status: "active", id: "obs-3" },
  ];

  it("finds active observation by constraint_type", () => {
    const result = checkObservationExists("sudo", observations);
    assert.equal(result.found, true);
    assert.equal(result.observation.id, "obs-1");
  });

  it("returns not found for missing constraint_type", () => {
    const result = checkObservationExists("package-manager", observations);
    assert.equal(result.found, false);
  });

  it("returns not found for archived observation", () => {
    const result = checkObservationExists("docker", observations);
    assert.equal(result.found, false);
  });

  it("handles empty observations array", () => {
    const result = checkObservationExists("sudo", []);
    assert.equal(result.found, false);
  });

  it("handles null observations", () => {
    const result = checkObservationExists("sudo", null);
    assert.equal(result.found, false);
  });

  // Phase 2: schema mismatch — match on constraint_type OR constraint field
  it("finds observation with matching constraint_type field", () => {
    const obs = [
      { constraint_type: "vendor-api", constraint: "device_limit_blocks_reinstall", status: "active" },
    ];
    const result = checkObservationExists("vendor-api", obs);
    assert.equal(result.found, true);
  });

  it("finds observation with constraint_type only", () => {
    const obs = [{ constraint_type: "vendor-api", status: "active" }];
    const result = checkObservationExists("vendor-api", obs);
    assert.equal(result.found, true);
  });

  it("matches on constraint_type when both fields present", () => {
    const obs = [
      { constraint_type: "vendor-api", constraint: "device_limit_blocks_reinstall", status: "active" },
    ];
    const result = checkObservationExists("vendor-api", obs);
    assert.equal(result.found, true);
    assert.equal(result.observation.constraint_type, "vendor-api");
  });

  it("finds observation by constraint field when constraint_type absent", () => {
    const obs = [{ constraint: "vendor-api", status: "active" }];
    const result = checkObservationExists("vendor-api", obs);
    assert.equal(result.found, true);
  });

  it("does NOT find observation with only slug-style constraint field", () => {
    const obs = [{ constraint: "device_limit_blocks_reinstall", status: "active" }];
    const result = checkObservationExists("vendor-api", obs);
    assert.equal(result.found, false);
  });
});

describe("evaluateBudget", () => {
  it("returns exhausted when current >= budget", () => {
    const result = evaluateBudget({ budget: 1, current: 1 });
    assert.equal(result.exhausted, true);
  });

  it("returns not exhausted when current < budget", () => {
    const result = evaluateBudget({ budget: 5, current: 2 });
    assert.equal(result.exhausted, false);
    assert.equal(result.remaining, 3);
  });

  it("returns windowActive when validation_window.active is true", () => {
    const result = evaluateBudget({ budget: 5, current: 2, validation_window: { active: true } });
    assert.equal(result.windowActive, true);
  });

  it("returns windowActive false when validation_window is absent", () => {
    const result = evaluateBudget({ budget: 5, current: 2 });
    assert.equal(result.windowActive, false);
  });

  it("returns exhausted false for null budget (fail-open)", () => {
    const result = evaluateBudget(null);
    assert.equal(result.exhausted, false);
    assert.equal(result.windowActive, false);
  });
});

describe("makeGateDecision", () => {
  it("returns ok when no constraint match", () => {
    const decision = makeGateDecision(null, { found: false }, { exhausted: false });
    assert.equal(decision.decision, "ok");
  });

  it("returns block when constraint matched but no observation", () => {
    const decision = makeGateDecision("sudo", { found: false }, { exhausted: false });
    assert.equal(decision.decision, "block");
    assert.equal(decision.observation_required, true);
    assert.ok(decision.reason.includes("sudo"));
  });

  it("returns ok when constraint matched, observation exists, budget ok", () => {
    const decision = makeGateDecision(
      "sudo",
      { found: true, observation: { id: "obs-1" } },
      { exhausted: false }
    );
    assert.equal(decision.decision, "ok");
  });

  it("returns escalate when budget exhausted", () => {
    const decision = makeGateDecision(
      "sudo",
      { found: true, observation: { id: "obs-1" } },
      { exhausted: true }
    );
    assert.equal(decision.decision, "escalate");
  });

  it("returns escalate when validation window active", () => {
    const decision = makeGateDecision(
      "sudo",
      { found: true, observation: { id: "obs-1" } },
      { exhausted: false, windowActive: true }
    );
    assert.equal(decision.decision, "escalate");
  });

  // Phase 3: budget-first ordering
  it("escalate when budget exhausted and command matches pattern (no observation)", () => {
    const decision = makeGateDecision("vendor-api", { found: false }, { exhausted: true });
    assert.equal(decision.decision, "escalate");
  });

  it("escalate when budget exhausted even without observation", () => {
    const decision = makeGateDecision(
      "vendor-api",
      { found: false },
      { exhausted: true, windowActive: false }
    );
    assert.equal(decision.decision, "escalate");
    assert.ok(decision.reason.includes("Budget exhausted"));
  });

  it("ok when budget not exhausted and no pattern match", () => {
    const decision = makeGateDecision(null, { found: false }, { exhausted: false });
    assert.equal(decision.decision, "ok");
  });

  it("ok when no pattern match even if budget exhausted", () => {
    const decision = makeGateDecision(null, { found: false }, { exhausted: true });
    assert.equal(decision.decision, "ok");
  });
});
