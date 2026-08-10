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
  // Pointer projection: header names the pull path; hint slugs + suggestions replace the inline paragraphs.
  assert.ok(ac.includes("loop_describe({tier:'warm'})"), "must advertise the pull path for full process hints");
  // Only startup-tier pointers are injected inline. Both standalone rows are
  // on-demand, so the startup set is the rule-derived rows exactly as the
  // canonical builder computes them (rule-derived rows carry no tier and
  // behave as startup while their rule is active).
  const introspect = await import(require("node:url").pathToFileURL(
    path.resolve(__dirname, "..", "..", "core", "loop-introspect.js"),
  ).href);
  const pointers = introspect.buildProcessPointers({ tier: "startup" });
  assert.ok(pointers.length >= 1, "rule-derived process pointers must survive the startup filter");
  for (const p of pointers) {
    assert.ok(ac.includes(p), `additionalContext must include startup pointer: ${p.slice(0, 60)}`);
  }
  // The on-demand standalone rows stay out of the inline payload.
  assert.ok(!ac.includes("pnpm-test-discipline"), "on-demand standalone slug must not be auto-injected inline");
  assert.ok(!ac.includes("file-edit-drift-and-fingerprints"), "on-demand standalone slug must not be auto-injected inline");
  // Numbering is 1..N over the startup pointer set.
  assert.ok(/^1\. /m.test(ac) && new RegExp(`^${pointers.length}\\. `, "m").test(ac),
    `must number hint pointers 1 through ${pointers.length}`);
  assert.ok(!new RegExp(`^${pointers.length + 1}\\. `, "m").test(ac),
    "no pointer beyond the startup set");
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