import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), "gate-server-test-"));
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

describe("MCP server check_gate tool", () => {
  it("returns ok for unconstrained command", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    mkdirSync(coordDir, { recursive: true });
    writeFileSync(
      join(coordDir, "coordination-config.json"),
      JSON.stringify({ version: "1.0", profiles: {} })
    );

    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({ name: "check_gate", arguments: { command: "ls -la" } });
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      assert.equal(parsed.decision, "ok");
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns block when constraint matched but no observation", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(coordDir, { recursive: true });
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(coordDir, "coordination-config.json"),
      JSON.stringify({ version: "1.0", profiles: {} })
    );

    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({
        name: "check_gate",
        arguments: { command: "docker run ubuntu" },
      });
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      assert.equal(parsed.decision, "block");
      assert.equal(parsed.observation_required, true);
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns ok when constraint matched and observation exists", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(coordDir, { recursive: true });
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(coordDir, "coordination-config.json"),
      JSON.stringify({ version: "1.0", profiles: {} })
    );
    writeFileSync(
      join(obsDir, "observation-sudo.yaml"),
      `id: obs-sudo\nconstraint_type: sudo\nstatus: active\nnotes: test`
    );

    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({
        name: "check_gate",
        arguments: { command: "sudo chown root file" },
      });
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      assert.equal(parsed.decision, "ok");
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("lists check_gate as available tool", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    mkdirSync(coordDir, { recursive: true });
    writeFileSync(
      join(coordDir, "coordination-config.json"),
      JSON.stringify({ version: "1.0", profiles: {} })
    );

    const { client, transport } = await startServer(tmp);
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name);
      assert.ok(names.includes("check_gate"), "check_gate tool registered");
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("MCP server record_observation tool", () => {
  it("records observation and creates file", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(coordDir, { recursive: true });
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(coordDir, "coordination-config.json"),
      JSON.stringify({ version: "1.0", profiles: {} })
    );

    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({
        name: "record_observation",
        arguments: {
          constraint_type: "docker",
          constraint: "stale-mount",
          description: "Docker stale mount blocks volume updates",
          source_refs: ["record:test-123"],
        },
      });
      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.recorded, true);
      assert.ok(parsed.id.startsWith("obs-"));
      assert.ok(existsSync(parsed.path));
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects duplicate observation", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(coordDir, { recursive: true });
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(coordDir, "coordination-config.json"),
      JSON.stringify({ version: "1.0", profiles: {} })
    );

    const { client, transport } = await startServer(tmp);
    try {
      // First call
      await client.callTool({
        name: "record_observation",
        arguments: {
          constraint_type: "sudo",
          constraint: "test-dup",
          description: "test",
        },
      });
      // Second call — same constraint slug
      const result = await client.callTool({
        name: "record_observation",
        arguments: {
          constraint_type: "sudo",
          constraint: "test-dup",
          description: "test again",
        },
      });
      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.recorded, false);
      assert.equal(parsed.reason, "already_exists");
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("lists record_observation as available tool", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    mkdirSync(coordDir, { recursive: true });
    writeFileSync(
      join(coordDir, "coordination-config.json"),
      JSON.stringify({ version: "1.0", profiles: {} })
    );

    const { client, transport } = await startServer(tmp);
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name);
      assert.ok(names.includes("record_observation"), "record_observation tool registered");
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });
});
