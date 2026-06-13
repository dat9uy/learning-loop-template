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
  const tempRoot = mkdtempSync(join(tmpdir(), "derived-schema-"));
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
      clientInfo: { name: "derived-schema-test", version: "1.0.0" },
    });
    await fn({ call, tempRoot });
  } finally {
    child.kill();
  }
}

// Test 1: wrapped proposed_design_for: {item: [...]} is REJECTED (RED test).
// The current passthrough ACCEPTS this and stores the wrapped object.
// The new derived union will REJECT it. This test is RED until Phase 4.
test("meta_state_patch REJECTS wrapped {item: [...]} on proposed_design_for (RED)", async () => {
  await withMcpServer(async ({ call, tempRoot }) => {
    // 1. Create a loop-design entry.
    const designResult = await call(1, "meta_state_propose_design", {
      title: "test-derived-schema-wrap-reject",
      description: "Test that wrapped proposed_design_for is rejected (min 20 chars)",
      proposed_design_for: ["rule-A", "rule-B"],
      addresses: [],
      affected_system: "mcp-tools",
    });
    assert.equal(designResult.proposed, true, "Failed to create loop-design");
    const designId = designResult.id;

    // 2. Patch with WRAPPED input — should be REJECTED after the fix.
    // The MCP SDK rejects at the Zod level (throws error) because the derived
    // union's .strict() rejects the {item: [...]} object. Either a thrown error
    // or patched=false is acceptable — both mean the wrapped input was rejected.
    let rejected = false;
    try {
      const patchResult = await call(2, "meta_state_patch", {
        id: designId,
        entry_kind: "loop-design",
        patch: {
          proposed_design_for: { item: ["rule-C", "rule-D", "rule-E"] },
        },
      });
      if (patchResult.patched === false) rejected = true;
    } catch {
      rejected = true; // MCP SDK Zod validation error = rejection
    }
    assert.equal(
      rejected,
      true,
      "Expected wrapped proposed_design_for to be REJECTED (error or patched=false)",
    );
  });
});

// Test 2: wrapped addresses: {item: [...]} is REJECTED (RED test).
// Same as Test 1 but for the `addresses` field.
test("meta_state_patch REJECTS wrapped {item: [...]} on addresses (RED)", async () => {
  await withMcpServer(async ({ call, tempRoot }) => {
    // 1. Create a loop-design entry.
    const designResult = await call(1, "meta_state_propose_design", {
      title: "test-derived-schema-addresses-wrap",
      description: "Test that wrapped addresses is rejected (min 20 chars)",
      proposed_design_for: ["rule-A"],
      addresses: ["finding-A"],
      affected_system: "mcp-tools",
    });
    assert.equal(designResult.proposed, true, "Failed to create loop-design");
    const designId = designResult.id;

    // 2. Patch with WRAPPED input — should be REJECTED after the fix.
    let rejected = false;
    try {
      const patchResult = await call(2, "meta_state_patch", {
        id: designId,
        entry_kind: "loop-design",
        patch: {
          addresses: { item: ["finding-B", "finding-C"] },
        },
      });
      if (patchResult.patched === false) rejected = true;
    } catch {
      rejected = true; // MCP SDK Zod validation error = rejection
    }
    assert.equal(
      rejected,
      true,
      "Expected wrapped addresses to be REJECTED (error or patched=false)",
    );
  });
});

// Test 3: flat proposed_design_for: string[] round-trips flat (regression guard).
// This test passes both before and after the fix — flat inputs work with both schemas.
test("meta_state_patch flat proposed_design_for round-trips as flat array", async () => {
  await withMcpServer(async ({ call, tempRoot }) => {
    // 1. Create a loop-design entry.
    const designResult = await call(1, "meta_state_propose_design", {
      title: "test-derived-schema-flat-roundtrip",
      description: "Test that flat proposed_design_for round-trips correctly (min 20 chars)",
      proposed_design_for: ["rule-A", "rule-B"],
      addresses: [],
      affected_system: "mcp-tools",
    });
    assert.equal(designResult.proposed, true, "Failed to create loop-design");
    const designId = designResult.id;

    // 2. Patch with FLAT input — should succeed.
    const patchResult = await call(2, "meta_state_patch", {
      id: designId,
      entry_kind: "loop-design",
      patch: {
        proposed_design_for: ["rule-C", "rule-D", "rule-E"],
      },
    });
    assert.equal(
      patchResult.patched,
      true,
      `Failed to patch with flat array: ${JSON.stringify(patchResult)}`,
    );

    // 3. Read registry and verify flat array (no {item: [...]} wrap).
    const entries = readRegistry(tempRoot);
    const updated = entries.find((e) => e.id === designId);
    assert(updated, "updated entry not found in registry");
    assert.deepEqual(
      updated.proposed_design_for,
      ["rule-C", "rule-D", "rule-E"],
      `Expected flat array, got: ${JSON.stringify(updated.proposed_design_for)}`,
    );
  });
});
