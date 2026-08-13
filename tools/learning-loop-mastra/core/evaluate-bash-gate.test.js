/**
 * TDD red tests for evaluateBashGate + PATH_WRITE_PATTERNS.
 *
 * Signature contract (locked):
 *   evaluateBashGate({ command, root }) → { decision, reason?, hard_block?, constraint_type?, rule_id?, pattern_type? }
 *   PATH_WRITE_PATTERNS → RegExp[] (3 records + 2×SURFACES preflight + 4 state-file patterns)
 *
 * Tests import from ./evaluate-bash-gate.js (does not exist yet → ERR_MODULE_NOT_FOUND = intended TDD red).
 */

import { test } from "vitest";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  evaluateBashGate,
  PATH_WRITE_PATTERNS,
  DECISION_LOG_WRITE_PATTERNS,
  DECISION_LOG_WRITE_REASON,
} from "./evaluate-bash-gate.js";
import { SURFACES } from "./surfaces.js";

// ── helpers ──

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "eval-bash-gate-test-"));
}

function writeRuntimeState(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(join(root, "runtime-state.jsonl"), lines + "\n");
}

// ── constraint pattern + observation ──

test("constraint match + active observation → ok", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    { id: "obs-1", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: new Date().toISOString() },
  ]);
  const result = evaluateBashGate({ command: "pip install vnstock", root });
  assert.strictEqual(result.decision, "ok");
});

test("constraint match + no observation → block", () => {
  const root = makeRoot();
  // No runtime-state.jsonl → no observations
  const result = evaluateBashGate({ command: "pip install vnstock", root });
  assert.strictEqual(result.decision, "block");
  assert.ok(result.reason);
  assert.strictEqual(result.constraint_type, "package-manager");
});

