const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const HOOK_PATH = path.resolve(__dirname, "..", "..", "hooks", "universal", "session-start-inject-discoverability.cjs");
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

// Plan 260715-1100 silent-degrade regression. Before this fix, an inner
// loader failure (loadCoreHints / loadRegistry) returned empty arrays via
// try/catch with no signal — downstream readers (and the agent) could not
// distinguish "no hints configured" from "loader failed." This test forces
// the core-hints loader to fail and asserts the sidecar carries the
// `*_source: "fallback"` flag plus the captured error message, plus a
// DEGRADED stderr line so the harness surfaces the failure to the agent.
test("SessionStart hook carries *_source=fallback flags when an inner loader fails", { timeout: 15000 }, async () => {
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

  const child = spawn("node", [HOOK_PATH], {
    env: {
      ...process.env,
      MASTRA_STORAGE_DRIVER: "memory",
      SESSION_START_FORCE_HINTS_FAIL: "1",
    },
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `hook must still exit 0 on per-loader fallback; stderr: ${stderr}`);

  const context = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf8"));
  // Sidecar shape stays stable (BOTH-write-sites invariant) — every key
  // present, every array empty, but the *_source flags expose the degrade.
  assert.deepStrictEqual(context.discoverability_hints, [], "discoverability_hints must be empty when loader fails");
  assert.strictEqual(context.discoverability_hints_source, "fallback", "must flag the source as fallback");
  assert.ok(
    typeof context.discoverability_hints_error === "string" && context.discoverability_hints_error.length > 0,
    "must capture the loader error message",
  );
  assert.deepStrictEqual(context.process_hints, [], "process_hints must be empty when loader fails");
  assert.strictEqual(context.process_hints_source, "fallback", "must flag the source as fallback");
  assert.ok(
    typeof context.process_hints_error === "string" && context.process_hints_error.length > 0,
    "must capture the loader error message",
  );
  // Stderr surfaces the DEGRADED line so the harness can route the signal
  // to the agent — without this, the agent has no way to detect the issue.
  assert.ok(
    /DEGRADED loaders:.*process_hints/.test(stderr),
    `stderr must include DEGRADED loaders: line referencing process_hints; got: ${stderr}`,
  );
});

// Plan 260715-1100 follow-up: the fatal-catch path must distinguish itself
// from a per-loader fallback so a downstream reader can tell whether the
// whole hook threw or just one loader failed. Source flag value is "fatal"
// (vs. "fallback" for per-loader degrade, "core" for happy path).
test("SessionStart hook fatal-catch path sets *_source=fatal (not fallback)", { timeout: 15000 }, async () => {
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

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
  assert.strictEqual(context.discoverability_hints_source, "fatal", "fatal path must tag hints_source as 'fatal'");
  assert.strictEqual(context.process_hints_source, "fatal", "fatal path must tag process_hints_source as 'fatal'");
  assert.strictEqual(context.registry_source, "fatal", "fatal path must tag registry_source as 'fatal'");
  assert.ok(
    typeof context.process_hints_error === "string" && context.process_hints_error.length > 0,
    "fatal path must carry the captured fatal error",
  );
});

// Happy-path counterpart: when no env-var forces a failure, source flags
// must be "core" — locks in the success signal so a future regression that
// always emits "fallback" would be caught.
test("SessionStart hook happy path sets *_source=core on every loader", { timeout: 15000 }, async () => {
  try { fs.unlinkSync(CONTEXT_PATH); } catch { /* ignore */ }

  const child = spawn("node", [HOOK_PATH], {
    env: { ...process.env, MASTRA_STORAGE_DRIVER: "memory" },
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `hook must exit 0 on happy path; stderr: ${stderr}`);

  const context = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf8"));
  assert.strictEqual(context.discoverability_hints_source, "core", "happy path must tag discoverability as 'core'");
  assert.strictEqual(context.process_hints_source, "core", "happy path must tag process_hints as 'core'");
  assert.strictEqual(context.registry_source, "core", "happy path must tag registry as 'core'");
  assert.strictEqual(context.discoverability_hints_error, null, "happy path must not carry a discoverability error");
  assert.strictEqual(context.process_hints_error, null, "happy path must not carry a process_hints error");
  assert.strictEqual(context.registry_error, null, "happy path must not carry a registry error");
  assert.ok(
    !/DEGRADED loaders/.test(stderr),
    `stderr must NOT include DEGRADED line on happy path; got: ${stderr}`,
  );
});
