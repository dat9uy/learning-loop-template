const assert = require("node:assert/strict");
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..", "..");
const ADAPTER = join(PROJECT_ROOT, ".codex", "hooks", "session-start-i2-delivery.cjs");

function makeRule(id, description) {
  return {
    id,
    entry_kind: "rule",
    internalization_level: "I2",
    pattern_type: "agent-checklist",
    pattern: JSON.stringify({ version: 1, items: [{ id: "check", description: "Check the fixture" }] }),
    description,
    status: "active",
    promoted_at: "2026-08-14T00:00:00.000Z",
    promoted_by: "test",
    version: 0,
  };
}

function invokeSessionStart(root, overrides = {}) {
  const input = {
    cwd: root,
    hook_event_name: "SessionStart",
    model: "test-model",
    permission_mode: "default",
    session_id: "codex-test-session",
    source: "startup",
    transcript_path: null,
    ...overrides,
  };
  const run = spawnSync("node", [ADAPTER], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify(input),
  });
  assert.equal(run.status, 0, `adapter must remain fail-open: ${run.stderr}`);
  return JSON.parse(run.stdout);
}

function deliveryLog(root) {
  const logPath = join(root, ".claude", "coordination", ".gate-decision.log");
  try {
    return readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

test("Codex session-start adapter encodes every active I2 Rule in its native context envelope", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-initial-delivery-"));
  try {
    writeFileSync(join(root, "meta-state.jsonl"), [
      JSON.stringify(makeRule("rule-zeta", "Zeta is an active I2 obligation.")),
      JSON.stringify(makeRule("rule-alpha", "Alpha is an active I2 obligation.")),
    ].join("\n") + "\n");

    const output = invokeSessionStart(root);

    assert.deepEqual(Object.keys(output), ["hookSpecificOutput"]);
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(typeof output.hookSpecificOutput.additionalContext, "string");
    assert.ok(output.hookSpecificOutput.additionalContext.includes("Alpha is an active I2 obligation."));
    assert.ok(output.hookSpecificOutput.additionalContext.includes("Zeta is an active I2 obligation."));
    assert.ok(
      output.hookSpecificOutput.additionalContext.indexOf("Alpha is an active I2 obligation.")
        < output.hookSpecificOutput.additionalContext.indexOf("Zeta is an active I2 obligation."),
      "Codex must receive the complete ordered I2 projection",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Codex session-start adapter preserves a complete multi-partition I2 projection", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-initial-delivery-partitions-"));
  try {
    const alpha = "A".repeat(6_000);
    const zeta = "Z".repeat(6_000);
    writeFileSync(join(root, "meta-state.jsonl"), [
      JSON.stringify(makeRule("rule-zeta", zeta)),
      JSON.stringify(makeRule("rule-alpha", alpha)),
    ].join("\n") + "\n");

    const output = invokeSessionStart(root);
    const context = output.hookSpecificOutput.additionalContext;

    assert.ok(context.includes(alpha));
    assert.ok(context.includes(zeta));
    assert.ok(context.length > 10_000, "the adapter must not apply a local context cap to a multi-partition projection");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Codex session-start adapter parses native events and exposes a typed degraded delivery without blocking startup", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-initial-delivery-degraded-"));
  try {
    const output = invokeSessionStart(root, { hook_event_name: "NotSessionStart" });

    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(output.hookSpecificOutput.additionalContext, /degraded/i);
    assert.match(output.hookSpecificOutput.additionalContext, /invalid_hook_event/i);
    assert.ok(deliveryLog(root).some((entry) => entry.error_code === "invalid_hook_event"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Codex reports Initial Delivery as complete while wider lifecycle participation remains visibly partial", async () => {
  const { validate } = await import(join(PROJECT_ROOT, "tools", "learning-loop-mastra", "interface", "contract.js"));
  const result = validate("codex", PROJECT_ROOT);

  assert.equal(result.ok, false, JSON.stringify(result.path_map));
  assert.ok(result.missing.includes("hook-shim-set"));
  assert.ok(result.missing.includes("settings-integration"));
  assert.equal(result.path_map["codex-initial-delivery"].ok, true);
  assert.equal(result.path_map["codex-initial-delivery"].activation, "synchronous-session-start");
});

test("Codex activation is typed inactive and logged when its native hook registration is invalid", () => {
  const { inspectEffectiveActivation, runCodexInitialDelivery } = require(ADAPTER);
  const root = mkdtempSync(join(tmpdir(), "codex-initial-delivery-inactive-"));
  try {
    mkdirSync(join(root, ".codex", "hooks"), { recursive: true });
    writeFileSync(join(root, ".codex", "hooks.json"), JSON.stringify({ hooks: { SessionStart: [] } }));
    writeFileSync(join(root, ".codex", "config.toml"), "");
    writeFileSync(join(root, ".codex", "hooks", "session-start-i2-delivery.cjs"), "");

    const activation = inspectEffectiveActivation(root);
    assert.equal(activation.status, "inactive");
    assert.equal(activation.errors[0].code, "initial_delivery_inactive");

    const result = runCodexInitialDelivery(JSON.stringify({
      cwd: root,
      hook_event_name: "SessionStart",
      session_id: "inactive-session",
      source: "startup",
    }), root);
    assert.equal(result.delivery.status, "inactive");
    assert.ok(deliveryLog(root).some((entry) => entry.error_code === "initial_delivery_inactive"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
