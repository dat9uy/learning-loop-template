import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(dirname(__dirname)));
const serverEntry = join(projectRoot, "tools", "learning-loop-mastra", "server.js");

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
  const tempRoot = mkdtempSync(join(tmpdir(), "list-id-stdio-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  copySchemas(tempRoot);

  // Seed the registry with 3 entries
  const seedEntries = [
    { id: "alpha", entry_kind: "finding", status: "active", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "alpha for stdio id filter test (min 20 chars)", created_at: new Date().toISOString() },
    { id: "beta", entry_kind: "finding", status: "active", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "beta for stdio id filter test (min 20 chars)", created_at: new Date().toISOString() },
    { id: "gamma", entry_kind: "change-log", status: "active", change_dimension: "surface", change_target: "tools/test.js", change_diff: { added: ["id filter"], removed: [], changed: [] }, reason: "gamma for stdio id filter test (min 20 chars)", created_at: new Date().toISOString() },
  ];
  writeFileSync(
    join(tempRoot, "meta-state.jsonl"),
    seedEntries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    "utf8"
  );

  const child = spawn("node", [serverEntry], {
    env: { ...process.env, GATE_ROOT: tempRoot },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let nextId = 1;
  const pending = new Map();

  const send = (id, method, params) => new Promise((resolve, reject) => {
    const msg = { jsonrpc: "2.0", id, method, params };
    child.stdin.write(JSON.stringify(msg) + "\n");
    pending.set(id, { resolve, reject });
  });

  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) {
          const { resolve } = pending.get(msg.id);
          pending.delete(msg.id);
          resolve(msg.result);
        }
      } catch (err) {
        // Skip non-JSON lines (server logs)
      }
    }
  });

  child.stderr.on("data", () => {}); // Drain stderr

  try {
    await send(nextId++, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "meta-state-list-id-stdio-test", version: "1.0.0" },
    });
    await fn({ send: (method, params) => send(nextId++, method, params), tempRoot });
  } finally {
    child.kill();
  }
}

test("meta_state_list { id: ['alpha', 'beta'] } round-trips top-level array via stdio", async () => {
  await withMcpServer(async ({ send }) => {
    const result = await send("tools/call", {
      name: "mastra_meta_state_list",
      arguments: { id: ["alpha", "beta"], compact: true },
    });
    assert(result.content, "tools/call result missing content");
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 2, `expected 2 entries, got ${text.count}`);
    const ids = text.entries.map((e) => e.id).sort();
    assert.deepStrictEqual(ids, ["alpha", "beta"]);
    assert.deepStrictEqual(text.id_filter, ["alpha", "beta"]);
  });
});

test("meta_state_list { id: ['alpha', 'nonexistent'] } silently skips missing ids via stdio", async () => {
  await withMcpServer(async ({ send }) => {
    const result = await send("tools/call", {
      name: "mastra_meta_state_list",
      arguments: { id: ["alpha", "nonexistent"], compact: true },
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
  });
});

test("meta_state_list { ref_by, ref_field } round-trips via stdio", async () => {
  await withMcpServer(async ({ send }) => {
    const result = await send("tools/call", {
      name: "mastra_meta_state_list",
      arguments: { ref_by: "alpha", ref_field: "addresses", compact: true },
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0);
    assert.strictEqual(text.ref_by_filter, "alpha");
    assert.strictEqual(text.ref_field_filter, "addresses");
  });
});

test("meta_state_list { ref_by } without ref_field returns structured error via stdio", async () => {
  await withMcpServer(async ({ send }) => {
    const result = await send("tools/call", {
      name: "mastra_meta_state_list",
      arguments: { ref_by: "alpha" },
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.error, "ref_pair_required");
  });
});
