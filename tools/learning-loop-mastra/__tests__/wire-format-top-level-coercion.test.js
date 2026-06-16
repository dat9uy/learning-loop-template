import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistry } from "#mcp/core/meta-state.js";
import { createLoopTool } from "../create-loop-tool.js";
import { z } from "zod";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const serverEntry = join(projectRoot, "tools/learning-loop-mastra/server.js");

function copySchemas(tempRoot) {
  const schemasSrc = join(projectRoot, "schemas");
  const schemasDst = join(tempRoot, "schemas");
  mkdirSync(schemasDst, { recursive: true });
  for (const f of readdirSync(schemasSrc)) {
    if (f.endsWith(".schema.json")) {
      copyFileSync(join(schemasSrc, f), join(schemasDst, f));
    }
  }
}

async function withMcpServer(fn) {
  const tempRoot = mkdtempSync(join(tmpdir(), "top-level-coercion-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  copySchemas(tempRoot);

  const child = spawn("node", [serverEntry], {
    cwd: projectRoot,
    env: { ...process.env, GATE_ROOT: tempRoot },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";
  let serverErr = "";
  const pending = new Map();

  child.stderr.on("data", (chunk) => {
    serverErr += chunk.toString();
  });
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    const remaining = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id !== undefined && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        } else {
          remaining.push(line);
        }
      } catch {
        remaining.push(line);
      }
    }
    buffer = remaining.join("\n");
  });

  const send = (id, method, params) => {
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
        (err) => {
          if (err) {
            pending.delete(id);
            reject(err);
          }
        },
      );
    });
  };

  const call = async (id, name, args) => {
    const result = await send(id, "tools/call", { name, arguments: args });
    if (
      !result ||
      !result.content ||
      !result.content[0] ||
      typeof result.content[0].text !== "string"
    ) {
      throw new Error(
        `Unexpected MCP result for ${name}: ${JSON.stringify(result)}`,
      );
    }
    const text = result.content[0].text;
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      throw new Error(
        `Failed to parse ${name} result: ${text.slice(0, 500)} (error: ${parseErr.message}); server stderr: ${serverErr.slice(0, 1000)}`,
      );
    }
  };

  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await send(0, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "top-level-coercion-test", version: "1.0.0" },
    });
    await fn({ call, tempRoot, send });
  } finally {
    child.kill();
  }
}

// Test 1: meta_state_propose_design array unwrap via stdio.
test("mastra_meta_state_propose_design unwraps {item: [...]} arrays via stdio", async () => {
  await withMcpServer(async ({ call, tempRoot }) => {
    const result = await call(1, "mastra_meta_state_propose_design", {
      title: "test-propose-design-top-level",
      description:
        "Test wire-format top-level array coercion via stdio transport (min 20 chars)",
      proposed_design_for: { item: ["rule-A", "rule-B"] },
      addresses: { item: ["finding-C"] },
      affected_system: "mcp-tools",
    });
    assert.equal(
      result.proposed,
      true,
      `Failed to create loop-design: ${JSON.stringify(result)}`,
    );

    const entries = readRegistry(tempRoot);
    const entry = entries.find((e) => e.id === result.id);
    assert(entry, "entry not found in registry");
    assert.deepEqual(entry.proposed_design_for, ["rule-A", "rule-B"]);
    assert.deepEqual(entry.addresses, ["finding-C"]);
  });
});

// Test 2: meta_state_propose_design empty array unwrap via stdio.
test("mastra_meta_state_propose_design unwraps {item: []} to flat empty arrays via stdio", async () => {
  await withMcpServer(async ({ call, tempRoot }) => {
    const result = await call(2, "mastra_meta_state_propose_design", {
      title: "test-empty-array-coercion",
      description:
        "Test empty array wire-format coercion via stdio transport (min 20 chars)",
      proposed_design_for: { item: ["rule-A"] },
      addresses: { item: [] },
      affected_system: "mcp-tools",
    });
    assert.equal(
      result.proposed,
      true,
      `Failed to create loop-design: ${JSON.stringify(result)}`,
    );

    const entries = readRegistry(tempRoot);
    const entry = entries.find((e) => e.id === result.id);
    assert(entry, "entry not found in registry");
    assert.deepEqual(entry.proposed_design_for, ["rule-A"]);
    assert.deepEqual(entry.addresses, []);
  });
});

// Test 3: mastra_meta_state_report "true" coercion via stdio.
test("mastra_meta_state_report coerces mechanism_check 'true' string to boolean via stdio", async () => {
  await withMcpServer(async ({ call, tempRoot }) => {
    const result = await call(3, "mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description:
        "Test boolean wire-format coercion via stdio transport (min 20 chars)",
      evidence_code_ref: "tools/test.js",
      mechanism_check: "true",
    });
    assert.equal(
      result.reported,
      true,
      `Failed to report finding: ${JSON.stringify(result)}`,
    );

    const entries = readRegistry(tempRoot);
    const entry = entries.find((e) => e.id === result.id);
    assert(entry, "entry not found in registry");
    assert.equal(entry.mechanism_check, true);
  });
});

// Test 4: mastra_meta_state_report "false" coercion via stdio.
test("mastra_meta_state_report coerces mechanism_check 'false' string to boolean via stdio", async () => {
  await withMcpServer(async ({ call, tempRoot }) => {
    const result = await call(4, "mastra_meta_state_report", {
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description:
        "Test boolean false wire-format coercion via stdio transport (min 20 chars)",
      evidence_code_ref: "tools/test.js",
      mechanism_check: "false",
    });
    assert.equal(
      result.reported,
      true,
      `Failed to report finding: ${JSON.stringify(result)}`,
    );

    const entries = readRegistry(tempRoot);
    const entry = entries.find((e) => e.id === result.id);
    assert(entry, "entry not found in registry");
    assert.equal(entry.mechanism_check, false);
  });
});

// Test 5: tools/list schema preservation.
test("tools/list still advertises real array schemas after coercion patch", async () => {
  await withMcpServer(async ({ send }) => {
    const result = await send(5, "tools/list", {});
    assert(result.tools, "tools/list result missing tools array");
    const proposeDesign = result.tools.find(
      (t) => t.name === "mastra_meta_state_propose_design",
    );
    assert(proposeDesign, "mastra_meta_state_propose_design not found in tools/list");
    assert(proposeDesign.inputSchema, "inputSchema missing");
    const schema = proposeDesign.inputSchema;
    assert(
      schema.properties && schema.properties.proposed_design_for,
      "proposed_design_for missing from schema",
    );
    assert.equal(
      schema.properties.proposed_design_for.type,
      "array",
      "proposed_design_for should be array type",
    );
    assert(
      schema.properties && schema.properties.addresses,
      "addresses missing from schema",
    );
    assert.equal(
      schema.properties.addresses.type,
      "array",
      "addresses should be array type",
    );
  });
});

// Test 6: createLoopTool wraps inputSchema with z.preprocess (factory-unit replacement).
test("createLoopTool wraps inputSchema with z.preprocess", () => {
  const tool = createLoopTool({ id: "test", description: "t",
    inputSchema: z.object({ x: z.boolean() }), execute: async () => ({}) });
  // Zod v4 returns ZodPreprocess (not ZodEffects); check constructor name
  assert.equal(tool.inputSchema.constructor.name, "ZodPreprocess");
});
