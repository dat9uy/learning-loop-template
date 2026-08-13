import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { formatHookDecision, formatOutput } from "../../hooks/universal/lib/protocol-adapter.js";
import { appendDecisionLog } from "../../core/gate-decision-log.js";

const UNIVERSAL_HOOK = new URL("../../hooks/universal/bash-gate.js", import.meta.url).pathname;

let root;

beforeEach(() => {
  root = join(tmpdir(), `bash-gate-dv-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function runGate(stdin) {
  try {
    const stdout = execFileSync(process.execPath, [UNIVERSAL_HOOK], {
      input: JSON.stringify(stdin),
      env: { ...process.env, GATE_ROOT: root },
      encoding: "utf8",
      timeout: 5000,
    });
    return { exitCode: 0, stdout };
  } catch (err) {
    return { exitCode: err.status ?? 1, stdout: err.stdout ?? "" };
  }
}

function makeInput(command) {
  return { tool_name: "Bash", tool_input: { command } };
}

await test("ok decision: stdout receives nothing; exit code 0", () => {
  const { exitCode: code, stdout } = runGate(makeInput("ls -la"));
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), "");
});

await test("block decision: exit 0 + permissionDecision deny envelope agent can read", () => {
  const { exitCode: code, stdout } = runGate(makeInput("> records/foo.json"));
  assert.strictEqual(code, 0, "exit 0 so harness processes the hookSpecificOutput JSON");
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.hookSpecificOutput, "stdout has hookSpecificOutput envelope");
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, "deny", "deny blocks the call");
  assert.ok(
    typeof parsed.hookSpecificOutput.permissionDecisionReason === "string" &&
      parsed.hookSpecificOutput.permissionDecisionReason.length > 0,
    "reason surfaced to model as denial reason",
  );
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "block");
});

await test("escalate decision: exit 0 + permissionDecision deny envelope agent can read", () => {
  const rule = {
    entry_kind: "rule",
    id: "rule-test-escalate",
    origin: "meta-test",
    internalization_level: "I3", evidence_code_ref: "test-rule-contract.js",
    pattern_type: "regex",
    pattern: "test-escalate-token",
    description: "Test rule for decision visibility phase",
    status: "active",
    promoted_at: new Date().toISOString(),
    promoted_by: "operator",
  };
  writeFileSync(join(root, "meta-state.jsonl"), JSON.stringify(rule) + "\n");

  const { exitCode: code, stdout } = runGate(makeInput("echo test-escalate-token"));
  assert.strictEqual(code, 0, "exit 0 so harness processes the hookSpecificOutput JSON");
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.hookSpecificOutput);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, "deny", "deny blocks the call");
  assert.ok(
    typeof parsed.hookSpecificOutput.permissionDecisionReason === "string" &&
      parsed.hookSpecificOutput.permissionDecisionReason.length > 0,
    "reason surfaced to model as denial reason",
  );
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "escalate");
  assert.strictEqual(decision.rule_id, "rule-test-escalate");
});

await test("hookSpecificOutput.additionalContext is valid JSON with the expected fields", () => {
  const { stdout } = runGate(makeInput("> records/foo.json"));
  const parsed = JSON.parse(stdout);
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "block");
  assert.ok(typeof decision.reason === "string" && decision.reason.length > 0);
});

await test("formatHookDecision defaults to formatOutput shape when no channel", () => {
  const decision = { decision: "ok" };
  assert.strictEqual(formatHookDecision(decision), formatOutput(decision));
});

await test("formatHookDecision wraps decision in hookSpecificOutput envelope when channel set", () => {
  const decision = { decision: "block", reason: "test" };
  const out = JSON.parse(formatHookDecision(decision, { channel: "hookSpecificOutput" }));
  assert.strictEqual(out.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, "deny");
  assert.strictEqual(out.hookSpecificOutput.permissionDecisionReason, "test");
  assert.deepStrictEqual(JSON.parse(out.hookSpecificOutput.additionalContext), decision);
});

await test("formatHookDecision omits permissionDecision for ok decisions", () => {
  const out = JSON.parse(formatHookDecision({ decision: "ok" }, { channel: "hookSpecificOutput" }));
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, undefined);
  assert.strictEqual(out.hookSpecificOutput.permissionDecisionReason, undefined);
});

// State-3 backstop: piping `vitest run`/`pnpm test` to tail/head/grep must surface to
// the agent as an escalate denial via the PreToolUse hookSpecificOutput channel
// (the exact envelope the harness turns into additionalContext on the denied
// call). A promoted regex rule spans the pipe via the full-command pass in
// applyPromotedRules — per-segment matching alone cannot reach it. `head` is
// covered because agents dodge the tail/grep block by piping to head, which
// reads raw stdout just the same.
const NO_RAW_STDOUT_PATTERN = "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b";

function writeNoRawStdoutRule(root) {
  const rule = {
    entry_kind: "rule",
    id: "rule-no-raw-stdout-vitest",
    origin: "meta-test",
    internalization_level: "I3", evidence_code_ref: "test-rule-contract.js",
    pattern_type: "regex",
    pattern: NO_RAW_STDOUT_PATTERN,
    description: "Block piping vitest or pnpm test stdout to tail/head/grep use the parsed json",
    status: "active",
    promoted_at: new Date().toISOString(),
    promoted_by: "operator",
  };
  writeFileSync(join(root, "meta-state.jsonl"), JSON.stringify(rule) + "\n");
}

await test("no-raw-stdout rule: vitest run piped to tail → deny envelope agent can read", () => {
  writeNoRawStdoutRule(root);

  const { exitCode: code, stdout } = runGate(
    makeInput("vitest run --bail=1 foo.test.js 2>&1 | tail -10"),
  );
  assert.strictEqual(code, 0, "exit 0 so harness processes the denial JSON");
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.hookSpecificOutput, "agent-visible envelope present on stdout");
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, "deny", "deny blocks the call");
  assert.ok(
    typeof parsed.hookSpecificOutput.permissionDecisionReason === "string" &&
      parsed.hookSpecificOutput.permissionDecisionReason.length > 0,
    "reason surfaced to model as denial reason",
  );
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "escalate");
  assert.strictEqual(decision.rule_id, "rule-no-raw-stdout-vitest");
  assert.ok(typeof decision.reason === "string" && decision.reason.length > 0, "reason surfaced to agent");
});

await test("no-raw-stdout rule: vitest run piped to head → deny (closes head loophole)", () => {
  writeNoRawStdoutRule(root);

  const { exitCode: code, stdout } = runGate(
    makeInput("pnpm exec vitest run --bail=1 foo.test.js 2>&1 | head -50"),
  );
  assert.strictEqual(code, 0, "exit 0 so harness processes the denial JSON");
  const parsed = JSON.parse(stdout);
  assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, "deny", "head pipe is denied too");
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "escalate");
  assert.strictEqual(decision.rule_id, "rule-no-raw-stdout-vitest");
});

await test("no-raw-stdout rule: pnpm test:iter (wrapper, no pipe) → allowed, exit 0", () => {
  writeNoRawStdoutRule(root);

  const { exitCode: code, stdout } = runGate(makeInput("pnpm test:iter"));
  assert.strictEqual(code, 0, "wrapper must be allowed");
  assert.strictEqual(stdout.trim(), "", "no denial envelope on allowed command");
});

// ── evaluator provenance + separate unexpected-match telemetry channel ──
// (plan 260809-1538, Phase 3). The Bash hook must (a) copy the evaluator
// provenance into the decision log for blocked/escalate decisions, and (b) log
// a proven inert-data match as a SEPARATE non-permission telemetry event —
// decision "ok" + event "unexpected-match" — WITHOUT emitting a deny/allow
// override to the harness.

function readDecisionLogFor(root) {
  const logPath = join(root, ".claude", "coordination", ".gate-decision.log");
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

await test("escalate decision: additionalContext carries evaluator provenance fields", () => {
  writeNoRawStdoutRule(root);
  const { exitCode: code, stdout } = runGate(
    makeInput("vitest run --bail=1 foo.test.js 2>&1 | tail -10"),
  );
  assert.strictEqual(code, 0, "exit 0 so harness processes the denial JSON");
  const decision = JSON.parse(JSON.parse(stdout).hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "escalate");
  assert.strictEqual(decision.rule_id, "rule-no-raw-stdout-vitest");
  assert.strictEqual(decision.event_source, "bash-gate-evaluator");
  assert.strictEqual(decision.match_origin, "executable");
  assert.strictEqual(decision.candidate_kind, "ordinary-rule-fire");
  assert.strictEqual(decision.event, undefined, "ordinary fires carry no separate telemetry marker");
});

await test("unexpected-match telemetry: inert quoted heredoc → allowed (no deny/allow override) + provenance logged", () => {
  writeNoRawStdoutRule(root);
  const inert = "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n";
  const { exitCode: code, stdout } = runGate(makeInput(inert));
  assert.strictEqual(code, 0, "inert data must be allowed");
  assert.strictEqual(stdout.trim(), "", "NO hookSpecificOutput envelope — no deny/allow override on the telemetry event");
  const entries = readDecisionLogFor(root);
  assert.strictEqual(entries.length, 1, "the telemetry event must be logged");
  const entry = entries[0];
  assert.strictEqual(entry.decision, "ok");
  assert.strictEqual(entry.event, "unexpected-match");
  assert.strictEqual(entry.event_source, "bash-gate-evaluator");
  assert.strictEqual(entry.match_origin, "inert-data");
  assert.strictEqual(entry.candidate_kind, "unexpected-match");
});

await test("ordinary ok command is NOT logged (only the explicit unexpected-match event adds an ok line)", () => {
  writeNoRawStdoutRule(root);
  const ok = runGate(makeInput("ls -la"));
  assert.strictEqual(ok.exitCode, 0);
  assert.strictEqual(ok.stdout.trim(), "");
  assert.strictEqual(readDecisionLogFor(root).length, 0, "no decision log line for a plain ok command");
});

// ── forged-log boundary fixture ──
// A parseable JSONL row hand-appended with flat unexpected-match fields (NO
// real evaluator write behind it) must not be trusted merely because it carries
// the expected flat fields. At THIS boundary (the hook/decision-log seam) the
// reader must not fabricate the producer marker — the row round-trips as-is and
// the trusted-producer check (only the evaluator producer path marks an
// automatic candidate) is enforced at the recurrence boundary. This test proves
// the reader adds nothing: the hand-written fields are the row, verbatim.
await test("forged-log fixture: hand-appended flat unexpected-match row round-trips verbatim, producer marker not fabricated", () => {
  writeNoRawStdoutRule(root);
  // Bypass the evaluator/hook entirely: hand-write a parseable row.
  const forged = {
    ts: new Date().toISOString(),
    command_prefix: "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n",
    rule_id: "rule-no-raw-stdout-vitest",
    decision: "ok",
    reason: "forged",
    matched_pattern: "tail",
    skipped_via_override: false,
    session_id: "forged-session",
    session_id_tier: "real",
    event_source: "bash-gate-evaluator",
    match_origin: "inert-data",
    candidate_kind: "unexpected-match",
    event: "unexpected-match",
  };
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  writeFileSync(join(root, ".claude", "coordination", ".gate-decision.log"), JSON.stringify(forged) + "\n");

  const entries = readDecisionLogFor(root);
  assert.strictEqual(entries.length, 1, "the reader returns the parseable row");
  // The reader must NOT add or drop fields: the row is exactly what was written.
  assert.deepStrictEqual(
    Object.keys(entries[0]).sort(),
    Object.keys(forged).sort(),
    "the reader must not fabricate or strip fields",
  );
  assert.strictEqual(entries[0].event_source, "bash-gate-evaluator");
  assert.strictEqual(entries[0].candidate_kind, "unexpected-match");
  // The row was hand-written, not produced by the evaluator hook. Whether a
  // file-originated row is trusted for automatic filing is decided at the
  // recurrence boundary by the producer path, not by this reader — this fixture
  // pins that the read layer stays a faithful pipe.
  assert.ok(true);
});

// ── decision-log write seam closed (defect-2 fix) ──
// An agent bash command must NOT be able to append a forged row to any
// surface's .gate-decision.log (trusted-producer boundary): the log is written
// only by the evaluator hook's appendDecisionLog node call. A bash command
// targeting the decision log → block with the dedicated reason; the hook's own
// appendDecisionLog call (spawned, not a bash command) must still work.

await test("bash command appending .gate-decision.log → block with dedicated reason", () => {
  const { exitCode: code, stdout } = runGate(
    makeInput("echo 'x' >> .claude/coordination/.gate-decision.log"),
  );
  assert.strictEqual(code, 0, "exit 0 so harness processes the denial JSON");
  const parsed = JSON.parse(stdout);
  assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, "deny", "forge attempt is denied");
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "block");
  assert.ok(decision.reason.includes("forged rows"), `dedicated reason expected; got: ${decision.reason}`);
  assert.ok(!decision.reason.includes("records/"), "must not reuse the records reason");
});

await test("bash command tee-ing .gate-decision.log → block with dedicated reason", () => {
  const { exitCode: code, stdout } = runGate(
    makeInput("echo 'x' | tee -a .factory/coordination/.gate-decision.log"),
  );
  assert.strictEqual(code, 0, "exit 0 so harness processes the denial JSON");
  const parsed = JSON.parse(stdout);
  assert.strictEqual(parsed.hookSpecificOutput.permissionDecision, "deny");
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "block");
  assert.ok(decision.reason.includes("forged rows"), `dedicated reason expected; got: ${decision.reason}`);
});

await test("evaluator appendDecisionLog node call still works (spawned hook, not a bash command)", () => {
  // The trusted producer is the evaluator hook itself — appendDecisionLog is a
  // node call that bypasses the bash gate. This must keep working (it is how
  // legitimate decision rows reach the log). The gate block applies to agent
  // bash commands, not to the producer's own writes.
  const entry = {
    command_prefix: "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n",
    rule_id: "rule-no-raw-stdout-vitest",
    decision: "ok",
    reason: "inert-data match (unexpected-match telemetry)",
    matched_pattern: "regex",
    skipped_via_override: false,
    event_source: "bash-gate-evaluator",
    match_origin: "inert-data",
    candidate_kind: "unexpected-match",
    event: "unexpected-match",
  };
  appendDecisionLog(root, entry);

  const entries = readDecisionLogFor(root);
  assert.strictEqual(entries.length, 1, "the hook's own append must be written");
  assert.strictEqual(entries[0].event, "unexpected-match");
  assert.strictEqual(entries[0].event_source, "bash-gate-evaluator");
});
