const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const HOOK_PATH = path.resolve(__dirname, "..", "..", "hooks", "legacy", "session-start-inject-discoverability.cjs");
const CONTEXT_PATH = path.resolve(__dirname, "..", "..", "..", "..", ".claude", "session-context.json");

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
  assert.ok(Array.isArray(context.discoverability_hints), "discoverability_hints must be array");
  assert.ok(context.discoverability_hints.length > 0, "discoverability_hints must not be empty");
  assert.ok(Array.isArray(context.process_hints), "process_hints must be array");
  assert.ok(context.process_hints.length >= 1, "process_hints must have ≥1 entry");
  assert.ok(typeof context.injected_at === "string", "injected_at must be string");
  // Rec 12 closed-loop (plan 260708-1216-rec12-closed-loop, phase 4): the
  // additive `change_log_gap_hints` key must always be present in the
  // happy-path write — downstream readers never see a missing file/key.
  assert.ok(
    Array.isArray(context.change_log_gap_hints?.gap_candidates),
    "change_log_gap_hints.gap_candidates must be an array",
  );
  assert.ok(
    typeof context.change_log_gap_hints?.gap_protocol_prompt === "string",
    "change_log_gap_hints.gap_protocol_prompt must be a string",
  );
});

// Rec 12 closed-loop (phase 4): the BOTH-write-sites rule is load-bearing.
// The fatal-catch path MUST also carry the new key (with empty shape) so
// downstream readers never see a missing key on a failure path — the
// stale-dispatch precedent's invariant (mirror at the `:82` fatal-catch
// write site in session-start-inject-discoverability.cjs).
test("SessionStart hook fatal-catch path still writes change_log_gap_hints key", { timeout: 15000 }, async () => {
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

  // Inject a sentinel env var the hook consults; when present, the hook
  // forces its outer try/catch to throw, exercising the fatal-catch path.
  const child = spawn("node", [HOOK_PATH], {
    env: {
      ...process.env,
      MASTRA_STORAGE_DRIVER: "memory",
      SESSION_START_FORCE_FATAL: "1",
    },
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `hook must exit 0 even on fatal; stderr: ${stderr}`);

  const context = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf8"));
  assert.ok(
    Array.isArray(context.change_log_gap_hints?.gap_candidates),
    "fatal-catch path must still write change_log_gap_hints.gap_candidates (empty array)",
  );
});
