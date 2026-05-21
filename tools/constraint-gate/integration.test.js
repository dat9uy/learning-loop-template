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

describe("Integration: all 12 tools", () => {
  it("lists all 12 expected tools", async () => {
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
      ];
      for (const name of expected) {
        assert.ok(names.includes(name), `Missing tool: ${name}`);
      }
      assert.equal(names.length, 12, `Expected 12 tools, got ${names.length}: ${names.join(", ")}`);
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