test("side-effect-import → hard block", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "python -c 'import vnstock_data'", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

// ── PATH_WRITE_PATTERNS ──

test("redirect to records/ → block", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo foo > records/meta/test.json", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("heredoc to records/ → block", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "cat <<EOF > records/meta/test.json", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("tee to records/ → block", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo data | tee records/meta/test.json", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("redirect to .loop-preflight marker → block", () => {
  const root = makeRoot();
  const result = evaluateBashGate({
    command: "echo done > .claude/coordination/.loop-preflight-product",
    root,
  });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("tee to meta-state.jsonl → block", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo data | tee meta-state.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("redirect to runtime-state.jsonl → block", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo data > runtime-state.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("redirect to session-local substrate (.loop/runtime-state-local.jsonl) → block, edit-marker reason", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo data > .loop/runtime-state-local.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.ok(
    result.reason.includes("gate_mark_preflight") && result.reason.includes("runtime-state-edit"),
    `reason must name gate_mark_preflight(surface:'runtime-state-edit'); got: ${result.reason}`,
  );
});

test("tee to session-local substrate → block", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo data | tee .loop/runtime-state-local.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("redirect to session-local substrate WITH active edit marker → ok", () => {
  const root = makeRoot();
  writeRuntimeStatePreflightMarker(root);
  const result = evaluateBashGate({ command: "echo data > .loop/runtime-state-local.jsonl", root });
  assert.strictEqual(result.decision, "ok", `expected ok with active marker; got: ${JSON.stringify(result)}`);
});

// ── runtime-state preflight exemption (edit marker) ──

test("redirect to runtime-state.jsonl without marker → block, reason names gate_mark_preflight(surface:'runtime-state-edit'), NOT records reason", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo data > runtime-state.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.ok(
    result.reason.includes("gate_mark_preflight") && result.reason.includes("runtime-state-edit"),
    `reason must name gate_mark_preflight(surface:'runtime-state-edit'); got: ${result.reason}`,
  );
  assert.ok(
    !result.reason.includes("Direct writes to records"),
    `reason must not be the records reason; got: ${result.reason}`,
  );
});

test("tee to runtime-state.jsonl without marker → block with dedicated canonical-workflow reason", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo data | tee runtime-state.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.ok(result.reason.includes("gate_mark_preflight"));
});

function writeRuntimeStatePreflightMarker(root) {
  // Reuse the same temp-root pattern as the runtime-tracking marker tests;
  // bash-gate's marker check scans every runtime surface coordination dir.
  // Direct shell writes are gated on the edit marker, split from the append
  // marker so routine runtime_state_record appends don't keep this gate warm.
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
  writeFileSync(
    join(root, ".factory", "coordination", ".loop-preflight-runtime-state-edit"),
    JSON.stringify({ surface: "runtime-state-edit", completed_at: new Date().toISOString() }),
    "utf8",
  );
}

test("redirect to runtime-state.jsonl with only the APPEND marker active → still blocked (markers are decoupled)", () => {
  const root = makeRoot();
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
  writeFileSync(
    join(root, ".factory", "coordination", ".loop-preflight-runtime-state"),
    JSON.stringify({ surface: "runtime-state", completed_at: new Date().toISOString() }),
    "utf8",
  );
  const result = evaluateBashGate({ command: "echo data > runtime-state.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("redirect to runtime-state.jsonl WITH active marker → ok", () => {
  const root = makeRoot();
  writeRuntimeStatePreflightMarker(root);
  const result = evaluateBashGate({ command: "echo data > runtime-state.jsonl", root });
  assert.strictEqual(result.decision, "ok", `expected ok with active marker; got: ${JSON.stringify(result)}`);
});

test("tee to runtime-state.jsonl WITH active marker → ok", () => {
  const root = makeRoot();
  writeRuntimeStatePreflightMarker(root);
  const result = evaluateBashGate({ command: "echo data | tee runtime-state.jsonl", root });
  assert.strictEqual(result.decision, "ok");
});

test("with runtime-state marker active, records/x.md still hard-blocked (no exemption bleed)", () => {
  const root = makeRoot();
  writeRuntimeStatePreflightMarker(root);
  const result = evaluateBashGate({ command: "echo data > records/meta/test.json", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("with runtime-state marker active, meta-state.jsonl still hard-blocked (no exemption bleed)", () => {
  const root = makeRoot();
  writeRuntimeStatePreflightMarker(root);
  const result = evaluateBashGate({ command: "echo data > meta-state.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("with runtime-state marker active, .loop/runtime-tracking.json still hard-blocked (no exemption bleed)", () => {
  const root = makeRoot();
  writeRuntimeStatePreflightMarker(root);
  const result = evaluateBashGate({ command: "echo data > .loop/runtime-tracking.json", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

// ── compound commands: an exempted runtime-state write must not mask a gated write chained behind it ──

test("compound: runtime-state write + records write WITH active marker → still hard-blocked", () => {
  const root = makeRoot();
  writeRuntimeStatePreflightMarker(root);
  const result = evaluateBashGate({ command: "echo ok > runtime-state.jsonl && echo evil > records/meta/pwn.json", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.ok(result.reason.includes("records"), `expected records-class reason; got: ${result.reason}`);
});

test("compound: runtime-state write + meta-state write WITH active marker → still hard-blocked", () => {
  const root = makeRoot();
  writeRuntimeStatePreflightMarker(root);
  const result = evaluateBashGate({ command: "echo ok > runtime-state.jsonl; echo evil > meta-state.jsonl", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("compound: runtime-state write + runtime-tracking write WITH active marker → still hard-blocked", () => {
  const root = makeRoot();
  writeRuntimeStatePreflightMarker(root);
  const result = evaluateBashGate({ command: "echo ok > runtime-state.jsonl && echo evil > .loop/runtime-tracking.json", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("compound: runtime-state write + records write WITHOUT marker → blocked (runtime-state reason wins)", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo ok > runtime-state.jsonl && echo evil > records/meta/pwn.json", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("compound: local-substrate write + records write WITH active marker → still hard-blocked (independence holds)", () => {
  const root = makeRoot();
  writeRuntimeStatePreflightMarker(root);
  const result = evaluateBashGate({ command: "echo ok > .loop/runtime-state-local.jsonl && echo evil > records/meta/pwn.json", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.ok(result.reason.includes("records"), `expected records-class reason; got: ${result.reason}`);
});

// ── promoted rules ──

test("promoted regex rule matching command → escalate", () => {
  const root = makeRoot();
  // Write a rule into meta-state.jsonl
  const rule = JSON.stringify({
    id: "rule-no-docker",
    entry_kind: "rule",
    origin: "meta-test-origin",
    status: "active",
    internalization_level: "I3", evidence_code_ref: "test-rule-contract.js",
    pattern_type: "regex",
    pattern: "\\bdocker\\b",
    description: "Block docker commands in the shell",
    promoted_at: new Date().toISOString(),
    promoted_by: "test",
  });
  writeFileSync(join(root, "meta-state.jsonl"), rule + "\n");
  const result = evaluateBashGate({ command: "docker run ubuntu", root });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-no-docker");
});

// ── promoted rule: no raw-stdout parsing of vitest (State-3 backstop) ──
// The agent must iterate via `pnpm test:iter` (parsed JSON summary) or
// `vitest-failures.sh`, not pipe `vitest run`/`pnpm test` to tail/head/grep. The
// gate is the deterministic backstop; the wrapper is the positive path. `head`
// is covered because agents dodge the tail/grep block by piping to head, which
// reads raw stdout just the same.

const NO_RAW_STDOUT_PATTERN = "(vitest run|pnpm test\\b).*\\| *(tail|head|grep)\\b";

function writeNoRawStdoutRule(root) {
  const rule = JSON.stringify({
    id: "rule-no-raw-stdout-vitest",
    entry_kind: "rule",
    origin: "meta-test-origin",
    status: "active",
    internalization_level: "I3", evidence_code_ref: "test-rule-contract.js",
    pattern_type: "regex",
    pattern: NO_RAW_STDOUT_PATTERN,
    description: "Block piping vitest/pnpm-test stdout to tail/head/grep; use pnpm test:iter or vitest-failures.sh",
    promoted_at: new Date().toISOString(),
    promoted_by: "test",
  });
  writeFileSync(join(root, "meta-state.jsonl"), rule + "\n");
}

test("vitest run piped to tail → escalate", () => {
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({ command: "vitest run --bail=1 foo.test.js 2>&1 | tail -10", root });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-no-raw-stdout-vitest");
});

test("vitest run piped to grep → escalate", () => {
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({ command: "vitest run --bail=1 foo.test.js 2>&1 | grep -A 2 FAIL", root });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-no-raw-stdout-vitest");
});

test("vitest run piped to head → escalate (closes head loophole)", () => {
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({ command: "pnpm exec vitest run --bail=1 foo.test.js 2>&1 | head -50", root });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-no-raw-stdout-vitest");
});

test("pnpm test piped to tail → escalate", () => {
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({ command: "pnpm test 2>&1 | tail -10", root });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-no-raw-stdout-vitest");
});

test("pnpm exec vitest run piped to tail → escalate", () => {
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({ command: "pnpm exec vitest run --bail=1 foo.test.js 2>&1 | tail -10", root });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-no-raw-stdout-vitest");
});

test("bash -c \"vitest run …\" piped to tail → escalate (executable body never unexpected)", () => {
  // A bash -c body executes, so a banned token inside is a real violation. The
  // scenario matrix (plan 260809-1538) requires this shape to stay visible and
  // ordinary — never an unexpected-match even though it recurs.
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({ command: 'bash -c "vitest run --bail=1 foo.test.js 2>&1 | tail -10"', root });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-no-raw-stdout-vitest");
  assert.notStrictEqual(result.candidate_kind, "unexpected-match", "executable body must never be unexpected-match");
});

test("unquoted executor heredoc with raw vitest pipe → escalate (never unexpected)", () => {
  // Unquoted `<<EOF` bodies POSIX-expand, so they can execute. The gate keeps
  // them visible; the heredoc plan's tracker-side coarser key collapses the
  // residual class, but the gate decision must stay escalate/ordinary.
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({ command: "cat <<EOF\nvitest run foo.test.js 2>&1 | tail -10\nEOF\n", root });
  assert.strictEqual(result.decision, "escalate");
  assert.strictEqual(result.rule_id, "rule-no-raw-stdout-vitest");
  assert.notStrictEqual(result.candidate_kind, "unexpected-match", "unquoted heredoc body must never be unexpected-match");
});

test("proven inert-data quoted heredoc → decision ok + separate unexpected-match telemetry marker", () => {
  // The telemetry event must flow through evaluateBashGate as decision "ok"
  // (the raw text is inert data — no permission change) plus the
  // `event: "unexpected-match"` marker the hook logs without a deny/allow
  // envelope. This must NOT surface as a block/escalate.
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({
    command: "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n",
    root,
  });
  assert.strictEqual(result.decision, "ok", "inert data must not escalate or block");
  assert.strictEqual(result.event, "unexpected-match");
  assert.strictEqual(result.event_source, "bash-gate-evaluator");
  assert.strictEqual(result.match_origin, "inert-data");
  assert.strictEqual(result.candidate_kind, "unexpected-match");
  assert.strictEqual(result.hard_block, undefined, "telemetry event must not carry a permission decision");
});

test("inert-data telemetry must NOT override a real constraint (docker + inert heredoc → block)", () => {
  // Precedence lock: a command that is BOTH a proven inert unexpected-match
  // AND a real first-class constraint must still escalate/block via the
  // constraint. The telemetry event never wins over a real permission decision.
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({
    command: "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n; docker run ubuntu",
    root,
  });
  assert.strictEqual(result.decision, "block", "docker constraint must win over the telemetry event");
  assert.strictEqual(result.constraint_type, "docker");
  assert.notStrictEqual(result.event, "unexpected-match", "blocked command must not carry the ok telemetry marker");
});

// False positives — the sanctioned paths must NOT match.

test("pnpm test:iter (wrapper, no pipe) → ok", () => {
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({ command: "pnpm test:iter", root });
  assert.strictEqual(result.decision, "ok");
});

test("bare vitest run --bail=1 (no pipe) → ok", () => {
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({ command: "vitest run --bail=1 foo.test.js", root });
  assert.strictEqual(result.decision, "ok");
});

test("vitest-failures.sh (parser, not vitest run) → ok", () => {
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  // `bash` is an observation-gated gate-verb; record the observation the
  // sanctioned workflow requires, then assert the no-raw-stdout rule does
  // not trip on the parser script.
  writeRuntimeState(root, [
    { id: "obs-bash", kind: "budget-state", status: "active", affected_system: "gate-verb:bash", timestamp: new Date().toISOString() },
  ]);
  const result = evaluateBashGate({ command: "bash tools/scripts/vitest-failures.sh", root });
  assert.strictEqual(result.decision, "ok");
});

test("vitest-failures.sh piped to head (display truncation of parsed output) → ok", () => {
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  writeRuntimeState(root, [
    { id: "obs-bash", kind: "budget-state", status: "active", affected_system: "gate-verb:bash", timestamp: new Date().toISOString() },
  ]);
  const result = evaluateBashGate({ command: "bash tools/scripts/vitest-failures.sh 2>&1 | head -40", root });
  assert.strictEqual(result.decision, "ok");
});

// Gate-verb observation path, end to end through the runtime-state
// projection (the unit tests for matchGateVerb/makeGateDecision use
// synthetic observation objects; this pair proves the recorded-observation
// unlock actually reaches the decision).
test("gate-verb:bash + recorded observation → ok; without → block", () => {
  const blockedRoot = makeRoot();
  const blocked = evaluateBashGate({ command: "bash tools/scripts/vitest-failures.sh", root: blockedRoot });
  assert.strictEqual(blocked.decision, "block");
  assert.strictEqual(blocked.constraint_type, "gate-verb:bash");

  const observedRoot = makeRoot();
  writeRuntimeState(observedRoot, [
    { id: "obs-bash", kind: "budget-state", status: "active", affected_system: "gate-verb:bash", timestamp: new Date().toISOString() },
  ]);
  const observed = evaluateBashGate({ command: "bash tools/scripts/vitest-failures.sh", root: observedRoot });
  assert.strictEqual(observed.decision, "ok");
});

test("gate-verb observation older than the operator marker → escalate (staleness parity with the constraint path)", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    {
      id: "obs-bash",
      kind: "budget-state",
      status: "active",
      affected_system: "gate-verb:bash",
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
  ]);
  // Fresh operator state-change marker → the 10-min-old observation is stale
  // by marker (markerTime > updated_at) while still inside the 30-min age
  // window for gate-verb observations, so marker-mode staleness is what
  // escalates here.
  const markerPath = join(root, "marker.json");
  writeFileSync(markerPath, JSON.stringify({ timestamp: new Date().toISOString() }));
  process.env.GATE_MARKER_PATH = markerPath;
  try {
    const result = evaluateBashGate({ command: "bash tools/scripts/vitest-failures.sh", root });
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.inbound_gate, true);
  } finally {
    delete process.env.GATE_MARKER_PATH;
  }
});

test("pnpm test full suite (no pipe) → ok", () => {
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({ command: "pnpm test", root });
  assert.strictEqual(result.decision, "ok");
});

// ── safe commands → ok ──

test("safe command (ls) → ok", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "ls -la", root });
  assert.strictEqual(result.decision, "ok");
});

test("empty command → ok", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "", root });
  assert.strictEqual(result.decision, "ok");
});

test("null command → ok", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: null, root });
  assert.strictEqual(result.decision, "ok");
});

// ── PATH_WRITE_PATTERNS array ──

test("PATH_WRITE_PATTERNS count scales with SURFACES (3 records + 2/surface preflight + 4/surface decision-log + 8 state files)", () => {
  assert.ok(Array.isArray(PATH_WRITE_PATTERNS));
  assert.strictEqual(PATH_WRITE_PATTERNS.length, 3 + 2 * SURFACES.length + 4 * SURFACES.length + 8);
  // Every entry should be a RegExp
  for (const p of PATH_WRITE_PATTERNS) {
    assert.ok(p instanceof RegExp);
  }
});

test("PATH_WRITE_PATTERNS blocks every surface's preflight-marker redirect and tee", () => {
  // Derived from SURFACES: each runtime surface's coordination/.loop-preflight-*
  // redirect (`>`/`>>`) and `tee` must be detected. Catches the failure mode
  // where a surface is added to SURFACES but not covered by the patterns.
  // (.forEach, not for-of, so this core/*.test.js file does not trip the
  // "no inline for-of-SURFACES loops" invariant that scans core/.)
  SURFACES.forEach((surface) => {
    const redirect = `echo done > ${surface}/coordination/.loop-preflight-product`;
    const tee = `echo done | tee ${surface}/coordination/.loop-preflight-product`;
    assert.ok(
      PATH_WRITE_PATTERNS.some((p) => p.test(redirect)),
      `redirect to ${surface} should be detected as a path-write`,
    );
    assert.ok(
      PATH_WRITE_PATTERNS.some((p) => p.test(tee)),
      `tee to ${surface} should be detected as a path-write`,
    );
  });
});

// ── decision-log path gate (trusted-producer boundary, defect-2 fix) ──
// The .gate-decision.log is written ONLY by the bash-gate evaluator hook
// (appendDecisionLog node call, spawned — bypasses the bash gate). An agent
// bash command appending a row would forge evaluator provenance, so any shell
// redirect/append/tee to a surface's decision log must hard-block with the
// DEDICATED reason (not the records/ reason).

test("echo append to .claude decision log → block with dedicated reason", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo 'x' >> .claude/coordination/.gate-decision.log", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.strictEqual(result.reason, DECISION_LOG_WRITE_REASON);
  assert.ok(!result.reason.includes("records/"), "must not reuse the records reason");
});

test("tee append to .claude decision log → block with dedicated reason", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo 'x' | tee -a .claude/coordination/.gate-decision.log", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.strictEqual(result.reason, DECISION_LOG_WRITE_REASON);
});

test(".factory and .mastracode decision-log appends → block with dedicated reason", () => {
  const root = makeRoot();
  const factory = evaluateBashGate({ command: "echo 'x' >> .factory/coordination/.gate-decision.log", root });
  assert.strictEqual(factory.decision, "block");
  assert.strictEqual(factory.hard_block, true);
  assert.strictEqual(factory.reason, DECISION_LOG_WRITE_REASON);

  const mastracode = evaluateBashGate({ command: "echo 'x' | tee -a .mastracode/coordination/.gate-decision.log", root });
  assert.strictEqual(mastracode.decision, "block");
  assert.strictEqual(mastracode.hard_block, true);
  assert.strictEqual(mastracode.reason, DECISION_LOG_WRITE_REASON);
});

test("DECISION_LOG_WRITE_PATTERNS covers every surface's decision-log redirect and tee", () => {
  // Derived from SURFACES — catches the failure mode where a surface is added
  // to SURFACES but not covered by the decision-log gate. (.forEach, not
  // for-of, per the core/ no-inline-for-of-SURFACES-loop invariant.)
  SURFACES.forEach((surface) => {
    const redirect = `echo x > ${surface}/coordination/.gate-decision.log`;
    const append = `echo x >> ${surface}/coordination/.gate-decision.log`;
    const tee = `echo x | tee -a ${surface}/coordination/.gate-decision.log`;
    assert.ok(
      DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(redirect)),
      `redirect to ${surface} decision log should be detected`,
    );
    assert.ok(
      DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(append)),
      `append to ${surface} decision log should be detected`,
    );
    assert.ok(
      DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(tee)),
      `tee to ${surface} decision log should be detected`,
    );
  });
});

test("plain echo (no gated path) → ok, not blocked by the decision-log gate", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "echo 'x'", root });
  assert.strictEqual(result.decision, "ok");
});

// cp/mv/dd/install/rsync can overwrite or append the decision log without a
// redirect operator, so the redirect/tee patterns alone do not close the seam.
// Each must hard-block with the dedicated decision-log reason (forged rows
// carrying the evaluator producer trio would be trusted by the tracker).
test("cp into .claude decision log → block with dedicated reason", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "cp /tmp/forged.json .claude/coordination/.gate-decision.log", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.strictEqual(result.reason, DECISION_LOG_WRITE_REASON);
});

test("mv into .factory decision log → block with dedicated reason", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "mv /tmp/evil .factory/coordination/.gate-decision.log", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.reason, DECISION_LOG_WRITE_REASON);
});

test("dd of= into .claude decision log → block with dedicated reason", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "dd if=/tmp/forged.json of=.claude/coordination/.gate-decision.log", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.reason, DECISION_LOG_WRITE_REASON);
});

test("install into .mastracode decision log → block with dedicated reason", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "install -m 644 /tmp/forged.json .mastracode/coordination/.gate-decision.log", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.reason, DECISION_LOG_WRITE_REASON);
});

