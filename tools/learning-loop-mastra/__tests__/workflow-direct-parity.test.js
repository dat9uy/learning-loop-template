import { test } from "node:test";
import assert from "node:assert";
import { z } from "zod";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "workflow-parity-"));
  mkdirSync(join(tempRoot, "records", "meta", "index"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "capabilities"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "evidence"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  return tempRoot;
}

function writeYaml(root, path, data) {
  const fullPath = join(root, path);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, JSON.stringify(data, null, 2));
}

test("workflow-classify-prompt: direct parity matches legacy handler", async () => {
  const { workflowClassifyPrompt } = await import("../mastra/workflows/workflow-classify-prompt.js");
  const args = { prompt: "fix the auth flow" };
  const run = await workflowClassifyPrompt.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.equal(typeof started.result.category, "string");
  assert.equal(typeof started.result.confidence, "number");
  assert.ok(Array.isArray(started.result.suggested_tools));
});

// Deep-equal structural parity. Locks the field set against future
// regressions; shape-only assertions above would miss a field drop.
test("workflow-classify-prompt: deep-equal structural parity", async () => {
  const { workflowClassifyPrompt } = await import("../mastra/workflows/workflow-classify-prompt.js");
  const run = await workflowClassifyPrompt.createRun();
  const started = await run.start({ inputData: { prompt: "evidence verified" } });
  const expected = {
    category: "evidence",
    confidence: started.result.confidence,
    suggested_tools: ["validate_records"],
  };
  assert.deepStrictEqual(started.result, expected);
});

test("workflow-prepare-runtime-request: direct parity matches legacy handler", async () => {
  const { workflowPrepareRuntimeRequest } = await import("../mastra/workflows/workflow-prepare-runtime-request.js");
  const args = {
    dimension: "runtime",
    scope: "sandbox",
    output_level: "summary",
    command_class: "test",
    temp_root_class: "disposable",
    evidence_missing: false,
    why_local_insufficient: "needs real container",
  };
  const run = await workflowPrepareRuntimeRequest.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.equal(typeof started.result.approval_request, "string");
  assert.ok(Array.isArray(started.result.pre_conditions));
});

// Regression: legacy handler tolerated missing evidence_missing and
// why_local_insufficient (JS coercion / template literal). The new Zod-validated
// schema must allow the same. See review-260619-1429-GH-1911 finding #1.
test("workflow-prepare-runtime-request: tolerates missing evidence_missing/why_local_insufficient (legacy semantics)", async () => {
  const { workflowPrepareRuntimeRequest } = await import("../mastra/workflows/workflow-prepare-runtime-request.js");
  const args = {
    dimension: "runtime",
    scope: "sandbox",
    output_level: "summary",
    command_class: "test",
    temp_root_class: "disposable",
    // evidence_missing and why_local_insufficient omitted
  };
  const run = await workflowPrepareRuntimeRequest.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success", "must succeed when optional fields are omitted");
  const evidencePre = started.result.pre_conditions.find((c) => c.name === "evidence_present");
  assert.ok(evidencePre, "evidence_present precondition must exist");
  assert.strictEqual(evidencePre.pass, true, "missing evidence_missing → pass (legacy: !undefined === true)");
});

test("workflow-self-improvement: direct parity matches legacy handler", async () => {
  const { workflowSelfImprovement } = await import("../mastra/workflows/workflow-self-improvement.js");
  const args = {
    improvement_type: "schema-change",
    description: "Add validation to schema",
    proposed_changes: ["add zod schema"],
  };
  const run = await workflowSelfImprovement.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.equal(started.result.experiment_candidate, "runtime-schema-validation-experiment");
  assert.equal(started.result.decision_required, true);
  assert.ok(Array.isArray(started.result.risks));
});

test("workflow-intentional-skip: direct parity matches legacy handler", async () => {
  const { workflowIntentionalSkip } = await import("../mastra/workflows/workflow-intentional-skip.js");
  const args = {
    assertion_id: "assert-1",
    skip_reason: "not needed for this release",
    scope: "docs",
  };
  const run = await workflowIntentionalSkip.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.equal(started.result.status, "narrowed");
  assert.ok(Array.isArray(started.result.records_required));
  assert.equal(typeof started.result.rationale, "string");
});

// Deep-equal structural parity: locks rationale format and the
// blocked_work/allowed_work shape against regressions.
test("workflow-intentional-skip: deep-equal structural parity", async () => {
  const { workflowIntentionalSkip } = await import("../mastra/workflows/workflow-intentional-skip.js");
  const run = await workflowIntentionalSkip.createRun();
  const started = await run.start({
    inputData: { assertion_id: "assert-1", skip_reason: "not needed", scope: "docs" },
  });
  const expected = {
    status: "narrowed",
    records_required: ["record_observation: assertion assert-1 skipped — not needed"],
    blocked_work: [],
    allowed_work: ["other assertions not depending on assert-1"],
    rationale: 'Skip narrowed to minor scope "docs"; capture loop artifact and continue.',
  };
  assert.deepStrictEqual(started.result, expected);
});

