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
import { coerceParamsToSchema } from "../tool-registry.js";
import { readRegistry } from "../core/meta-state.js";
import { metaStateProposeDesignTool } from "../tools/meta-state-propose-design-tool.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const serverEntry = join(projectRoot, "tools/learning-loop-mcp/server.js");

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
  const tempRoot = mkdtempSync(join(tmpdir(), "patch-recursion-"));
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
      clientInfo: { name: "patch-recursion-test", version: "1.0.0" },
    });
    await fn({ call, tempRoot });
  } finally {
    child.kill();
  }
}

// Test 1: combined-patch stdio transport (patches a loop-design).
// After the derived-schema fix, patch objects must be flat (no {item: {...}} wrap).
test("meta_state_patch accepts flat patch object via stdio", async () => {
  await withMcpServer(async ({ call, tempRoot }) => {
    // 1. Create a loop-design to patch.
    const designResult = await call(1, "meta_state_propose_design", {
      title: "test-loop-design-for-patch",
      description:
        "Test loop design for wire-format patch recursion bug (min 20 chars)",
      proposed_design_for: ["finding-A"],
      addresses: [],
      affected_system: "mcp-tools",
    });
    assert.equal(
      designResult.proposed,
      true,
      `Failed to create loop-design: ${JSON.stringify(designResult)}`,
    );
    const designId = designResult.id;

    // 2. Patch it with a flat patch object (no {item: {...}} wrap).
    const patchResult = await call(2, "meta_state_patch", {
      id: designId,
      entry_kind: "loop-design",
      patch: {
        addresses: ["finding-B", "finding-C", "finding-D"],
        description: "Updated description for patch test",
      },
    });
    assert.equal(
      patchResult.patched,
      true,
      `Failed to patch loop-design: ${JSON.stringify(patchResult)}`,
    );

    // 3. Read registry and verify flat array.
    const entries = readRegistry(tempRoot);
    const updated = entries.find((e) => e.id === designId);
    assert(updated, "updated entry not found in registry");
    assert.deepEqual(updated.addresses, ["finding-B", "finding-C", "finding-D"]);
    assert.equal(updated.description, "Updated description for patch test");
  });
});

// Test 2: coerceParamsToSchema unit test — double-nested unwrap.
test("coerceParamsToSchema unwraps {item: {item: [...]}} chain", () => {
  const schema = {
    shape: {
      addresses: { _def: { typeName: "ZodArray" } },
    },
  };
  const result = coerceParamsToSchema(
    { addresses: { item: { item: ["x", "y"] } } },
    schema,
  );
  assert.deepEqual(result, { addresses: ["x", "y"] });
});

// Test 3: meta_state_propose_design via coerceParamsToSchema with real schema.
// The MCP SDK validates arrays at the stdio layer, so we test the coercion
// path directly (same pattern as wire-format-coercion-fix.test.js).
test("coerceParamsToSchema unwraps {item: [...]} in real propose_design schema", () => {
  const realSchema = metaStateProposeDesignTool.schema;
  const result = coerceParamsToSchema(
    {
      title: "test-propose-design-recursion",
      description: "Test for wire-format recursion bug in propose_design (min 20 chars)",
      proposed_design_for: { item: ["rule-A", "rule-B"] },
      addresses: { item: ["finding-C", "finding-D"] },
      affected_system: "mcp-tools",
    },
    realSchema,
  );
  assert.deepEqual(result.proposed_design_for, ["rule-A", "rule-B"]);
  assert.deepEqual(result.addresses, ["finding-C", "finding-D"]);
});

// Test 1.5: pre-validation for empty arrays (gates Bridge 5 deferral mechanism).
// Tests that {item: []} unwraps to [] on the real propose_design schema.
test("coerceParamsToSchema unwraps {item: []} to flat empty array", () => {
  const realSchema = metaStateProposeDesignTool.schema;
  const result = coerceParamsToSchema(
    {
      title: "bridge-5-pre-validation-test",
      description:
        "Pre-validation for empty-array shape; gates Bridge 5 deferral mechanism (min 20 chars)",
      proposed_design_for: ["a"],
      addresses: { item: [] },
      affected_system: "mcp-tools",
    },
    realSchema,
  );
  assert.deepEqual(result.proposed_design_for, ["a"]);
  assert.deepEqual(result.addresses, []);
});
