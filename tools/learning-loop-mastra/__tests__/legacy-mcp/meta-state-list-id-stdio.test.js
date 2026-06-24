import { test } from "node:test";
import assert from "node:assert";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareTempRoot,
  connectMcpServer,
} from "../../learning-loop-mastra/__tests__/with-mcp-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(dirname(__dirname)));
const serverEntry = join(projectRoot, "tools", "learning-loop", "server.js");

async function withSeededMcpServer(fn) {
  const tempRoot = prepareTempRoot();

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

  const handles = await connectMcpServer(serverEntry, tempRoot);
  try {
    await fn(handles.callTool);
  } finally {
    await handles.cleanup();
  }
}

test("meta_state_list { id: ['alpha', 'beta'] } round-trips top-level array via stdio", async () => {
  await withSeededMcpServer(async (callTool) => {
    const text = await callTool("mastra_meta_state_list", {
      id: ["alpha", "beta"],
      compact: true,
    });
    assert.strictEqual(text.count, 2, `expected 2 entries, got ${text.count}`);
    const ids = text.entries.map((e) => e.id).sort();
    assert.deepStrictEqual(ids, ["alpha", "beta"]);
    assert.deepStrictEqual(text.id_filter, ["alpha", "beta"]);
  });
});

test("meta_state_list { id: ['alpha', 'nonexistent'] } silently skips missing ids via stdio", async () => {
  await withSeededMcpServer(async (callTool) => {
    const text = await callTool("mastra_meta_state_list", {
      id: ["alpha", "nonexistent"],
      compact: true,
    });
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
  });
});

test("meta_state_list { ref_by, ref_field } round-trips via stdio", async () => {
  await withSeededMcpServer(async (callTool) => {
    const text = await callTool("mastra_meta_state_list", {
      ref_by: "alpha",
      ref_field: "addresses",
      compact: true,
    });
    assert.strictEqual(text.count, 0);
    assert.strictEqual(text.ref_by_filter, "alpha");
    assert.strictEqual(text.ref_field_filter, "addresses");
  });
});

test("meta_state_list { ref_by } without ref_field returns structured error via stdio", async () => {
  await withSeededMcpServer(async (callTool) => {
    const text = await callTool("mastra_meta_state_list", {
      ref_by: "alpha",
    });
    assert.strictEqual(text.error, "ref_pair_required");
  });
});
