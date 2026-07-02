/**
 * Audit-log hardening tests (R6 + R17 / Plan 5-Lite Phase 3).
 *
 * Covers:
 *   - R6.1: appendDecisionLog rejects entries whose serialized form contains
 *     a raw `\n` or `\r` (JSONL injection guard).
 *   - R6.2: appendR2DenialLog realpath-resolves the `path` field before
 *     serializing, and rejects raw-newline entries.
 *   - R17: BOOTSTRAP_DENY_PATTERNS in core/r2/ownership.js cover
 *     `runtime-state.jsonl` and `.gate-override` so a write attempt to those
 *     protected files is denied with `bootstrap_deny` (audit_log_protected).
 *   - C5b: the regression cases from the phase file.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { appendDecisionLog } from "../../core/gate-decision-log.js";
import { appendR2DenialLog } from "../../core/r2/denial-log.js";
import { BOOTSTRAP_DENY_PATTERNS, checkR2Ownership } from "../../core/r2/ownership.js";
import { SURFACES } from "../../core/surfaces.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `audit-log-hardening-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function surfaceLogPath(surface) {
  return join(root, surface, "coordination", ".gate-decision.log");
}

// --- R6.1: appendDecisionLog newline injection guard ---

// JSON.stringify escapes control chars in string values (a raw 0x0A in a
// string becomes the two-char escape sequence "\n", not a raw newline byte).
// So the primary defense against JSONL injection is JSON.stringify itself;
// the `gate_log entry contains unescaped newline` assertion is a defense-in-
// depth guard against a future field or serializer regression that lets a
// raw newline reach the serialized line. These tests verify the real security
// property (a malicious newline in any field never produces a forged second
// line in the log) plus the presence of the guard in the source.

test("R6.1 appendDecisionLog safely escapes a raw newline in command_prefix (no forged second line)", () => {
  // oneLinePrefix strips \r\n\t from command_prefix; JSON.stringify would
  // escape it too. Either way, no raw newline reaches the file.
  appendDecisionLog(root, {
    command_prefix: "cmd\n{\"forged\":\"override\"}",
    rule_id: "r",
    decision: "block",
    reason: "matched",
    matched_pattern: null,
    skipped_via_override: false,
  });
  for (const surface of SURFACES) {
    const raw = readFileSync(surfaceLogPath(surface), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    assert.equal(lines.length, 1, `${surface}: no forged second line`);
    const entry = JSON.parse(lines[0]);
    assert.ok(!entry.forged, `${surface}: no forged field injected`);
    assert.ok(!lines[0].includes("\n"), `${surface}: no raw newline in entry`);
    assert.ok(!lines[0].includes("\r"), `${surface}: no raw CR in entry`);
  }
});

test("R6.1 appendDecisionLog safely escapes a raw newline in reason (no forged second line)", () => {
  appendDecisionLog(root, {
    command_prefix: "cmd",
    rule_id: "r",
    decision: "block",
    reason: "ok\n{\"forged\":\"override\"}",
    matched_pattern: null,
    skipped_via_override: false,
  });
  for (const surface of SURFACES) {
    const raw = readFileSync(surfaceLogPath(surface), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    assert.equal(lines.length, 1, `${surface}: no forged second line`);
    const entry = JSON.parse(lines[0]);
    assert.ok(!entry.forged, `${surface}: no forged field injected`);
  }
});

test("R6.1 appendDecisionLog safely escapes a carriage return in any field", () => {
  appendDecisionLog(root, {
    command_prefix: "cmd",
    rule_id: "r",
    decision: "block",
    reason: "ok\r{\"forged\":\"override\"}",
    matched_pattern: null,
    skipped_via_override: false,
  });
  for (const surface of SURFACES) {
    const raw = readFileSync(surfaceLogPath(surface), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    assert.equal(lines.length, 1, `${surface}: no forged second line`);
    assert.ok(!lines[0].includes("\r"), `${surface}: no raw CR in entry`);
  }
});

test("R6.1 appendDecisionLog happy path: serialized line has no raw \\n or \\r", () => {
  appendDecisionLog(root, {
    command_prefix: "node -e 'console.log(1)'",
    rule_id: "rule-x",
    decision: "block",
    reason: "matched",
    matched_pattern: "node -e",
    skipped_via_override: false,
  });
  for (const surface of SURFACES) {
    const raw = readFileSync(surfaceLogPath(surface), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    assert.equal(lines.length, 1);
    assert.ok(!lines[0].includes("\n"), `${surface}: entry line must not contain a raw newline`);
    assert.ok(!lines[0].includes("\r"), `${surface}: entry line must not contain a raw carriage return`);
  }
});

test("R6.1 guard is present in gate-decision-log.js source (defense-in-depth)", () => {
  const src = readFileSync(join(__dirname, "..", "..", "core", "gate-decision-log.js"), "utf8");
  assert.ok(
    src.includes('gate_log entry contains unescaped newline'),
    "gate-decision-log.js must contain the newline assertion guard",
  );
  assert.ok(
    src.includes('line.includes("\\n")') || src.includes("line.includes(\"\\n\")"),
    "gate-decision-log.js must assert the serialized line contains no raw newline",
  );
});

// --- R6.2: appendR2DenialLog realpath pre-resolve + newline guard ---

test("R6.2 appendR2DenialLog realpath-resolves the path field when the path exists", () => {
  // Create a real file and a symlink alias so realpath changes the string.
  const realFile = join(root, "real-target.txt");
  writeFileSync(realFile, "content");
  const alias = join(root, "alias.txt");
  if (process.platform === "win32") {
    // Symlinks on Windows may require elevated privileges; fall back to a
    // direct realpath assertion on the real file.
    symlinkSync(realFile, alias, "file");
  } else {
    symlinkSync(realFile, alias);
  }
  appendR2DenialLog(root, {
    runtime: "claude-code",
    tool: "write_file",
    path: alias,
    reason: "default_deny",
    hint: "operator-controlled",
  });
  for (const surface of SURFACES) {
    const raw = readFileSync(surfaceLogPath(surface), "utf8");
    const entry = JSON.parse(raw.trim());
    // realpathSync resolves the symlink to the real target.
    assert.equal(entry.path, realFile, `${surface}: path should be realpath-resolved`);
    assert.equal(entry.gate, "r2");
  }
});

test("R6.2 appendR2DenialLog logs a non-existent path as-is (realpath failure does not break the log)", () => {
  const nonexistent = join(root, "does", "not", "exist.txt");
  appendR2DenialLog(root, {
    runtime: "claude-code",
    tool: "write_file",
    path: nonexistent,
    reason: "default_deny",
    hint: "operator-controlled",
  });
  for (const surface of SURFACES) {
    const raw = readFileSync(surfaceLogPath(surface), "utf8");
    const entry = JSON.parse(raw.trim());
    assert.equal(entry.path, nonexistent, `${surface}: non-existent path logged as-is`);
  }
});

test("R6.2 appendR2DenialLog safely escapes a raw newline in path (no forged second line)", () => {
  // A path with a raw newline that does NOT exist on disk: realpathSync fails,
  // the path is logged as-is. JSON.stringify escapes the newline; the replace
  // is belt-and-suspenders. No raw newline reaches the file.
  const maliciousPath = "foo\n{\"forged\":\"override\"}";
  appendR2DenialLog(root, {
    runtime: "claude-code",
    tool: "write_file",
    path: maliciousPath,
    reason: "default_deny",
    hint: "operator-controlled",
  });
  for (const surface of SURFACES) {
    const raw = readFileSync(surfaceLogPath(surface), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    assert.equal(lines.length, 1, `${surface}: exactly one log line (no injected line)`);
    assert.ok(!lines[0].includes("\n"), `${surface}: no raw newline in entry`);
    assert.ok(!lines[0].includes("\r"), `${surface}: no raw carriage return in entry`);
    const entry = JSON.parse(lines[0]);
    assert.ok(!entry.forged, `${surface}: no forged field injected`);
  }
});

test("R6.2 appendR2DenialLog safely escapes a raw newline in reason", () => {
  appendR2DenialLog(root, {
    runtime: "claude-code",
    tool: "write_file",
    path: "/tmp/x",
    reason: "ok\n{\"forged\":\"override\"}",
    hint: "operator-controlled",
  });
  for (const surface of SURFACES) {
    const raw = readFileSync(surfaceLogPath(surface), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    assert.equal(lines.length, 1, `${surface}: exactly one log line`);
    assert.ok(!lines[0].includes("\n"));
    const entry = JSON.parse(lines[0]);
    assert.ok(!entry.forged, `${surface}: no forged field injected`);
  }
});

test("R6.2 guard is present in r2/denial-log.js source (defense-in-depth)", () => {
  const src = readFileSync(join(__dirname, "..", "..", "core", "r2", "denial-log.js"), "utf8");
  assert.ok(
    src.includes('gate_log entry contains unescaped newline'),
    "denial-log.js must contain the newline assertion guard",
  );
  assert.ok(
    src.includes("realpathSync"),
    "denial-log.js must realpath-resolve the path field before logging",
  );
});

// --- R17: BOOTSTRAP_DENY_PATTERNS cover runtime-state.jsonl + .gate-override ---

test("R17 BOOTSTRAP_DENY_PATTERNS includes runtime-state.jsonl (bare and nested)", () => {
  assert.ok(BOOTSTRAP_DENY_PATTERNS.includes("runtime-state.jsonl"));
  assert.ok(BOOTSTRAP_DENY_PATTERNS.includes("**/runtime-state.jsonl"));
});

