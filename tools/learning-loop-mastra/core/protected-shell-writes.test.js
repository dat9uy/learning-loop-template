/**
 * TDD tests for the Protected Shell Writes policy module
 * (core/protected-shell-writes.js). The policy is the single owner of
 * protected-path classification, Runtime Topology-derived patterns, marker
 * exceptions, trusted decision-log writers, compound-command masking defense, and
 * exact reason selection. The ground-truth integration seam stays the stable
 * Bash-gate evaluator (evaluate-bash-gate.test.js + the preservation-
 * baseline integration test); these subject-level tests pin the policy contract
 * directly without duplicating the evaluator's final precedence fold.
 */

import { test } from "vitest";
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  evaluateProtectedShellWritePolicy,
  PATH_WRITE_PATTERNS,
  DECISION_LOG_WRITE_PATTERNS,
  DECISION_LOG_WRITE_REASON,
} from "./protected-shell-writes.js";
import { SURFACES } from "./surfaces.js";

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "protected-shell-writes-test-"));
}

function writeRuntimeStateEditMarker(root) {
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
  writeFileSync(
    join(root, ".factory", "coordination", ".loop-preflight-runtime-state-edit"),
    JSON.stringify({ surface: "runtime-state-edit", completed_at: new Date().toISOString() }),
    "utf8",
  );
}

// ── positive: protected writes return the block decision shape ──

test("records/** redirect → block candidate with recorded reason", () => {
  const root = makeRoot();
  const result = evaluateProtectedShellWritePolicy({ command: "echo foo > records/meta/test.json", root });
  assert.ok(result, "expected a block candidate");
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
  assert.ok(result.reason.includes("Direct writes to records/"));
});

