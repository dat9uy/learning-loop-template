import { describe, test } from "vitest";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const LOOP_BIN = join(projectRoot, "tools/learning-loop-mastra/bin/loop.mjs");

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
  // log_change lands in change-log.jsonl (Tier 1 Phase 2 dispatch).
  const raw = readFileSync(join(tempRoot, "change-log.jsonl"), "utf8");
  return raw.split("\n").filter((line) => line.trim() !== "");
}

// Concurrent record-surface writes: the CLI (bin/loop.mjs) is the single write
// transport, and the registry-append lock (proper-lockfile, cross-process)
// must serialize concurrent log_change writes so none is lost. This replaces
// the former MCP-mutex leg (meta_state_log_change no longer rides MCP; the
// MCP harness mutex is a test-only concern). The write serialization contract
// is transport-agnostic and is what survives the single-surface cut-over.
describe("concurrent CLI writes serialize without lost updates", () => {
  let tempRoot;

  beforeAll(() => {
    tempRoot = prepareTempRoot();
  });

  test("20 parallel CLI log_change writes serialize without lost updates", async () => {
    const calls = [];
    for (let i = 0; i < 10; i++) {
      for (const side of ["a", "b"]) {
        calls.push(new Promise((resolve) => {
          const child = spawn(
            process.execPath,
            [
              LOOP_BIN,
              "meta_state_log_change",
              JSON.stringify({
                change_dimension: "mechanical",
                change_target: `tools/mutex-test-${side}-${i}.js`,
                change_diff: { added: [`mutex-test-${i}`], removed: [], changed: [] },
                reason: `Client ${side} mutex race test entry ${i} (min 20 chars)`,
              }),
            ],
            {
              env: { ...process.env, LOOP_SURFACE: ".claude", GATE_ROOT: tempRoot, MASTRA_STORAGE_DRIVER: "memory" },
              stdio: ["ignore", "pipe", "pipe"],
            },
          );
          let stdout = "";
          let stderr = "";
          child.stdout.on("data", (d) => (stdout += d));
          child.stderr.on("data", (d) => (stderr += d));
          child.on("exit", (code) => resolve({ code, stdout, stderr }));
        }));
      }
    }

    const results = await Promise.all(calls);
    const failures = results.filter((r) => r.code !== 0);
    assert.strictEqual(failures.length, 0, `Some CLI writes failed: ${JSON.stringify(failures.slice(0, 3).map((f) => ({ code: f.code, stderr: f.stderr })), null, 2)}`);

    const lines = readRegistryLines(tempRoot);
    assert.strictEqual(
      lines.length,
      20,
      `Expected 20 registry entries, got ${lines.length} — parallel writes raced and lost updates`,
    );

    // Verify every entry is valid JSON (no interleaved/corrupt writes).
    const ids = new Set();
    for (const line of lines) {
      const parsed = JSON.parse(line);
      assert.strictEqual(parsed.entry_kind, "change-log");
      ids.add(parsed.id);
    }
    assert.strictEqual(ids.size, 20, "Expected 20 unique change-log ids");
  }, 60000);
});
