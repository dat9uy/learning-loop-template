const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const HOOK_PATH = path.resolve(__dirname, "..", "hooks", "session-start-inject-discoverability.cjs");
const CONTEXT_PATH = path.resolve(__dirname, "..", "..", "..", ".claude", "session-context.json");

test("SessionStart hook writes discoverability hints to session-context.json", { timeout: 15000 }, async () => {
  // Clean up any existing context file
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

  const child = spawn("node", [HOOK_PATH], {
    env: { ...process.env, MASTRA_STORAGE_DRIVER: "memory" },
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));

  assert.strictEqual(code, 0, `hook exited ${code}; stderr: ${stderr}`);

  const context = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf8"));
  assert.ok(Array.isArray(context.hints), "hints must be array");
  assert.ok(context.hints.length > 0, "hints must not be empty");
  assert.ok(typeof context.injected_at === "string", "injected_at must be string");
});
