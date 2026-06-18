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
import { readRegistry } from "../core/meta-state.js";

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

// Stdio smoke test: meta_state_report "true" coercion + tools/list schema preservation.
// Both tests share one server instance to avoid spawn overhead.
test("stdio smoke: mechanism_check coercion + tools/list schema preservation", async () => {
  await withMcpServer(async ({ call, tempRoot, send }) => {
    // 1. Test mechanism_check coercion via stdio
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

    // 2. Test tools/list schema preservation
    const listResult = await send(5, "tools/list", {});
    assert(listResult.tools, "tools/list result missing tools array");
    const proposeDesign = listResult.tools.find(
      (t) => t.name === "mastra_meta_state_propose_design",
    );
    assert(proposeDesign, "meta_state_propose_design not found in tools/list");
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
