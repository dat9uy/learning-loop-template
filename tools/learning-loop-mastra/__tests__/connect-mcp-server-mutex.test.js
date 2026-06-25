import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectMcpServer } from "./with-mcp-server.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const mastraEntry = join(projectRoot, "tools/learning-loop-mastra/mastra/server.js");

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

function prepareTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "mutex-race-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  copySchemas(tempRoot);
  return tempRoot;
}

function readRegistryLines(tempRoot) {
  const raw = readFileSync(join(tempRoot, "meta-state.jsonl"), "utf8");
  return raw.split("\n").filter((line) => line.trim() !== "");
}

describe("connectMcpServer module-level mutex", () => {
  let tempRoot;
  let a;
  let b;

  before(async () => {
    tempRoot = prepareTempRoot();
    a = await connectMcpServer(mastraEntry, tempRoot);
    b = await connectMcpServer(mastraEntry, tempRoot);
  });

  after(async () => {
    if (a) await a.cleanup();
    if (b) await b.cleanup();
  });

  test("20 parallel cross-client writes serialize without lost updates", async () => {
    const calls = [];
    for (let i = 0; i < 10; i++) {
      calls.push(a.callTool("mastra_meta_state_log_change", {
        change_dimension: "mechanical",
        change_target: `tools/mutex-test-a-${i}.js`,
        change_diff: { added: [`mutex-test-${i}`], removed: [], changed: [] },
        reason: `Client A mutex race test entry ${i} (min 20 chars)`,
      }));
      calls.push(b.callTool("mastra_meta_state_log_change", {
        change_dimension: "mechanical",
        change_target: `tools/mutex-test-b-${i}.js`,
        change_diff: { added: [`mutex-test-${i}`], removed: [], changed: [] },
        reason: `Client B mutex race test entry ${i} (min 20 chars)`,
      }));
    }

    const results = await Promise.all(calls.map((p) => p.catch((err) => ({ error: err.message }))));
    const failures = results.filter((r) => r.error);
    assert.strictEqual(failures.length, 0, `Some calls failed: ${JSON.stringify(failures.slice(0, 3), null, 2)}`);

    // created_at must be non-decreasing in call order. With ms resolution two
    // serialized writes can tie (t == prev), so this is a non-regression check,
    // not a strict ordering proof. The line-count + unique-id assertions below
    // are the actual mutex-correctness gate (no lost updates under concurrent
    // writes).
    const timestamps = results.map((r) => new Date(r.created_at).getTime());
    assert.ok(
      timestamps.every((t, i) => i === 0 || t >= timestamps[i - 1]),
      "created_at should not regress across serialized writes"
    );

    const lines = readRegistryLines(tempRoot);
    assert.strictEqual(
      lines.length,
      20,
      `Expected 20 registry entries, got ${lines.length} — parallel writes raced and lost updates`
    );

    // Verify every entry is valid JSON (no interleaved/corrupt writes).
    const ids = new Set();
    for (const line of lines) {
      const parsed = JSON.parse(line);
      assert.strictEqual(parsed.entry_kind, "change-log");
      ids.add(parsed.id);
    }
    assert.strictEqual(ids.size, 20, "Expected 20 unique change-log ids");
  });
});
