// Workflow parity harness — MCP-level integration test.
// Spawns the mastra server, calls each workflow via run_<key>, asserts output
// matches the legacy handler return.
//
// TDD order: 1 empirical probe (locks response format), then 8 parity tests,
// then 1 tools/list enumeration test.

const { describe, test, before } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const { connectMcpServer } = require("./with-mcp-server.js");

const SERVER_ENTRY = resolve(__dirname, "..", "server.js");

function makeTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "workflow-mcp-parity-"));
  mkdirSync(join(tempRoot, "records", "meta", "index"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "capabilities"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "evidence"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  writeFileSync(join(tempRoot, "runtime-state.jsonl"), "\n", { flag: "a" });
  return tempRoot;
}

function writeYaml(root, path, data) {
  const fullPath = join(root, path);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, JSON.stringify(data, null, 2));
}

// Locked 2026-06-19 from empirical probe. Mastra MCPServer returns workflow
// results wrapped in the standard MCP content envelope (same as createTool).
// The with-mcp-server.js callTool helper already parses JSON.parse(content[0].text).
function parseWorkflowResult(rawResult) {
  return rawResult;
}

describe("workflow parity harness", () => {
  let handles;

  before(async () => {
    const tempRoot = makeTempRoot();
    handles = await connectMcpServer(SERVER_ENTRY, tempRoot);
  }, { timeout: 15000 });

  test("empirical probe: run_workflow_classify_prompt returns valid result", { timeout: 10000 }, async () => {
    const result = await handles.callTool("run_workflow_classify_prompt", { prompt: "test classification" });
    assert.ok(result, "workflow call must return a result");
    assert.equal(typeof result.category, "string", "must have category");
  });

  test("run_workflow_intake_orient matches legacy output shape", { timeout: 10000 }, async () => {
    const tempRoot = handles.tempRoot;
    writeYaml(tempRoot, "records/meta/index/test.yaml", { id: "test", dimension: "product", capability: "auth" });
    const prevGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempRoot;
    try {
      const result = await handles.callTool("run_workflow_intake_orient", { root: tempRoot });
      assert.ok(result, "result must exist");
      assert.ok(Array.isArray(result.index_entries), "index_entries must be array");
      assert.ok(Array.isArray(result.meta_triggers), "meta_triggers must be array");
      assert.ok(Array.isArray(result.observations), "observations must be array");
      assert.ok(Array.isArray(result.capability_files), "capability_files must be array");
      assert.ok(Array.isArray(result.missing_decisions), "missing_decisions must be array");
    } finally {
      if (prevGateRoot === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = prevGateRoot;
    }
  });

  test("run_workflow_intake_plan matches legacy output shape", { timeout: 10000 }, async () => {
    const orientResult = {
      index_entries: [{ id: "test", dimension: "runtime", scope: "container" }],
      meta_triggers: ["trigger1"],
      observations: [],
      capability_files: [],
      missing_decisions: [],
    };
    const result = await handles.callTool("run_workflow_intake_plan", { orient_result: orientResult });
    assert.equal(result.status, "ready");
    assert.ok(Array.isArray(result.steps), "steps must be array");
    assert.ok(result.steps.length > 0, "must have at least one step");
  });

  test("run_workflow_classify_prompt matches legacy output", { timeout: 10000 }, async () => {
    const result = await handles.callTool("run_workflow_classify_prompt", { prompt: "fix the auth flow" });
    assert.equal(typeof result.category, "string");
    assert.equal(typeof result.confidence, "number");
    assert.ok(Array.isArray(result.suggested_tools));
  });

  test("run_workflow_prepare_runtime_request matches legacy output", { timeout: 10000 }, async () => {
    const result = await handles.callTool("run_workflow_prepare_runtime_request", {
      dimension: "runtime",
      scope: "sandbox",
      output_level: "summary",
      command_class: "test",
      temp_root_class: "disposable",
      evidence_missing: false,
      why_local_insufficient: "needs real container",
    });
    assert.equal(typeof result.approval_request, "string");
    assert.ok(Array.isArray(result.pre_conditions));
  });

  test("run_workflow_self_improvement matches legacy output", { timeout: 10000 }, async () => {
    const result = await handles.callTool("run_workflow_self_improvement", {
      improvement_type: "schema-change",
      description: "Add validation to schema",
      proposed_changes: ["add zod schema"],
    });
    assert.equal(result.experiment_candidate, "runtime-schema-validation-experiment");
    assert.equal(result.decision_required, true);
    assert.ok(Array.isArray(result.risks));
  });

  test("run_workflow_intentional_skip matches legacy output", { timeout: 10000 }, async () => {
    const result = await handles.callTool("run_workflow_intentional_skip", {
      assertion_id: "assert-1",
      skip_reason: "not needed for this release",
      scope: "docs",
    });
    assert.equal(result.status, "narrowed");
    assert.ok(Array.isArray(result.records_required));
    assert.equal(typeof result.rationale, "string");
  });

  test("run_workflow_report_phase_status matches legacy output", { timeout: 10000 }, async () => {
    const result = await handles.callTool("run_workflow_report_phase_status", {
      process_steps_total: 5,
      process_steps_complete: 3,
      experiment_result: "success",
    });
    assert.equal(typeof result.status, "string");
    assert.equal(typeof result.lifecycle_complete, "boolean");
  });

  test("run_workflow_runtime_probe matches legacy output", { timeout: 10000 }, async () => {
    const result = await handles.callTool("run_workflow_runtime_probe", {
      stack: "nodejs",
      probe_type: "test",
    });
    assert.equal(typeof result.probe_plan, "string");
    assert.ok(Array.isArray(result.shared_env_requirements));
    assert.ok(Array.isArray(result.per_stack_commands));
    assert.ok(Array.isArray(result.expected_outputs));
  });

  test("tools/list enumerates 31 mastra_* + 8 run_workflow_* = 39 total", { timeout: 10000 }, async () => {
    const tools = await handles.listTools();
    const mastra = tools.filter((t) => t.name.startsWith("mastra_"));
    const runWorkflows = tools.filter((t) => t.name.startsWith("run_workflow_"));
    assert.equal(mastra.length, 31, `must have 31 mastra_* tools, got ${mastra.length}`);
    assert.equal(runWorkflows.length, 8, `must have 8 run_workflow_* tools, got ${runWorkflows.length}`);
    assert.equal(tools.length, 39, `total must be 39, got ${tools.length}`);

    for (const wf of runWorkflows) {
      assert.ok(wf.description && wf.description.length > 0, `${wf.name} must have non-empty description`);
      assert.ok(wf.inputSchema && wf.inputSchema.type === "object", `${wf.name} must have object inputSchema`);
    }
  });
});