test("rsync into .claude decision log → block with dedicated reason", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "rsync /tmp/forged.json .claude/coordination/.gate-decision.log", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.reason, DECISION_LOG_WRITE_REASON);
});

test("DECISION_LOG_WRITE_PATTERNS covers every surface's decision-log cp/mv/dd/install/rsync", () => {
  SURFACES.forEach((surface) => {
    const cp = `cp /tmp/x ${surface}/coordination/.gate-decision.log`;
    const mv = `mv /tmp/x ${surface}/coordination/.gate-decision.log`;
    const dd = `dd if=/tmp/x of=${surface}/coordination/.gate-decision.log`;
    const install = `install -m 644 /tmp/x ${surface}/coordination/.gate-decision.log`;
    const rsync = `rsync /tmp/x ${surface}/coordination/.gate-decision.log`;
    assert.ok(DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(cp)), `cp to ${surface} decision log should be detected`);
    assert.ok(DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(mv)), `mv to ${surface} decision log should be detected`);
    assert.ok(DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(dd)), `dd of= to ${surface} decision log should be detected`);
    assert.ok(DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(install)), `install to ${surface} decision log should be detected`);
    assert.ok(DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(rsync)), `rsync to ${surface} decision log should be detected`);
  });
});

// ── decision combination ──

