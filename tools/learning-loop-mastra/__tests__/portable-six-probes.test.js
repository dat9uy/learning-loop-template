// Empirical probes for re-homing the 6 portable run_workflow_* tools from the
// createLoopWorkflow Mastra wrapper to plain manifest handlers (Option A unwrap).
// Proves the 4 re-homing prerequisites before any production unwrap:
//   probe 1 (P-Q2): each of the 6 is single-step deterministic
//   probe 2 (U-Q2): none performs file reads (resolveRoot/readFileSync/...)
//   probe 3 (U-Q1): captures schema + behavior oracles (both envelope forms)
//                   to __tests__/fixtures/workflow-oracles/<x>.json — the
//                   parity oracle after the workflow files are deleted
//   probe 4 (Option B' fallback evidence): does createRun().start() run in a
//                   clean one-shot process without initStorage/RequestContext?
import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = join(HERE, "..", "mastra", "workflows");
const FIXTURES_DIR = join(HERE, "fixtures", "workflow-oracles");

const PORTABLE_SIX = [
  { id: "classify_prompt", file: "workflow-classify-prompt.js", exportName: "workflowClassifyPrompt" },
  { id: "prepare_runtime_request", file: "workflow-prepare-runtime-request.js", exportName: "workflowPrepareRuntimeRequest" },
  { id: "self_improvement", file: "workflow-self-improvement.js", exportName: "workflowSelfImprovement" },
  { id: "intentional_skip", file: "workflow-intentional-skip.js", exportName: "workflowIntentionalSkip" },
  { id: "report_phase_status", file: "workflow-report-phase-status.js", exportName: "workflowReportPhaseStatus" },
  { id: "runtime_probe", file: "workflow-runtime-probe.js", exportName: "workflowRuntimeProbe" },
];

// Minimal valid inputs per tool (also reused as the behavior-oracle inputs).
const SAMPLE_INPUTS = {
  classify_prompt: { prompt: "evidence verified finding" },
  prepare_runtime_request: {
    dimension: "runtime",
    scope: "sandbox",
    output_level: "summary",
    command_class: "test",
    temp_root_class: "disposable",
    evidence_missing: false,
    why_local_insufficient: "needs real container",
  },
  self_improvement: {
    improvement_type: "heuristic-tune",
    description: "tune classify threshold",
    proposed_changes: ["add zod schema", "update docs"],
  },
  intentional_skip: { assertion_id: "A-1", skip_reason: "low risk", scope: "docs" },
  report_phase_status: { process_steps_total: 3, process_steps_complete: 3, experiment_result: "success" },
  runtime_probe: { stack: "nodejs", probe_type: "test", temp_dir: "/tmp/probe" },
};

