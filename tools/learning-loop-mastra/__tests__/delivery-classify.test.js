import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("../../../scripts/delivery-classify.mjs", import.meta.url).pathname;

function buildTranscript(sessionId) {
  const lines = [];
  lines.push(JSON.stringify({ type: "mode", mode: "normal", sessionId }));
  lines.push(JSON.stringify({
    type: "assistant",
    sessionId,
    timestamp: "2026-07-21T01:00:00.000Z",
    message: {
      id: "msg-1",
      model: "test-model",
      usage: {
        input_tokens: 60000,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 100,
      },
    },
  }));
  return lines.join("\n");
}

function runClassify(env) {
  return new Promise((resolve) => {
    const child = spawn("node", [SCRIPT, "--limit=10"], {
      env: { ...process.env, ...env, DELIVERY_CLASSIFY_SKIP: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("delivery-classify", () => {
  test("appends a delivery-<sessionId> row on first run", { timeout: 30000 }, async () => {
    const sessionId = "11111111-1111-1111-1111-111111111111";
    const tempRoot = mkdtempSync(join(tmpdir(), "delivery-first-"));
    const projectsDir = join(tempRoot, "projects", "-workspace");
    mkdirSync(projectsDir, { recursive: true });
    writeFileSync(join(projectsDir, `${sessionId}.jsonl`), buildTranscript(sessionId));
    const originalCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      const result = await runClassify({});
      assert.strictEqual(result.code, 0, `classifier exited non-zero: ${result.stderr}`);
      const summary = JSON.parse(result.stdout);
      assert.ok(summary.result.appended >= 1, "must append at least one row on first run");
    } finally {
      process.chdir(originalCwd);
      try { rmSync(tempRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
