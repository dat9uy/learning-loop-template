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

// The write gate denies via exit 0 + `permissionDecision: "deny"` (the modern
// PreToolUse block protocol). Rich fields (decision, matched_rule, reason) live
// in hookSpecificOutput.additionalContext.
function parseDecision(stdout) {
  try {
    const p = JSON.parse(stdout);
    if (p?.hookSpecificOutput?.additionalContext) return JSON.parse(p.hookSpecificOutput.additionalContext);
    return p;
  } catch {
    return null;
  }
}
function denied(r) {
  if (r.exitCode !== 0) return false;
  try {
    return JSON.parse(r.stdout)?.hookSpecificOutput?.permissionDecision === "deny";
  } catch {
    return false;
  }
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
    assert.ok(denied(result), "denied via permissionDecision");
    const parsed = parseDecision(result.stdout);
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
    assert.ok(denied(result), "denied via permissionDecision");
    const parsed = parseDecision(result.stdout);
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
    assert.ok(denied(result), "denied via permissionDecision");
    const parsed = parseDecision(result.stdout);
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
    assert.ok(denied(result), "denied via permissionDecision");
    const parsed = parseDecision(result.stdout);
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
    assert.ok(denied(result), "denied via permissionDecision");
    const parsed = parseDecision(result.stdout);
    assert.equal(parsed.decision, "block");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("block message mentions MCP tools", () => {
    const tmp = createTmpProject();
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "records", "capabilities", "test.yaml") } },
      { GATE_ROOT: tmp }
    );
    assert.ok(denied(result), "denied via permissionDecision");
    const parsed = parseDecision(result.stdout);
    assert.ok(parsed.reason.includes("MCP tools"), "reason should mention MCP tools");
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("write gate meta-state.jsonl always blocked (audit-log gap closure)", () => {
  // Closes the audit-log gap identified in plans/reports/debugger-260626-1535-
  // phase-e-plan-7-audit-gap-mechanism-investigation.md. The bash gate blocks
  // shell writes to meta-state.jsonl but Claude Code's Write/Edit tools bypass
  // the bash gate. This rule ensures Write/Edit/Create/ApplyPatch to the
  // registry is also blocked at the PreToolUse hook layer, forcing all
  // mutations through MCP tools (which log to gate-log.jsonl).
  function createProjectWithMetaState() {
    const tmp = mkdtempSync(join(tmpdir(), "write-gate-meta-state-test-"));
    writeFileSync(join(tmp, "meta-state.jsonl"), "");
    return tmp;
  }

  it("blocks Write to meta-state.jsonl unconditionally", () => {
    const tmp = createProjectWithMetaState();
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "meta-state.jsonl"), content: "{}" } },
      { GATE_ROOT: tmp }
    );
    assert.ok(denied(result), "denied via permissionDecision");
    const parsed = parseDecision(result.stdout);
    assert.equal(parsed.decision, "block");
    assert.equal(parsed.matched_rule, "meta-state.jsonl");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("blocks Edit to meta-state.jsonl unconditionally", () => {
    const tmp = createProjectWithMetaState();
    const result = runGate(
      { tool_name: "Edit", tool_input: { file_path: join(tmp, "meta-state.jsonl"), old_string: "x", new_string: "y" } },
      { GATE_ROOT: tmp }
    );
    assert.ok(denied(result), "denied via permissionDecision");
    const parsed = parseDecision(result.stdout);
    assert.equal(parsed.decision, "block");
    assert.equal(parsed.matched_rule, "meta-state.jsonl");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("block message references MCP tools and audit-log gap", () => {
    const tmp = createProjectWithMetaState();
    const result = runGate(
      { tool_name: "Write", tool_input: { file_path: join(tmp, "meta-state.jsonl"), content: "{}" } },
      { GATE_ROOT: tmp }
    );
    assert.ok(denied(result), "denied via permissionDecision");
    const parsed = parseDecision(result.stdout);
    assert.ok(parsed.reason.includes("MCP"), "reason should mention MCP tools");
    rmSync(tmp, { recursive: true, force: true });
  });
});
