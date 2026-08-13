/**
 * TDD tests for the Command Constraint Policy module
 * (core/command-constraint-policy.js). The policy is the single owner of
 * constraint-pattern + gate-verb matching, observation lookup, age-bounded
 * allowance expiry, ordinary observation staleness, side-effect-import hard
 * blocking, gate-verb remediation, and constraint-versus-gate-verb severity.
 * The ground-truth integration seam stays the stable Bash-gate evaluator
 * (evaluate-bash-gate.test.js + the preservation baseline integration test);
 * these subject-level tests pin the policy contract directly without
 * duplicating the evaluator's final precedence fold (constraint vs
 * protected-path vs promoted-rule).
 */

import { test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  evaluateCommandConstraintPolicy,
  matchConstraintPattern,
  matchGateVerb,
  makeGateDecision,
  checkObservationExists,
} from "./command-constraint-policy.js";
import { interpretCommand } from "./command-interpretation.js";

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "cmd-constraint-policy-test-"));
}

function writeRuntimeState(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(join(root, "runtime-state.jsonl"), lines + "\n");
}

// ── positive: constraint / gate-verb match returns the decision shape ──

test("constraint match + no observation → block candidate with constraint_type", () => {
  const root = makeRoot();
  const result = evaluateCommandConstraintPolicy({ command: "pip install vnstock", root });
  assert.ok(result, "expected a block candidate");
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "package-manager");
});

test("constraint match + active observation → ok candidate", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    { id: "obs-1", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: new Date().toISOString() },
  ]);
  const result = evaluateCommandConstraintPolicy({ command: "pip install vnstock", root });
  assert.strictEqual(result.decision, "ok");
});

test("side-effect-import → hard block", () => {
  const root = makeRoot();
  const result = evaluateCommandConstraintPolicy({ command: "python -c 'import vnstock_data'", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

// ── gate verbs + remediation ──

test("gate-verb:bash + no observation → block with 2-call remediation incantation", () => {
  const root = makeRoot();
  const result = evaluateCommandConstraintPolicy({ command: "bash -c 'echo hi'", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "gate-verb:bash");
  assert.ok(result.reason.includes('gate_mark_preflight({surface:"runtime-state"})'));
  assert.ok(result.reason.includes('runtime_state_record({affected_system:"gate-verb:bash"'));
  assert.ok(result.reason.includes('kind:"budget-state"'));
  assert.ok(result.reason.includes('id:"gate-verb:bash"'));
  assert.ok(result.reason.includes('source_ref:"local:meta-state:gate-verb-allowance"'));
  assert.ok(result.reason.includes("id MUST equal affected_system"));
});

test("gate-verb:bash + recorded observation → ok", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    { id: "obs-bash", kind: "budget-state", status: "active", affected_system: "gate-verb:bash", timestamp: new Date().toISOString() },
  ]);
  const result = evaluateCommandConstraintPolicy({ command: "bash tools/scripts/vitest-failures.sh", root });
  assert.strictEqual(result.decision, "ok");
});

test("expired gate-verb observation → block with expired-fresh reason framing", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    {
      id: "obs-bash",
      kind: "budget-state",
      status: "active",
      affected_system: "gate-verb:bash",
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  ]);
  const result = evaluateCommandConstraintPolicy({ command: "bash -c 'echo hi'", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.observation_required, true);
  assert.ok(/expired/i.test(result.reason));
  assert.ok(result.reason.includes("gate_mark_preflight"));
  assert.ok(result.reason.includes('runtime_state_record({affected_system:"gate-verb:bash"'));
  assert.ok(result.reason.includes('source_ref:"local:meta-state:gate-verb-allowance"'));
});

test("gate-verb observation older than the operator marker → escalate (staleness parity)", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    {
      id: "obs-bash",
      kind: "budget-state",
      status: "active",
      affected_system: "gate-verb:bash",
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
  ]);
  const markerPath = join(root, "marker.json");
  writeFileSync(markerPath, JSON.stringify({ timestamp: new Date().toISOString() }));
  process.env.GATE_MARKER_PATH = markerPath;
  try {
    const result = evaluateCommandConstraintPolicy({ command: "bash tools/scripts/vitest-failures.sh", root });
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.inbound_gate, true);
  } finally {
    delete process.env.GATE_MARKER_PATH;
  }
});

// ── severity: constraint vs gate-verb ──

test("gate-verb hard block wins over a resolved constraint ok", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    { id: "obs-vnstock", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: new Date().toISOString() },
  ]);
  const result = evaluateCommandConstraintPolicy({
    command: "pip install vnstock; bash -c 'echo hi'",
    root,
  });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "gate-verb:bash");
});

test("non-ok constraint beats an ok gate-verb (constraint severity wins)", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    { id: "obs-bash", kind: "budget-state", status: "active", affected_system: "gate-verb:bash", timestamp: new Date().toISOString() },
  ]);
  // vnstock (no observation → block) + gate-verb:bash (observed → ok).
  const result = evaluateCommandConstraintPolicy({
    command: "pip install vnstock && bash tools/scripts/vitest-failures.sh",
    root,
  });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "package-manager");
});

test("neither constraint nor gate-verb matches → null (no candidate)", () => {
  const root = makeRoot();
  assert.strictEqual(evaluateCommandConstraintPolicy({ command: "ls -la", root }), null);
  assert.strictEqual(evaluateCommandConstraintPolicy({ command: "echo 'x'", root }), null);
  assert.strictEqual(evaluateCommandConstraintPolicy({ command: "", root }), null);
  assert.strictEqual(evaluateCommandConstraintPolicy({ command: null, root }), null);
});

test("quote-concatenation split constraint (s''udo) still detected at policy seam", () => {
  const root = makeRoot();
  const result = evaluateCommandConstraintPolicy({ command: "s''udo apt-get install", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "sudo");
});

test("policy evaluates the supplied opaque interpretation, not mismatched raw text", () => {
  const root = makeRoot();
  const interpretation = interpretCommand("ls -la");
  const result = evaluateCommandConstraintPolicy({
    command: "pip install vnstock",
    interpretation,
    root,
  });
  assert.strictEqual(result, null);
});

test("policy falls back to raw-command compatibility when interpretation is unavailable", () => {
  const root = makeRoot();
  const brokenInterpretation = {
    matchConfiguredConstraints() {
      throw new Error("interpretation seam unavailable");
    },
  };
  const result = evaluateCommandConstraintPolicy({
    command: "pip install vnstock",
    interpretation: brokenInterpretation,
    root,
  });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "package-manager");
});

// ── policy helper compatibility (one-way adapter to the policy) ──

test("matchConstraintPattern / matchGateVerb / makeGateDecision / checkObservationExists are exported from the policy", () => {
  assert.strictEqual(typeof matchConstraintPattern, "function");
  assert.strictEqual(typeof matchGateVerb, "function");
  assert.strictEqual(typeof makeGateDecision, "function");
  assert.strictEqual(typeof checkObservationExists, "function");
});

test("makeGateDecision side-effect-import hard block preserved", () => {
  const result = makeGateDecision("side-effect-import", { found: true });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});
