// Plan 260726-0949 Phase 1: RED→GREEN regression for the runtime-state.jsonl
// write-gate repair. The `runtime-state` rule is migrated from a dead-end
// simple-glob block in BOUND_ARTIFACTS (the reason said "use
// runtime_state_record" — but `runtime_state_record` is append-only, with no
// row-strike path; `gate_override` cannot reach the rule because it requires
// a *promoted* rule_id, and `runtime-state` was a simple-glob block, not
// promoted) to a preflight-delegating rule mirroring `schemas` and `skills`
// (gate_mark_preflight(surface:"runtime-state") unlocks writes to
// runtime-state.jsonl for 30 minutes).
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
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
  // Isolate the MCP handler from real coordination dirs.
  process.env.GATE_COORD_DIR = join(root, ".factory", "coordination");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.GATE_COORD_DIR;
});

function writePreflightMarker(surface) {
  const path = join(root, ".factory", "coordination", `.loop-preflight-${surface}`);
  writeFileSync(path, JSON.stringify({ completed_at: new Date().toISOString() }), "utf8");
}

// ── Gate behavior: runtime-state.jsonl blocks without marker; reason names canonical workflow ──

test("runtime-state.jsonl without preflight marker → block, surface=runtime-state, reason names gate_mark_preflight(surface:'runtime-state')", () => {
  const result = evaluateWriteGate({ filePath: join(root, "runtime-state.jsonl"), root });
  assert.strictEqual(result.decision, "block");
  assert.strictEqual(
    result.surface,
    "runtime-state",
    `expected surface=runtime-state; got: ${JSON.stringify(result)}`,
  );
  assert.ok(
    result.reason.includes("gate_mark_preflight") && result.reason.includes("runtime-state"),
    `reason must name gate_mark_preflight(surface:'runtime-state'); got: ${result.reason}`,
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

test("runtime-state.jsonl with active preflight marker → ok", () => {
  writePreflightMarker("runtime-state");
  const result = evaluateWriteGate({ filePath: join(root, "runtime-state.jsonl"), root });
  assert.strictEqual(result.decision, "ok", `expected ok; got: ${JSON.stringify(result)}`);
});

// ── BOUND_ARTIFACTS no longer carries runtime-state (it's a preflight rule now) ──

test("BOUND_ARTIFACTS does NOT contain 'runtime-state' (Phase 1 migration to preflight rule)", () => {
  const names = BOUND_ARTIFACTS.map((r) => r.name);
  assert.ok(
    !names.includes("runtime-state"),
    `BOUND_ARTIFACTS must not contain 'runtime-state' — it migrated to a preflight-delegating rule in evaluate-write-gate.js`,
  );
});

// ── Tool surface still validates "runtime-state" (Phase 2 will update the description) ──

test("gate_mark_preflight still accepts surface='runtime-state' (z.enum validator)", async () => {
  const handlerResult = await gateMarkPreflightTool.handler({ surface: "runtime-state" });
  const parsed = JSON.parse(handlerResult.content[0].text);
  assert.strictEqual(parsed.marked, true);
  assert.strictEqual(parsed.surface, "runtime-state");
});