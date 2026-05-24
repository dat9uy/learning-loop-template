import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createDecision } from "./decision-writer.js";

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), "gate-mcp-integration-"));
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

/**
 * Run the write coordination gate as a subprocess with the given input.
 * Returns the parsed JSON output or null if exit 0 (allow).
 */
function runWriteGate(filePath, toolName = "Write") {
  return new Promise((resolve) => {
    const input = JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath, content: "test" } });
    const child = spawn("node", [".claude/coordination/hooks/write-coordination-gate.cjs"], {
      env: { ...process.env, GATE_ROOT: "/tmp/fake-root-for-gate-test" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ exitCode: 0, decision: "allow" });
      } else if (code === 2 && stdout.trim()) {
        try {
          resolve({ exitCode: 2, ...JSON.parse(stdout.trim()) });
        } catch {
          resolve({ exitCode: 2, raw: stdout.trim() });
        }
      } else {
        resolve({ exitCode: code, stderr: stderr.trim(), stdout: stdout.trim() });
      }
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

describe("Gate-MCP integration: records/** blocked, MCP creates records, gate allows product/**", () => {
  const tmp = createTmpDir();
  let client, transport;

  before(async () => {
    mkdirSync(join(tmp, "records", "observations"), { recursive: true });
    mkdirSync(join(tmp, "product", "api"), { recursive: true });
    mkdirSync(join(tmp, "plans"), { recursive: true });
    mkdirSync(join(tmp, "docs"), { recursive: true });
    const server = await startServer(tmp);
    client = server.client;
    transport = server.transport;
  });

  after(async () => {
    await transport.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("gate blocks direct Write to records/**", async () => {
    const result = await runWriteGate("/tmp/fake-root-for-gate-test/records/product/decisions/test.yaml");
    assert.equal(result.exitCode, 2);
    assert.equal(result.decision, "block");
    assert.ok(result.reason.includes("MCP tools"));
  });

  it("gate blocks direct Write to records/observations/**", async () => {
    const result = await runWriteGate("/tmp/fake-root-for-gate-test/records/observations/obs-test.yaml");
    assert.equal(result.exitCode, 2);
    assert.equal(result.decision, "block");
  });

  it("gate blocks direct Edit to records/**", async () => {
    const result = await runWriteGate("/tmp/fake-root-for-gate-test/records/product/decisions/test.yaml", "Edit");
    assert.equal(result.exitCode, 2);
    assert.equal(result.decision, "block");
  });

  it("MCP create_decision_record creates a file via server", async () => {
    const result = await client.callTool({
      name: "create_decision_record",
      arguments: { surface: "product", question: "Use MCP for records?", decision: "Yes, MCP owns all CRUD" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.created, true);
    assert.ok(parsed.id.startsWith("decision-product-"));
    assert.ok(existsSync(parsed.path));
    const content = parseYaml(readFileSync(parsed.path, "utf8"));
    assert.equal(content.type, "decision");
    assert.equal(content.status, "draft");
    assert.equal(content.question, "Use MCP for records?");
    assert.equal(content.decision, "Yes, MCP owns all CRUD");
  });

  it("MCP create_experiment_record creates a file via server", async () => {
    const result = await client.callTool({
      name: "create_experiment_record",
      arguments: { surface: "product", goal: "Verify MCP CRUD round-trips" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.created, true);
    assert.ok(parsed.id.startsWith("experiment-product-"));
  });

  it("MCP create_risk_record creates a file via server", async () => {
    const result = await client.callTool({
      name: "create_risk_record",
      arguments: { surface: "product", risk_statement: "MCP server could crash on invalid input", category: "runtime" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.created, true);
    assert.ok(parsed.id.startsWith("risk-product-"));
  });

  it("MCP update_decision_record updates an existing record", async () => {
    // Create first
    const createResult = await client.callTool({
      name: "create_decision_record",
      arguments: { surface: "api", question: "Q?", decision: "D" },
    });
    const created = JSON.parse(createResult.content[0].text);
    assert.equal(created.created, true);

    // Update
    const updateResult = await client.callTool({
      name: "update_decision_record",
      arguments: { surface: "api", decision_id: created.id, status: "approved" },
    });
    const updated = JSON.parse(updateResult.content[0].text);
    assert.equal(updated.updated, true);

    // Verify on disk
    const content = parseYaml(readFileSync(updated.path, "utf8"));
    assert.equal(content.status, "approved");
  });

  it("gate allows product/** after preflight marker exists", async () => {
    // Create preflight marker for "product" surface (gate runs against /tmp/fake-root)
    const gateRoot = "/tmp/fake-root-for-gate-test";
    const coordDir = join(gateRoot, ".claude", "coordination");
    mkdirSync(coordDir, { recursive: true });
    writeFileSync(join(coordDir, ".loop-preflight-product"), JSON.stringify({ surface: "product", completed_at: new Date().toISOString() }));

    const result = await runWriteGate(`${gateRoot}/product/api/src/index.ts`);
    assert.equal(result.exitCode, 0);
    assert.equal(result.decision, "allow");
  });

  it("gate allows docs/journals/** unconditionally", async () => {
    const result = await runWriteGate("/tmp/fake-root-for-gate-test/docs/journals/test.md");
    assert.equal(result.exitCode, 0);
  });

  it("gate allows plans/** unconditionally", async () => {
    const result = await runWriteGate("/tmp/fake-root-for-gate-test/plans/test/plan.md");
    assert.equal(result.exitCode, 0);
  });

  it("gate blocks schemas/**", async () => {
    const result = await runWriteGate("/tmp/fake-root-for-gate-test/schemas/test.schema.json");
    assert.equal(result.exitCode, 2);
    assert.equal(result.decision, "block");
  });

  it("server lists 32 tools including new CRUD tools", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    assert.ok(names.includes("create_decision_record"), "Missing create_decision_record");
    assert.ok(names.includes("update_decision_record"), "Missing update_decision_record");
    assert.ok(names.includes("create_experiment_record"), "Missing create_experiment_record");
    assert.ok(names.includes("update_experiment_record"), "Missing update_experiment_record");
    assert.ok(names.includes("create_risk_record"), "Missing create_risk_record");
    assert.ok(names.includes("update_risk_record"), "Missing update_risk_record");
    assert.ok(names.includes("mark_preflight_complete"), "Missing mark_preflight_complete");
    assert.equal(names.length, 33, `Expected 33 tools, got ${names.length}`);
  });
});