test("constraint block + path-write block → hard_block wins", () => {
  const root = makeRoot();
  // No observations → constraint should block; path-write also blocks
  const result = evaluateBashGate({
    command: "pip install vnstock && echo data > records/meta/test.json",
    root,
  });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("constraint ok + path-write block → path wins", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    { id: "obs-1", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: new Date().toISOString() },
  ]);
  const result = evaluateBashGate({
    command: "pip install vnstock && echo data > records/meta/test.json",
    root,
  });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

// ── gate-verb block remediation (self-remediating block message) ──

test("gate-verb:bash block reason carries the 2-call remediation incantation", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "bash -c 'echo hi'", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "gate-verb:bash");
  assert.ok(result.reason.includes('gate_mark_preflight({surface:"runtime-state"})'));
  assert.ok(result.reason.includes('runtime_state_record({affected_system:"gate-verb:bash"'));
  assert.ok(result.reason.includes('kind:"budget-state"'));
  assert.ok(result.reason.includes('id:"gate-verb:bash"'));
  assert.ok(result.reason.includes('source_ref:"local:meta-state:gate-verb-allowance"'));
  assert.ok(result.reason.includes("id MUST equal affected_system"));
});

test("gate-verb block reason embeds a fresh ISO timestamp", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "bash -c 'echo hi'", root });
  assert.strictEqual(result.decision, "block");
  const match = result.reason.match(/timestamp:"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z)"/);
  assert.ok(match, "reason must embed a timestamp field with an ISO value");
  // Fresh: within the last minute of the assertion running.
  assert.ok(Date.now() - Date.parse(match[1]) < 60 * 1000);
});

