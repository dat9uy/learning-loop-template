// Regression for the runtime-state.jsonl write-gate. Direct writes are a
// preflight-delegating rule mirroring `schemas` and `skills`:
// gate_mark_preflight(surface:"runtime-state-edit") unlocks writes to
// runtime-state.jsonl for 30 minutes. The edit marker is split from the
// append marker (`.loop-preflight-runtime-state`, required by
// runtime_state_record) so routine appends do not keep the direct-write gate
// warm.
//
// Closes finding `meta-260720T1447Z`.

import { test, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluateWriteGate } from "../../core/evaluate-write-gate.js";
import { gateMarkPreflightTool } from "../../tools/handlers/mark-preflight-complete-tool.js";
import { BOUND_ARTIFACTS } from "../../core/bound-artifacts.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `runtime-state-gate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, ".hermes", "coordination"), { recursive: true });
  // Isolate the MCP handler from real coordination dirs, and its appendGateLog
  // call from the repo's live gate log.
  process.env.GATE_COORD_DIR = join(root, ".hermes", "coordination");
  process.env.GATE_LOG_DIR = join(root, ".hermes", "coordination");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.GATE_COORD_DIR;
  delete process.env.GATE_LOG_DIR;
});

function writePreflightMarker(surface) {
  const path = join(root, ".hermes", "coordination", `.loop-preflight-${surface}`);
  writeFileSync(path, JSON.stringify({ completed_at: new Date().toISOString() }), "utf8");
}

// ── Gate behavior: runtime-state.jsonl blocks without marker; reason names canonical workflow ──

test("runtime-state.jsonl without preflight marker → block, surface=runtime-state-edit, reason names gate_mark_preflight(surface:'runtime-state-edit')", () => {
  const result = evaluateWriteGate({ filePath: join(root, "runtime-state.jsonl"), root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(
    result.surface,
    "runtime-state-edit",
    `expected surface=runtime-state-edit; got: ${JSON.stringify(result)}`,
  );
  assert.ok(
    result.reason.includes("gate_mark_preflight") && result.reason.includes("runtime-state-edit"),
    `reason must name gate_mark_preflight(surface:'runtime-state-edit'); got: ${result.reason}`,
  );
});

test("runtime-state.jsonl block reason does NOT redirect to runtime_state_record as the only escape", () => {
  // The old dead-end reason was: "Direct writes to runtime-state.jsonl are
  // blocked. Use runtime_state_record MCP tool to create entries." That
  // pointed at the append-only tool with no row-strike path. The new reason
  // must surface the preflight path explicitly and not pretend the append-only
  // tool is the operator's only option.
  const result = evaluateWriteGate({ filePath: join(root, "runtime-state.jsonl"), root });
  const reasonLower = result.reason.toLowerCase();
  // Either the reason explicitly notes the append-only tool as the path for
  // NEW rows (acceptable — that's still true), OR it omits it entirely; what
  // matters is the canonical workflow is named.
  assert.ok(
    reasonLower.includes("meta_state_log_change") || reasonLower.includes("preflight"),
    `reason must name the canonical preflight workflow; got: ${result.reason}`,
  );
});

// ── Gate behavior: marker unlocks the gate ──

test("runtime-state.jsonl with active edit preflight marker → ok", () => {
  writePreflightMarker("runtime-state-edit");
  const result = evaluateWriteGate({ filePath: join(root, "runtime-state.jsonl"), root });
  assert.strictEqual(result.decision, "ok", `expected ok; got: ${JSON.stringify(result)}`);
});

test("runtime-state.jsonl with only the APPEND marker active → still blocked (markers are decoupled)", () => {
  writePreflightMarker("runtime-state");
  const result = evaluateWriteGate({ filePath: join(root, "runtime-state.jsonl"), root });
  assert.strictEqual(result.decision, "block", `append marker must not unlock direct writes; got: ${JSON.stringify(result)}`);
});

// ── Session-local substrate (.loop/runtime-state-local.jsonl) — same rule class ──

test(".loop/runtime-state-local.jsonl without marker → block, surface=runtime-state-edit, preflight-delegating (not a dead-end)", () => {
  const result = evaluateWriteGate({ filePath: join(root, ".loop", "runtime-state-local.jsonl"), root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(
    result.surface,
    "runtime-state-edit",
    `local substrate must delegate to runtime-state-edit; got: ${JSON.stringify(result)}`,
  );
  assert.ok(
    result.reason.includes("gate_mark_preflight") && result.reason.includes("runtime-state-edit"),
    `reason must name gate_mark_preflight(surface:'runtime-state-edit'); got: ${result.reason}`,
  );
  // Red-team #3: the rule DELEGATES (preflight escape), it is not a dead-end
  // simple-glob block — the marker must unlock it.
});

test(".loop/runtime-state-local.jsonl with active edit marker → ok (delegates, not dead-end)", () => {
  writePreflightMarker("runtime-state-edit");
  const result = evaluateWriteGate({ filePath: join(root, ".loop", "runtime-state-local.jsonl"), root });
  assert.strictEqual(result.decision, "ok", `local substrate must unlock with edit marker; got: ${JSON.stringify(result)}`);
});

test(".loop/runtime-state-local.jsonl with only the APPEND marker → still blocked (markers decoupled)", () => {
  writePreflightMarker("runtime-state");
  const result = evaluateWriteGate({ filePath: join(root, ".loop", "runtime-state-local.jsonl"), root });
  assert.strictEqual(result.decision, "block", `append marker must not unlock the local substrate; got: ${JSON.stringify(result)}`);
});

// ── BOUND_ARTIFACTS no longer carries runtime-state (it's a preflight rule now) ──

test("BOUND_ARTIFACTS does NOT contain 'runtime-state' (migration to preflight rule)", () => {
  const names = BOUND_ARTIFACTS.map((r) => r.name);
  assert.ok(
    !names.includes("runtime-state"),
    `BOUND_ARTIFACTS must not contain 'runtime-state' — it migrated to a preflight-delegating rule in evaluate-write-gate.js`,
  );
});

// ── Tool surface validates both runtime-state preflight surfaces ──

test("gate_mark_preflight accepts surface='runtime-state' (append marker)", async () => {
  const handlerResult = await gateMarkPreflightTool.handler({ surface: "runtime-state" });
  const parsed = JSON.parse(handlerResult.content[0].text);
  assert.strictEqual(parsed.marked, true);
  assert.strictEqual(parsed.surface, "runtime-state");
});

test("gate_mark_preflight accepts surface='runtime-state-edit' (edit marker)", async () => {
  const handlerResult = await gateMarkPreflightTool.handler({ surface: "runtime-state-edit" });
  const parsed = JSON.parse(handlerResult.content[0].text);
  assert.strictEqual(parsed.marked, true);
  assert.strictEqual(parsed.surface, "runtime-state-edit");
});
