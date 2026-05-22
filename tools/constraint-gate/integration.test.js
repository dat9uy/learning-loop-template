import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), "gate-integration-test-"));
}

async function startServer(root) {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["tools/constraint-gate/server.js"],
    env: { ...process.env, GATE_ROOT: root },
  });
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(transport);
  return { client, transport };
}

describe("Integration: all 31 tools", () => {
  it("lists all 31 expected tools", async () => {
    const tmp = createTmpDir();
    mkdirSync(join(tmp, "records", "observations"), { recursive: true });
    const { client, transport } = await startServer(tmp);
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name);
      const expected = [
        "check_gate",
        "record_observation",
        "update_observation",
        "notify_artifact_change",
        "trigger_workflow",
        "validate_records",
        "update_claim_verification",
        "extract_index_entries",
        "search_index_entries",
        "generate_capability_records",
        "list_runtime_probes",
        "list_verified_claims",
        "workflow_classify_prompt",
        "workflow_intake_orient",
        "workflow_intake_plan",
        "workflow_prepare_runtime_request",
        "workflow_convert_evidence",
        "workflow_generate_prompt",
        "workflow_intentional_skip",
        "workflow_verify_evidence",
        "workflow_external_decision",
        "workflow_self_improvement",
        "workflow_report_phase_status",
        "workflow_product_build",
        "workflow_runtime_probe",
        "create_decision_record",
        "update_decision_record",
        "create_experiment_record",
        "update_experiment_record",
        "create_risk_record",
        "update_risk_record",
      ];
      for (const name of expected) {
        assert.ok(names.includes(name), `Missing tool: ${name}`);
      }
      assert.equal(names.length, 31, `Expected 31 tools, got ${names.length}: ${names.join(", ")}`);
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("round-trip: check_gate returns decision", async () => {
    const tmp = createTmpDir();
    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({ name: "check_gate", arguments: { command: "ls" } });
      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.decision, "ok");
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("round-trip: list_verified_claims returns structured data", async () => {
    const tmp = createTmpDir();
    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({ name: "list_verified_claims", arguments: {} });
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(parsed.claims));
      assert.ok(Array.isArray(parsed.evidence));
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });
});