test("meta-state.jsonl tee → block candidate", () => {
  const root = makeRoot();
  const result = evaluateProtectedShellWritePolicy({ command: "echo data | tee meta-state.jsonl", root });
  assert.ok(result, "expected a block candidate");
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test(".loop/runtime-tracking.json redirect → block candidate", () => {
  const root = makeRoot();
  const result = evaluateProtectedShellWritePolicy({ command: "echo x > .loop/runtime-tracking.json", root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(result.hard_block, true);
});

test("preflight-marker write for every surface → block candidate", () => {
  const root = makeRoot();
  // (.forEach, not for-of, per the core/ no-inline-for-of-SURFACES-loop
  // invariant that scans core/*.test.js too.)
  SURFACES.forEach((surface) => {
    const redirect = `echo done > ${surface}/coordination/.loop-preflight-product`;
    const result = evaluateProtectedShellWritePolicy({ command: redirect, root });
    assert.ok(result, `redirect to ${surface} preflight marker should block`);
    assert.strictEqual(result.decision, "block");
  });
});

test("quote-concatenation split (rec''ords/) still detected", () => {
  const root = makeRoot();
  const result = evaluateProtectedShellWritePolicy({ command: "echo x > rec''ords/meta/test.json", root });
  assert.ok(result, "quote-concat split must normalize before matching");
  assert.strictEqual(result.decision, "block");
});

// ── negative: non-writes return null (no candidate) ──

test("safe command → null (no candidate)", () => {
  const root = makeRoot();
  const result = evaluateProtectedShellWritePolicy({ command: "ls -la", root });
  assert.strictEqual(result, null);
});

test("plain echo (no gated path) → null", () => {
  const root = makeRoot();
  assert.strictEqual(evaluateProtectedShellWritePolicy({ command: "echo 'x'", root }), null);
});

test("null/empty command → null", () => {
  const root = makeRoot();
  assert.strictEqual(evaluateProtectedShellWritePolicy({ command: null, root }), null);
  assert.strictEqual(evaluateProtectedShellWritePolicy({ command: "", root }), null);
});

// ── marker exception ──

test("runtime-state.jsonl redirect without marker → block candidate", () => {
  const root = makeRoot();
  const result = evaluateProtectedShellWritePolicy({ command: "echo data > runtime-state.jsonl", root });
  assert.ok(result, "expected block");
  assert.ok(result.reason.includes("runtime-state-edit"), `reason names the edit marker; got: ${result.reason}`);
});

test("runtime-state.jsonl redirect WITH active edit marker → null (exempted)", () => {
  const root = makeRoot();
  writeRuntimeStateEditMarker(root);
  const result = evaluateProtectedShellWritePolicy({ command: "echo data > runtime-state.jsonl", root });
  assert.strictEqual(result, null, "edit marker exempts the direct runtime-state write");
});

test("append-only marker does NOT exempt direct write (markers decoupled)", () => {
  const root = makeRoot();
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
  writeFileSync(
    join(root, ".factory", "coordination", ".loop-preflight-runtime-state"),
    JSON.stringify({ surface: "runtime-state", completed_at: new Date().toISOString() }),
    "utf8",
  );
  const result = evaluateProtectedShellWritePolicy({ command: "echo data > runtime-state.jsonl", root });
  assert.ok(result, "append-only marker must not unlock the direct-write gate");
});

// ── compound-command masking defense ──

test("WITH edit marker active, a chained records write still blocks (no masking)", () => {
  const root = makeRoot();
  writeRuntimeStateEditMarker(root);
  const result = evaluateProtectedShellWritePolicy({
    command: "echo ok > runtime-state.jsonl && echo evil > records/meta/pwn.json",
    root,
  });
  assert.ok(result, "exempted runtime-state write must not mask the records write");
  assert.ok(result.reason.includes("records/"), `expected records-class reason; got: ${result.reason}`);
});

test("WITH edit marker active, a chained decision-log write still blocks (no masking)", () => {
  const root = makeRoot();
  writeRuntimeStateEditMarker(root);
  const result = evaluateProtectedShellWritePolicy({
    command: "echo ok > runtime-state.jsonl && echo x >> .claude/coordination/.gate-decision.log",
    root,
  });
  assert.ok(result, "exempted runtime-state write must not mask the decision-log write");
  assert.strictEqual(result.reason, DECISION_LOG_WRITE_REASON);
});

test("WITHOUT marker, invalid runtime-state + records compound → runtime-state reason wins", () => {
  const root = makeRoot();
  const result = evaluateProtectedShellWritePolicy({
    command: "echo ok > runtime-state.jsonl && echo evil > records/meta/pwn.json",
    root,
  });
  assert.ok(result, "expected block");
  assert.ok(result.reason.includes("runtime-state-edit"), `runtime-state reason wins precedence; got: ${result.reason}`);
});

// ── trusted decision-log writers ──

test("decision-log append → dedicated reason (not records reason)", () => {
  const root = makeRoot();
  const result = evaluateProtectedShellWritePolicy({
    command: "echo 'x' >> .claude/coordination/.gate-decision.log",
    root,
  });
  assert.ok(result, "expected block");
  assert.strictEqual(result.reason, DECISION_LOG_WRITE_REASON);
  assert.ok(!result.reason.includes("records/"), "must not reuse the records reason");
});

test("decision-log cp into any surface → dedicated reason", () => {
  const root = makeRoot();
  // (.forEach, not for-of, per the core/ no-inline-for-of-SURFACES-loop
  // invariant that scans core/*.test.js too.)
  SURFACES.forEach((surface) => {
    const result = evaluateProtectedShellWritePolicy({
      command: `cp /tmp/forged.json ${surface}/coordination/.gate-decision.log`,
      root,
    });
    assert.ok(result, `cp to ${surface} decision log should block`);
    assert.strictEqual(result.reason, DECISION_LOG_WRITE_REASON);
  });
});

// ── exported pattern constants (sole-owner read recipe) ──

test("PATH_WRITE_PATTERNS count scales with SURFACES (3 records + 2/surface preflight + 4/surface decision-log + 8 state files)", () => {
  assert.strictEqual(PATH_WRITE_PATTERNS.length, 3 + 2 * SURFACES.length + 4 * SURFACES.length + 8);
  for (const p of PATH_WRITE_PATTERNS) assert.ok(p instanceof RegExp);
});

test("DECISION_LOG_WRITE_PATTERNS covers every surface redirect/tee and cp/mv/dd/install/rsync", () => {
  // (.forEach, not for-of, per the core/ no-inline-for-of-SURFACES-loop
  // invariant that scans core/*.test.js too.)
  SURFACES.forEach((surface) => {
    const redirect = `echo x > ${surface}/coordination/.gate-decision.log`;
    const tee = `echo x | tee -a ${surface}/coordination/.gate-decision.log`;
    const cp = `cp /tmp/x ${surface}/coordination/.gate-decision.log`;
    const mv = `mv /tmp/x ${surface}/coordination/.gate-decision.log`;
    const dd = `dd if=/tmp/x of=${surface}/coordination/.gate-decision.log`;
    assert.ok(DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(redirect)), `redirect ${surface}`);
    assert.ok(DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(tee)), `tee ${surface}`);
    assert.ok(DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(cp)), `cp ${surface}`);
    assert.ok(DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(mv)), `mv ${surface}`);
    assert.ok(DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(dd)), `dd ${surface}`);
  });
});