test("gate-verb remediation substitutes the matched verb (node)", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: 'node -e "1"', root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.constraint_type, "gate-verb:node");
  assert.ok(result.reason.includes('runtime_state_record({affected_system:"gate-verb:node"'));
  assert.ok(result.reason.includes('id:"gate-verb:node"'));
  assert.ok(!result.reason.includes('affected_system:"gate-verb:bash"'));
});

test("non-gate-verb constraint block (docker) is NOT enriched with the incantation", () => {
  const root = makeRoot();
  const result = evaluateBashGate({ command: "docker run alpine", root });
  assert.strictEqual(result.decision, "block");
  assert.ok(!result.reason.includes("runtime_state_record"));
  assert.ok(!result.reason.includes("gate_mark_preflight"));
});

test("expired gate-verb observation → reason carries the same incantation with fresh framing", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    {
      id: "obs-bash",
      kind: "budget-state",
      status: "active",
      affected_system: "gate-verb:bash",
      // Older than the 30-min age window → expired for gate-verb allowances.
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  ]);
  const result = evaluateBashGate({ command: "bash -c 'echo hi'", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.observation_required, true);
  assert.ok(/expired/i.test(result.reason));
  assert.ok(/fresh/i.test(result.reason));
  assert.ok(result.reason.includes('gate_mark_preflight({surface:"runtime-state"})'));
  assert.ok(result.reason.includes('runtime_state_record({affected_system:"gate-verb:bash"'));
  assert.ok(result.reason.includes('source_ref:"local:meta-state:gate-verb-allowance"'));
});

