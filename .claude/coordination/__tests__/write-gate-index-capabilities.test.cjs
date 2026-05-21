const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const GATE_SCRIPT = join(__dirname, "../hooks/write-coordination-gate.cjs");

function runGate(input, env) {
  const result = spawnSync("node", [GATE_SCRIPT], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return {
    exitCode: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function createTmpProject() {
  const tmp = mkdtempSync(join(tmpdir(), "write-gate-test-"));
  mkdirSync(join(tmp, "records", "observations"), { recursive: true });
  mkdirSync(join(tmp, "records", "index"), { recursive: true });
  mkdirSync(join(tmp, "records", "capabilities"), { recursive: true });
  return tmp;
}

describe("write gate index/capabilities", () => {
  it("allows records/index/foo.yaml with active observation", () => {
    const tmp = createTmpProject();
    writeFileSync(
      join(tmp, "records", "observations", "obs-index.yaml"),
      `id: obs-index\nconstraint_type: write-path\nconstraint: records-index\nstatus: active\nupdated_at: ${new Date().toISOString()}\n`
    );
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "records", "index", "foo.yaml") } },
      { GATE_ROOT: tmp }
    );
    assert.equal(result.exitCode, 0, `Expected allow, got: ${result.stdout}`);
  });

  it("blocks records/index/foo.yaml without observation", () => {
    const tmp = createTmpProject();
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "records", "index", "foo.yaml") } },
      { GATE_ROOT: tmp }
    );
    assert.equal(result.exitCode, 2);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.decision, "block");
    assert.ok(parsed.reason.includes("Index/capability"));
  });

  it("allows records/capabilities/api-rest.yaml with active observation", () => {
    const tmp = createTmpProject();
    writeFileSync(
      join(tmp, "records", "observations", "obs-capabilities.yaml"),
      `id: obs-capabilities\nconstraint_type: write-path\nconstraint: records-capabilities\nstatus: active\nupdated_at: ${new Date().toISOString()}\n`
    );
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "records", "capabilities", "api-rest.yaml") } },
      { GATE_ROOT: tmp }
    );
    assert.equal(result.exitCode, 0, `Expected allow, got: ${result.stdout}`);
  });

  it("blocks records/capabilities/api-rest.yaml without observation", () => {
    const tmp = createTmpProject();
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "records", "capabilities", "api-rest.yaml") } },
      { GATE_ROOT: tmp }
    );
    assert.equal(result.exitCode, 2);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.decision, "block");
    assert.ok(parsed.reason.includes("Index/capability"));
  });

  it("escalates when observation is stale", () => {
    const tmp = createTmpProject();
    writeFileSync(
      join(tmp, "records", "observations", "obs-stale.yaml"),
      `id: obs-stale\nconstraint_type: write-path\nconstraint: records-index\nstatus: active\nupdated_at: 2020-01-01T00:00:00Z\n`
    );
    mkdirSync(join(tmp, ".claude", "coordination"), { recursive: true });
    writeFileSync(
      join(tmp, ".claude", "coordination", ".last-operator-message"),
      JSON.stringify({ timestamp: new Date().toISOString(), prompt_snippet: "test" })
    );
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "records", "index", "stale.yaml") } },
      { GATE_ROOT: tmp, GATE_MARKER_PATH: join(tmp, ".claude", "coordination", ".last-operator-message") }
    );
    assert.equal(result.exitCode, 2);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.decision, "escalate");
    assert.equal(parsed.inbound_gate, true);
  });
});