test("R17 BOOTSTRAP_DENY_PATTERNS includes .gate-override (bare and nested)", () => {
  assert.ok(BOOTSTRAP_DENY_PATTERNS.includes(".gate-override"));
  assert.ok(BOOTSTRAP_DENY_PATTERNS.includes("**/.gate-override"));
});

test("R17 checkR2Ownership denies a write to runtime-state.jsonl with bootstrap_deny", () => {
  const allowlist = {
    "claude-code": { own: [".claude/**"], deny: [] },
    droid: { own: [".factory/**"], deny: [] },
    "mastra-code": { own: [".mastracode/**"], deny: [] },
    universal: [],
  };
  const decision = checkR2Ownership({
    runtime: "claude-code",
    path: "runtime-state.jsonl",
    allowlist,
    root,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "bootstrap_deny");
  assert.ok(decision.hint.includes("operator-controlled"), `hint should mention operator-controlled: ${decision.hint}`);
});

test("R17 checkR2Ownership denies a write to a nested runtime-state.jsonl with bootstrap_deny", () => {
  const allowlist = {
    "claude-code": { own: [".claude/**"], deny: [] },
    droid: { own: [".factory/**"], deny: [] },
    "mastra-code": { own: [".mastracode/**"], deny: [] },
    universal: [],
  };
  const decision = checkR2Ownership({
    runtime: "droid",
    path: ".claude/coordination/runtime-state.jsonl",
    allowlist,
    root,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "bootstrap_deny");
});

test("R17 checkR2Ownership denies a write to .gate-override with bootstrap_deny", () => {
  const allowlist = {
    "claude-code": { own: [".claude/**"], deny: [] },
    droid: { own: [".factory/**"], deny: [] },
    "mastra-code": { own: [".mastracode/**"], deny: [] },
    universal: [],
  };
  const decision = checkR2Ownership({
    runtime: "mastra-code",
    path: ".mastracode/coordination/.gate-override",
    allowlist,
    root,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "bootstrap_deny");
});

test("R17 bootstrap_deny wins even for the runtime that 'owns' the surface dir", () => {
  // claude-code owns .claude/**, but a write to .claude/coordination/runtime-state.jsonl
  // must still be bootstrap-denied (R1 self-bootstrap defense).
  const allowlist = {
    "claude-code": { own: [".claude/**"], deny: [] },
    droid: { own: [".factory/**"], deny: [] },
    "mastra-code": { own: [".mastracode/**"], deny: [] },
    universal: [],
  };
  const decision = checkR2Ownership({
    runtime: "claude-code",
    path: ".claude/coordination/runtime-state.jsonl",
    allowlist,
    root,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "bootstrap_deny");
});

// --- C5b: regression cases from the phase file ---

test("C5b newline_in_path_rejected: a forged second line never reaches the log file", () => {
  appendR2DenialLog(root, {
    runtime: "claude-code",
    tool: "write_file",
    path: "foo\n{\"forged\":\"override\"}",
    reason: "default_deny",
    hint: "operator-controlled",
  });
  for (const surface of SURFACES) {
    const raw = readFileSync(surfaceLogPath(surface), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    assert.equal(lines.length, 1, `${surface}: no forged second line`);
    const entry = JSON.parse(lines[0]);
    assert.ok(!entry.forged, `${surface}: no forged field injected`);
  }
});

test("C5b carriage_return_rejected: a carriage return never reaches the log file", () => {
  appendR2DenialLog(root, {
    runtime: "claude-code",
    tool: "write_file",
    path: "foo\r{\"forged\":\"override\"}",
    reason: "default_deny",
    hint: "operator-controlled",
  });
  for (const surface of SURFACES) {
    const raw = readFileSync(surfaceLogPath(surface), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    assert.equal(lines.length, 1, `${surface}: no forged second line`);
    assert.ok(!lines[0].includes("\r"), `${surface}: no raw CR in entry`);
  }
});

test("C5b serialized_entry_has_no_raw_newline: happy-path R2 denial line is single-line JSON", () => {
  appendR2DenialLog(root, {
    runtime: "claude-code",
    tool: "write_file",
    path: "/some/path/file.txt",
    reason: "default_deny",
    hint: "operator-controlled",
  });
  for (const surface of SURFACES) {
    const raw = readFileSync(surfaceLogPath(surface), "utf8");
    const lines = raw.split("\n").filter(Boolean);
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.gate, "r2");
    assert.equal(entry.runtime, "claude-code");
  }
});

test("C5b runtime_state_jsonl_denied_by_bootstrap: R2 denies writes to runtime-state.jsonl", () => {
  const allowlist = {
    "claude-code": { own: [".claude/**", "runtime-state.jsonl"], deny: [] },
    droid: { own: [".factory/**"], deny: [] },
    "mastra-code": { own: [".mastracode/**"], deny: [] },
    universal: [],
  };
  // Even with runtime-state.jsonl in claude-code's own list, bootstrap_deny wins.
  const decision = checkR2Ownership({
    runtime: "claude-code",
    path: "runtime-state.jsonl",
    allowlist,
    root,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "bootstrap_deny");
});

test("C5b gate_override_denied_by_bootstrap: R2 denies writes to .gate-override", () => {
  const allowlist = {
    "claude-code": { own: [".claude/**", ".gate-override"], deny: [] },
    droid: { own: [".factory/**"], deny: [] },
    "mastra-code": { own: [".mastracode/**"], deny: [] },
    universal: [],
  };
  const decision = checkR2Ownership({
    runtime: "claude-code",
    path: ".claude/coordination/.gate-override",
    allowlist,
    root,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "bootstrap_deny");
});