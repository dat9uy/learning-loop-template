const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const HOOK_PATH = path.resolve(__dirname, "..", "..", "hooks", "universal", "session-start-inject-process-hints.cjs");

// Inline delivery leg (plan 260715-1141). The companion to the discoverability
// hook injects PROCESS_HINTS via stdout `hookSpecificOutput.additionalContext`
// so the agent deterministically sees row #1 (the test-parsing rule) at
// session start without calling loop_describe. This test locks in that the
// full process-hints set is injected inline and under the 10k-char cap.
test("process-hints hook emits full PROCESS_HINTS via stdout additionalContext", { timeout: 15000 }, async () => {
  const child = spawn("node", [HOOK_PATH], {
    env: { ...process.env, MASTRA_STORAGE_DRIVER: "memory" },
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => { stdout += d; });
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `hook must exit 0; stderr: ${stderr}`);

  const out = JSON.parse(stdout);
  assert.strictEqual(out.hookSpecificOutput.hookEventName, "SessionStart", "must declare SessionStart event");
  const ac = out.hookSpecificOutput.additionalContext;
  assert.ok(typeof ac === "string" && ac.length > 0, "additionalContext must be a non-empty string");
  assert.ok([...ac].length <= 10000, `additionalContext must stay under 10k chars; got ${[...ac].length}`);
  assert.ok(ac.includes("Loop process hints"), "must carry the process-hints header");
  // Row #1 is the test-parsing rule the regression (session 4760ee34) violated.
  // State-3: the gate + wrapper enforce deterministic parse; the hint is the
  // pointer. Lock the pointer (`pnpm test:iter`), the gate-forbidden phrase,
  // and the canonical parser script reference.
  assert.ok(ac.includes("pnpm test:iter"), "must inject the State-3 iterate wrapper pointer");
  assert.ok(ac.includes("Do NOT grep raw vitest stdout"), "must inject row #1 (the test-parsing rule)");
  assert.ok(ac.includes("vitest-failures.sh"), "must inject the canonical parser script reference");
  // Full set: 10 numbered hints (1..10) — proves delivery is complete, not partial.
  // Phase 3 (plans/260717-1826-unify-context-injection): the post-backfill
  // count is 8 rule-derived + 2 standalone = 10. The required-status-check row
  // appended in plan 260714-1358 makes 10 (was 9 pre-append, pre-Phase-3).
  assert.ok(/^1\. /m.test(ac) && /^10\. /m.test(ac), "must number process hints 1 through 10 (full set)");
});

// Fail-open: a build error must emit a degraded marker string (not crash with
// non-zero exit or empty/non-JSON stdout). SESSION_START_FORCE_PROCESS_HINTS_FAIL
// is the guarded test-only trigger mirrored from the discoverability hook.
test("process-hints hook emits degraded marker on build failure", { timeout: 15000 }, async () => {
  const child = spawn("node", [HOOK_PATH], {
    env: {
      ...process.env,
      MASTRA_STORAGE_DRIVER: "memory",
      SESSION_START_FORCE_PROCESS_HINTS_FAIL: "1",
    },
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => { stdout += d; });
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `hook must exit 0 even when degraded; stderr: ${stderr}`);

  const out = JSON.parse(stdout);
  const ac = out.hookSpecificOutput.additionalContext;
  assert.ok(typeof ac === "string", "must still emit string additionalContext when degraded");
  assert.ok(ac.includes("unavailable"), `degraded additionalContext must say 'unavailable'; got: ${ac}`);
  assert.ok(/forced process-hints loader failure/.test(ac), "must carry the failure message");
});