test("workflow-report-phase-status: direct parity matches legacy handler", async () => {
  const { workflowReportPhaseStatus } = await import("../mastra/workflows/workflow-report-phase-status.js");
  const args = {
    process_steps_total: 5,
    process_steps_complete: 3,
    experiment_result: "success",
  };
  const run = await workflowReportPhaseStatus.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.equal(typeof started.result.status, "string");
  assert.equal(typeof started.result.lifecycle_complete, "boolean");
});

test("workflow-classify-prompt: deep-equal structural parity", async () => {
  const { workflowClassifyPrompt } = await import("../mastra/workflows/workflow-classify-prompt.js");
  const run = await workflowClassifyPrompt.createRun();
  const started = await run.start({ inputData: { prompt: "evidence verified" } });
  const expected = {
    category: "evidence",
    confidence: started.result.confidence,
    suggested_tools: ["validate_records"],
  };
  assert.deepStrictEqual(started.result, expected);
});

test("workflow-prepare-runtime-request: deep-equal structural parity", async () => {
  const { workflowPrepareRuntimeRequest } = await import("../mastra/workflows/workflow-prepare-runtime-request.js");
  const args = {
    dimension: "runtime",
    scope: "sandbox",
    output_level: "summary",
    command_class: "test",
    temp_root_class: "disposable",
    evidence_missing: false,
    why_local_insufficient: "needs real container",
  };
  const run = await workflowPrepareRuntimeRequest.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.equal(started.result.approval_request.includes("Runtime Command Approval Request"), true);
  assert.equal(started.result.pre_conditions.length, 4);
  assert.deepStrictEqual(started.result.pre_conditions, [
    { name: "evidence_present", pass: true, reason: "Evidence collected." },
    { name: "observation_active", pass: true, reason: "scope is not production; observation check relaxed." },
    { name: "temp_root_safe", pass: true, reason: "Temp root is safe for runtime." },
    { name: "command_allowed", pass: true, reason: "Run check_gate to validate command against allowlist." },
  ]);
});

test("workflow-self-improvement: deep-equal structural parity", async () => {
  const { workflowSelfImprovement } = await import("../mastra/workflows/workflow-self-improvement.js");
  const args = {
    improvement_type: "schema-change",
    description: "Add validation to schema",
    proposed_changes: ["add zod schema"],
  };
  const run = await workflowSelfImprovement.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.deepStrictEqual(started.result, {
    experiment_candidate: "runtime-schema-validation-experiment",
    decision_required: true,
    risks: [
      "Canonical adoption requires explicit operator decision approval.",
      "Hard-test failures must be captured as evidence before promotion.",
    ],
    next_steps: ["draft experiment record", "seek operator approval", "run validation"],
    canonical_adoption_path: "operator-approval → schema-draft → validate → migrate",
    description: "Add validation to schema",
    proposed_changes: ["add zod schema"],
  });
});

test("workflow-report-phase-status: deep-equal structural parity", async () => {
  const { workflowReportPhaseStatus } = await import("../mastra/workflows/workflow-report-phase-status.js");
  const args = {
    process_steps_total: 5,
    process_steps_complete: 3,
    experiment_result: "success",
  };
  const run = await workflowReportPhaseStatus.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.deepStrictEqual(started.result, {
    status: "Process: 3/5. Experiment: success.",
    lifecycle_complete: false,
  });
});

test("workflow-runtime-probe: deep-equal structural parity", async () => {
  const { workflowRuntimeProbe } = await import("../mastra/workflows/workflow-runtime-probe.js");
  const args = {
    stack: "nodejs",
    probe_type: "test",
  };
  const run = await workflowRuntimeProbe.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.equal(started.result.probe_plan.includes("Stack: nodejs"), true);
  assert.deepStrictEqual(started.result.shared_env_requirements, [
    "GATE_NAME_LIVE_GATE=open (operator sets after confirmation)",
    "operator decision record documenting allowed_actions and blocked_actions",
  ]);
  assert.deepStrictEqual(started.result.per_stack_commands, [
    "node --version",
    "npm install",
    "npm test",
  ]);
  assert.deepStrictEqual(started.result.expected_outputs, ["v", "added", "passing"]);
});

// ─── Envelope-form input tests (Phase 3) ───
// Proves stripEnvelope handles MCP envelope form when agent callers wrap input.

test("workflow_self_improvement handles envelope-form input", async () => {
  const { workflowSelfImprovement } = await import("../mastra/workflows/workflow-self-improvement.js");
  const rawInput = {
    improvement_type: "schema-change",
    description: "Add validation to schema",
    proposed_changes: ["add zod schema"],
  };
  const envelopeInput = {
    content: [{ type: "text", text: JSON.stringify(rawInput) }],
  };
  const run = await workflowSelfImprovement.createRun();
  const started = await run.start({ inputData: envelopeInput });
  assert.equal(started.status, "success");
  assert.deepStrictEqual(started.result, {
    experiment_candidate: "runtime-schema-validation-experiment",
    decision_required: true,
    risks: [
      "Canonical adoption requires explicit operator decision approval.",
      "Hard-test failures must be captured as evidence before promotion.",
    ],
    next_steps: ["draft experiment record", "seek operator approval", "run validation"],
    canonical_adoption_path: "operator-approval → schema-draft → validate → migrate",
    description: "Add validation to schema",
    proposed_changes: ["add zod schema"],
  });
});