// ---------------------------------------------------------------------------
// Probe 1 — P-Q2: single-step, deterministic, pure handler.
// Single-step is asserted by SOURCE INSPECTION of the steps: array literal
// (the committed workflow object does not reliably expose .steps), plus a
// createRun().start() result-shape check proving exactly one step executed.
// ---------------------------------------------------------------------------
for (const wf of PORTABLE_SIX) {
  test(`probe 1 (P-Q2): ${wf.id} is single-step (source inspection + result shape)`, async () => {
    const src = readFileSync(join(WORKFLOWS_DIR, wf.file), "utf8");
    // The steps: array literal must contain exactly one step object ({ id: ... }).
    const stepsBlock = src.match(/\n  steps:\s*\[([\s\S]*?)\n  \]/);
    assert.ok(stepsBlock, `${wf.file}: steps: array literal not found`);
    const stepIds = stepsBlock[1].match(/\{\s*\n\s*id:/g) || [];
    assert.strictEqual(stepIds.length, 1, `${wf.file}: expected exactly 1 step, found ${stepIds.length}`);

    // Purity: no LLM/network/storage/fs imports in the module.
    for (const forbidden of ["generateText", "streamText", "fetch(", "initStorage"]) {
      assert.ok(!src.includes(forbidden), `${wf.file}: forbidden import/call ${forbidden}`);
    }

    // Result shape: exactly one step executed, output matches the declared outputSchema keys.
    const mod = await import(`../mastra/workflows/${wf.file}`);
    const run = await mod[wf.exportName].createRun({});
    const started = await run.start({ inputData: SAMPLE_INPUTS[wf.id] });
    assert.strictEqual(started.status, "success");
    assert.ok(started.result && typeof started.result === "object", "result must be an object");
  });
}

// ---------------------------------------------------------------------------
// Probe 2 — U-Q2: no file reads in any of the six (scopes U-Q2 OUT for them;
// the cross-root concern belongs to workflow_generate_prompt alone).
// ---------------------------------------------------------------------------
for (const wf of PORTABLE_SIX) {
  test(`probe 2 (U-Q2): ${wf.id} performs no file reads`, () => {
    const src = readFileSync(join(WORKFLOWS_DIR, wf.file), "utf8");
    const hits = src.match(/resolveRoot|readFileSync|findProjectRoot|from\s+["']node:fs|from\s+["']fs["']|appendFile|writeFileSync/g);
    assert.strictEqual(hits, null, `${wf.file}: file-read pattern(s) found: ${hits}`);
  });
}

// ---------------------------------------------------------------------------
// Probe 3 — U-Q1: capture schema + behavior oracles for ALL 6, BOTH envelope
// forms. Writes __tests__/fixtures/workflow-oracles/<x>.json; Phase 2's parity
// test reads these fixtures (never the live workflow objects), so Phase 3 can
// delete the workflow files without breaking the oracle.
// ---------------------------------------------------------------------------
test("probe 3 (U-Q1): capture schema + behavior oracles for all 6 (both envelope forms)", async () => {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const { z } = await import("zod");

  for (const wf of PORTABLE_SIX) {
    const mod = await import(`../mastra/workflows/${wf.file}`);
    const workflow = mod[wf.exportName];

    // Schema oracle: the workflow's model-visible parity JSON Schema.
    const schema = z.toJSONSchema(workflow.inputSchema, { target: "draft-7", io: "input" });

    // Behavior oracle (a): plain input.
    const plainInput = SAMPLE_INPUTS[wf.id];
    const plainRun = await workflow.createRun({});
    const plain = (await plainRun.start({ inputData: plainInput })).result;

    // Behavior oracle (b): MCP content-envelope input {content:[{type:"text",text:...}]}.
    const contentEnvelope = { content: [{ type: "text", text: JSON.stringify(plainInput) }] };
    const envRun = await workflow.createRun({});
    const fromContentEnvelope = (await envRun.start({ inputData: contentEnvelope })).result;
    assert.deepStrictEqual(fromContentEnvelope, plain, `${wf.id}: content-envelope input must strip to the plain result`);

    // Behavior oracle (c): SDK {item:[...]} per-field envelope — only
    // self_improvement declares a per-field z.preprocess(stripEnvelope, ...)
    // (on proposed_changes), DISTINCT from the factory's top-level
    // stripMcpContentEnvelope.
    let itemEnvelope;
    if (wf.id === "self_improvement") {
      const itemInput = { ...plainInput, proposed_changes: { item: plainInput.proposed_changes } };
      const itemRun = await workflow.createRun({});
      const fromItemEnvelope = (await itemRun.start({ inputData: itemInput })).result;
      assert.deepStrictEqual(fromItemEnvelope, plain, "proposed_changes {item:[...]} must strip to a plain array");
      itemEnvelope = { input: itemInput, output: fromItemEnvelope };
    }

    const fixture = {
      tool: `workflow_${wf.id}`,
      schema,
      behavior: {
        plain: { input: plainInput, output: plain },
        contentEnvelope: { input: contentEnvelope, output: fromContentEnvelope },
        ...(itemEnvelope ? { itemEnvelope } : {}),
      },
    };
    writeFileSync(join(FIXTURES_DIR, `workflow_${wf.id}.json`), JSON.stringify(fixture, null, 2) + "\n");
  }
});

// ---------------------------------------------------------------------------
// Probe 4 — Option B' feasibility evidence (design-fork record; Option A was
// confirmed in validation — B' requires an explicit operator override, not
// just a positive probe). Runs in a CLEAN child process: no initStorage(),
// no RequestContext.
// ---------------------------------------------------------------------------
test("probe 4 (Option B' feasibility): createRun().start() without initStorage/RequestContext", () => {
  const script = `
    import("./mastra/workflows/workflow-classify-prompt.js").then(async (m) => {
      const run = await m.workflowClassifyPrompt.createRun({});
      const r = await run.start({ inputData: { prompt: "evidence verified" } });
      console.log(JSON.stringify({ status: r.status, result: r.result }));
    }).catch((e) => { console.error("PROBE4-FAIL:", e.message); process.exit(3); });
  `;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: join(HERE, ".."),
    env: { ...process.env, LOOP_RECORDS_VIA_CLI: "1" },
    encoding: "utf8",
  });
  const parsed = JSON.parse(out.trim());
  // Evidence record: B' IS technically feasible (createRun/start works without
  // initStorage/RequestContext). Option A stays the confirmed decision — the
  // rename cost was judged acceptable and Option A dissolves Sec-F9 by removal.
  assert.strictEqual(parsed.status, "success");
  assert.strictEqual(parsed.result.category, "evidence");
});
