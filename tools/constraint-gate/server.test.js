import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { parse as parseYaml } from "yaml";

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
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });

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
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
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

  it("escalates with inbound_gate when fresh marker and stale observation", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(coordDir, { recursive: true });
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(obsDir, "observation-docker.yaml"),
      `id: obs-docker\nconstraint_type: docker\nstatus: active\nupdated_at: ${new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()}\nnotes: test`
    );
    writeFileSync(
      join(coordDir, ".last-operator-message"),
      JSON.stringify({ timestamp: new Date().toISOString(), prompt_snippet: "I cleared the device" }, null, 2)
    );

    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({
        name: "check_gate",
        arguments: { command: "docker run ubuntu" },
      });
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      assert.equal(parsed.decision, "escalate");
      assert.equal(parsed.inbound_gate, true);
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("does NOT escalate when marker is expired (TTL)", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(coordDir, { recursive: true });
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(obsDir, "observation-docker.yaml"),
      `id: obs-docker\nconstraint_type: docker\nstatus: active\nupdated_at: ${new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()}\nnotes: test`
    );
    writeFileSync(
      join(coordDir, ".last-operator-message"),
      JSON.stringify({ timestamp: new Date(Date.now() - 31 * 60 * 1000).toISOString(), prompt_snippet: "old message" }, null, 2)
    );

    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({
        name: "check_gate",
        arguments: { command: "docker run ubuntu" },
      });
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      assert.equal(parsed.decision, "ok");
      assert.equal(parsed.inbound_gate, undefined);
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("F3: budget exhaustion + stale marker includes inbound_gate: true", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(coordDir, { recursive: true });
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(obsDir, "observation-docker.yaml"),
      `id: obs-docker\nconstraint_type: docker\nstatus: active\nupdated_at: ${new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()}\nnotes: test`
    );
    writeFileSync(
      join(obsDir, "budget-docker-resource-budget.yaml"),
      `budget: 1\ncurrent: 1\nconstraint_type: docker\nvalidation_window: { active: false }`
    );
    writeFileSync(
      join(coordDir, ".last-operator-message"),
      JSON.stringify({ timestamp: new Date().toISOString(), prompt_snippet: "I cleared the device" }, null, 2)
    );

    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({
        name: "check_gate",
        arguments: { command: "docker run ubuntu" },
      });
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      assert.equal(parsed.decision, "escalate");
      assert.equal(parsed.inbound_gate, true);
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("F3: budget exhaustion + observation newer than marker does NOT include inbound_gate", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(coordDir, { recursive: true });
    mkdirSync(obsDir, { recursive: true });
    writeFileSync(
      join(obsDir, "observation-docker.yaml"),
      `id: obs-docker\nconstraint_type: docker\nstatus: active\nupdated_at: ${new Date().toISOString()}\nnotes: test`
    );
    writeFileSync(
      join(obsDir, "budget-docker-resource-budget.yaml"),
      `budget: 1\ncurrent: 1\nconstraint_type: docker\nvalidation_window: { active: false }`
    );
    writeFileSync(
      join(coordDir, ".last-operator-message"),
      JSON.stringify({ timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), prompt_snippet: "old" }, null, 2)
    );

    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({
        name: "check_gate",
        arguments: { command: "docker run ubuntu" },
      });
      const text = result.content[0].text;
      const parsed = JSON.parse(text);
      assert.equal(parsed.decision, "escalate");
      assert.equal(parsed.inbound_gate, undefined);
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("MCP server record_observation tool", () => {
  it("records observation and creates file", async () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });

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
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });

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

describe("MCP server update_observation tool", () => {
  it("lists update_observation as available tool", async () => {
    const tmp = createTmpDir();
    const { client, transport } = await startServer(tmp);
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name);
      assert.ok(names.includes("update_observation"), "update_observation tool registered");
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("changes status via MCP client", async () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(obsDir, "observation-update.yaml"),
      `id: obs-update-test\nschema_version: "1.0"\ntype: observation\nstatus: active\ncreated_at: ${past}\nupdated_at: ${past}\nconstraint_type: test\nconstraint: test-update\nnotes: original`
    );

    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({
        name: "update_observation",
        arguments: {
          observation_id: "obs-update-test",
          status: "inactive",
        },
      });
      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.updated, true);
      assert.equal(parsed.id, "obs-update-test");

      const content = parseYaml(readFileSync(parsed.path, "utf8"));
      assert.equal(content.status, "inactive");
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns error when observation missing", async () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });

    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({
        name: "update_observation",
        arguments: {
          observation_id: "obs-missing",
          status: "inactive",
        },
      });
      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.updated, false);
      assert.equal(parsed.reason, "not_found");
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });

  it("logs reason if provided", async () => {
    const tmp = createTmpDir();
    const obsDir = join(tmp, "records", "observations");
    mkdirSync(obsDir, { recursive: true });
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    writeFileSync(
      join(obsDir, "observation-log.yaml"),
      `id: obs-log-test\nschema_version: "1.0"\ntype: observation\nstatus: active\ncreated_at: ${past}\nupdated_at: ${past}\nconstraint_type: test\nconstraint: test-log\nnotes: original`
    );

    const { client, transport } = await startServer(tmp);
    try {
      const result = await client.callTool({
        name: "update_observation",
        arguments: {
          observation_id: "obs-log-test",
          status: "archived",
          reason: "archived for test",
        },
      });
      const parsed = JSON.parse(result.content[0].text);
      assert.equal(parsed.updated, true);

      const content = parseYaml(readFileSync(parsed.path, "utf8"));
      assert.ok(content.notes.includes("archived for test"));
    } finally {
      await transport.close();
    }
    rmSync(tmp, { recursive: true, force: true });
  });
});
