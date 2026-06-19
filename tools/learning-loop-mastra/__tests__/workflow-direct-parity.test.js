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

// Helper: compare workflow result to legacy handler result.
// The workflow result is the inner JSON (envelope stripped by adapter).
// The legacy handler returns { content: [{ type: "text", text: JSON.stringify(result) }] }.
function legacyToResult(legacyOutput) {
  if (legacyOutput && typeof legacyOutput === "object" && Array.isArray(legacyOutput.content)) {
    return JSON.parse(legacyOutput.content[0].text);
  }
  return legacyOutput;
}

test("workflow-intake-orient: direct parity matches legacy handler", async () => {
  const { workflowIntakeOrient } = await import("../workflows/workflow-intake-orient.js");
  const tempRoot = makeTempRoot();
  writeYaml(tempRoot, "records/meta/index/test.yaml", { id: "test", dimension: "product", capability: "auth" });

  const prevGateRoot = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const args = { root: tempRoot };
    const run = await workflowIntakeOrient.createRun();
    const started = await run.start({ inputData: args });
    assert.equal(started.status, "success");
    assert.ok(started.result, "result must exist");
    assert.ok(Array.isArray(started.result.index_entries), "index_entries must be array");
    assert.ok(Array.isArray(started.result.meta_triggers), "meta_triggers must be array");
  } finally {
    if (prevGateRoot === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = prevGateRoot;
  }
});

test("workflow-intake-plan: direct parity matches legacy handler", async () => {
  const { workflowIntakePlan } = await import("../workflows/workflow-intake-plan.js");
  const orientResult = {
    index_entries: [{ id: "test", dimension: "runtime", scope: "container" }],
    meta_triggers: ["trigger1"],
    observations: [],
    capability_files: [],
    missing_decisions: [],
  };
  const args = { orient_result: orientResult };
  const run = await workflowIntakePlan.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.equal(started.result.status, "ready");
  assert.ok(Array.isArray(started.result.steps), "steps must be array");
  assert.ok(started.result.steps.length > 0, "must have at least one step");
});

test("workflow-classify-prompt: direct parity matches legacy handler", async () => {
  const { workflowClassifyPrompt } = await import("../workflows/workflow-classify-prompt.js");
  const args = { prompt: "fix the auth flow" };
  const run = await workflowClassifyPrompt.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.equal(typeof started.result.category, "string");
  assert.equal(typeof started.result.confidence, "number");
  assert.ok(Array.isArray(started.result.suggested_tools));
});

// Deep-equal structural parity using legacyToResult. Locks the field set
// against future regressions; shape-only assertions above would miss a
// field drop. Add per-workflow coverage in Plan 1a.
test("workflow-classify-prompt: deep-equal structural parity", async () => {
  const { workflowClassifyPrompt } = await import("../workflows/workflow-classify-prompt.js");
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
  const { workflowPrepareRuntimeRequest } = await import("../workflows/workflow-prepare-runtime-request.js");
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
  const { workflowPrepareRuntimeRequest } = await import("../workflows/workflow-prepare-runtime-request.js");
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
  const { workflowSelfImprovement } = await import("../workflows/workflow-self-improvement.js");
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
  const { workflowIntentionalSkip } = await import("../workflows/workflow-intentional-skip.js");
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
  const { workflowIntentionalSkip } = await import("../workflows/workflow-intentional-skip.js");
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
  const { workflowReportPhaseStatus } = await import("../workflows/workflow-report-phase-status.js");
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

test("workflow-runtime-probe: direct parity matches legacy handler", async () => {
  const { workflowRuntimeProbe } = await import("../workflows/workflow-runtime-probe.js");
  const args = {
    stack: "nodejs",
    probe_type: "test",
  };
  const run = await workflowRuntimeProbe.createRun();
  const started = await run.start({ inputData: args });
  assert.equal(started.status, "success");
  assert.equal(typeof started.result.probe_plan, "string");
  assert.ok(Array.isArray(started.result.shared_env_requirements));
  assert.ok(Array.isArray(started.result.per_stack_commands));
  assert.ok(Array.isArray(started.result.expected_outputs));
});
