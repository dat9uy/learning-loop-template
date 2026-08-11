import { test } from "vitest";
import assert from "node:assert";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(dirname(dirname(__dirname))));
const LOOP_BIN = join(projectRoot, "tools", "learning-loop-mastra", "bin", "loop.mjs");

function seedRoot(seedEntries) {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-list-cli-"));
  writeFileSync(
    join(tempRoot, "meta-state.jsonl"),
    seedEntries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    "utf8",
  );
  return tempRoot;
}

function runCli(tool, args, tempRoot) {
  const proc = spawnSync("node", [LOOP_BIN, tool, JSON.stringify(args)], {
    env: {
      ...process.env,
      LOOP_SURFACE: ".claude",
      GATE_ROOT: tempRoot,
      MASTRA_STORAGE_DRIVER: "memory",
    },
    encoding: "utf8",
    timeout: 30000,
  });
  assert.strictEqual(proc.status, 0, `cli ${tool} must exit 0; stderr=${proc.stderr}`);
  return JSON.parse((proc.stdout ?? "").trim());
}

// Seed entries shared by the id-filter cases. The CLI path (bin/loop.mjs +
// adaptLegacyHandler) is the single record surface; meta_state_list no longer
// rides MCP.
const seedEntries = [
  { id: "alpha", entry_kind: "finding", status: "open", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "alpha for stdio id filter test (min 20 chars)", created_at: "2026-08-01T00:00:00.000Z" },
  { id: "beta", entry_kind: "finding", status: "open", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "beta for stdio id filter test (min 20 chars)", created_at: "2026-08-01T00:00:00.000Z" },
  { id: "gamma", entry_kind: "change-log", status: "open", change_dimension: "surface", change_target: "tools/test.js", change_diff: { added: ["id filter"], removed: [], changed: [] }, reason: "gamma for stdio id filter test (min 20 chars)", created_at: "2026-08-01T00:00:00.000Z" },
];

test("meta_state_list { id: ['alpha', 'beta'] } round-trips top-level array via CLI stdio", () => {
  const tempRoot = seedRoot(seedEntries);
  const result = runCli("meta_state_list", { id: ["alpha", "beta"], compact: true }, tempRoot);
  assert.strictEqual(result.count, 2, `expected 2 entries, got ${result.count}`);
  const ids = result.entries.map((e) => e.id).sort();
  assert.deepStrictEqual(ids, ["alpha", "beta"]);
  assert.deepStrictEqual(result.id_filter, ["alpha", "beta"]);
});

test("meta_state_list { id: ['alpha', 'nonexistent'] } silently skips missing ids via CLI stdio", () => {
  const tempRoot = seedRoot(seedEntries);
  const result = runCli("meta_state_list", { id: ["alpha", "nonexistent"], compact: true }, tempRoot);
  assert.strictEqual(result.count, 1);
  assert.strictEqual(result.entries[0].id, "alpha");
});

test("meta_state_list { ref_by, ref_field } round-trips via CLI stdio", () => {
  const tempRoot = seedRoot(seedEntries);
  const result = runCli("meta_state_list", { ref_by: "alpha", ref_field: "addresses", compact: true }, tempRoot);
  assert.strictEqual(result.count, 0);
  assert.strictEqual(result.ref_by_filter, "alpha");
  assert.strictEqual(result.ref_field_filter, "addresses");
});

test("meta_state_list { ref_by } without ref_field returns structured error via CLI stdio", () => {
  const tempRoot = seedRoot(seedEntries);
  const result = runCli("meta_state_list", { ref_by: "alpha" }, tempRoot);
  assert.strictEqual(result.error, "ref_pair_required");
});
