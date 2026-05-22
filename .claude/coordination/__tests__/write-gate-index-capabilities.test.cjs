const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require("node:fs");
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
  const tmp = mkdtempSync(join(tmpdir(), "write-gate-records-test-"));
  mkdirSync(join(tmp, "records", "observations"), { recursive: true });
  mkdirSync(join(tmp, "records", "index"), { recursive: true });
  mkdirSync(join(tmp, "records", "capabilities"), { recursive: true });
  return tmp;
}

describe("write gate records/** always blocked", () => {
  it("blocks records/index/foo.yaml unconditionally", () => {
    const tmp = createTmpProject();
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "records", "index", "foo.yaml") } },
      { GATE_ROOT: tmp }
    );
    assert.equal(result.exitCode, 2);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.decision, "block");
    assert.equal(parsed.matched_rule, "records/**");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("blocks records/capabilities/api-rest.yaml unconditionally", () => {
    const tmp = createTmpProject();
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "records", "capabilities", "api-rest.yaml") } },
      { GATE_ROOT: tmp }
    );
    assert.equal(result.exitCode, 2);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.decision, "block");
    assert.equal(parsed.matched_rule, "records/**");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("blocks records/evidence/foo.md unconditionally", () => {
    const tmp = createTmpProject();
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "records", "evidence", "foo.md") } },
      { GATE_ROOT: tmp }
    );
    assert.equal(result.exitCode, 2);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.decision, "block");
    assert.equal(parsed.matched_rule, "records/**");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("blocks records/observations/foo.yaml unconditionally", () => {
    const tmp = createTmpProject();
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "records", "observations", "foo.yaml") } },
      { GATE_ROOT: tmp }
    );
    assert.equal(result.exitCode, 2);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.decision, "block");
    assert.equal(parsed.matched_rule, "records/**");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("blocks Edit to records/** as well", () => {
    const tmp = createTmpProject();
    const result = runGate(
      { tool_name: "Edit", tool_input: { file_path: join(tmp, "records", "index", "foo.yaml"), old_string: "x", new_string: "y" } },
      { GATE_ROOT: tmp }
    );
    assert.equal(result.exitCode, 2);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.decision, "block");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("block message mentions MCP tools", () => {
    const tmp = createTmpProject();
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "records", "capabilities", "test.yaml") } },
      { GATE_ROOT: tmp }
    );
    assert.equal(result.exitCode, 2);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.reason.includes("MCP tools"), "reason should mention MCP tools");
    rmSync(tmp, { recursive: true, force: true });
  });
});