// ── compound loop-CLI gate-verb-allowance incantation (recurring-FP regression) ──
// The side-effect-import pattern's second alternative used to be an unscoped
// `.*runtime_state_record\s*\(` that hard-blocked the sanctioned loop-CLI write
// (`gate_mark_preflight` + `runtime_state_record`) with an unrelated vnstock reason.
// The alternative is now python-scoped, so the compound command must not return
// side-effect-import. Without an active gate-verb:bash observation it may still
// block for the gate-verb:bash allowance reason (bounded, self-remediating) — that
// is correct; what must not happen is the unrelated vnstock hard block.

test("compound gate-verb-allowance incantation → ok (no side-effect-import hard block)", () => {
  // The loop-CLI write is the sanctioned path. The compound command must not be
  // hard-blocked as side-effect-import. It should pass cleanly: `node $CLI …`
  // has no -e flag (not a gate-verb), and the pattern's second alternative is
  // python-scoped, so nothing here matches a first-class constraint.
  const root = makeRoot();
  const result = evaluateBashGate({
    command:
      `export LOOP_SURFACE=.claude && node $CLI gate_mark_preflight({surface:"runtime-state"}) && ` +
      `node $CLI runtime_state_record({affected_system:"gate-verb:bash",kind:"budget-state",id:"gate-verb:bash",durability:"ephemeral",source_ref:"local:meta-state:gate-verb-allowance"})`,
    root,
  });
  assert.strictEqual(result.decision, "ok", `expected ok, got ${result.decision}: ${result.reason}`);
  assert.strictEqual(result.constraint_type, undefined);
  assert.strictEqual(result.hard_block, undefined);
});
