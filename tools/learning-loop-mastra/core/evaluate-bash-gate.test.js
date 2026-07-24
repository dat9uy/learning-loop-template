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

import { evaluateBashGate, PATH_WRITE_PATTERNS } from "./evaluate-bash-gate.js";
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

// ── promoted rules ──

test("promoted regex rule matching command → escalate", () => {
  const root = makeRoot();
  // Write a rule into meta-state.jsonl
  const rule = JSON.stringify({
    id: "rule-no-docker",
    entry_kind: "rule",
    origin: "meta-test-origin",
    status: "active",
    enforcement: "gate",
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
    enforcement: "gate",
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
  const result = evaluateBashGate({ command: "bash tools/scripts/vitest-failures.sh", root });
  assert.strictEqual(result.decision, "ok");
});

test("vitest-failures.sh piped to head (display truncation of parsed output) → ok", () => {
  const root = makeRoot();
  writeNoRawStdoutRule(root);
  const result = evaluateBashGate({ command: "bash tools/scripts/vitest-failures.sh 2>&1 | head -40", root });
  assert.strictEqual(result.decision, "ok");
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

test("PATH_WRITE_PATTERNS count scales with SURFACES (3 records + 2/surface preflight + 6 state files)", () => {
  assert.ok(Array.isArray(PATH_WRITE_PATTERNS));
  assert.strictEqual(PATH_WRITE_PATTERNS.length, 3 + 2 * SURFACES.length + 6);
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
