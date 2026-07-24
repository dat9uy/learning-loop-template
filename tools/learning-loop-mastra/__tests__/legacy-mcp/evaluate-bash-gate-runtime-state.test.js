// Plan 260720-1112 Phase 1: RED→GREEN regression for the bash-gate constraint-match flip
// (red-team F3/S1).
//
// `readRuntimeObservations` is consumed by `evaluate-bash-gate.js:73` BEFORE the
// staleness check. Pre-consolidation, a malformed line in runtime-state.jsonl
// wiped the entire read to [] → `checkObservationExists` returned {found:false}
// → `hard_block`. After consolidating onto `readRuntimeStateRows`, malformed
// lines are skipped (not wipe-to-[]) → a surviving valid active row matching
// the constraint's affected_system flips the decision from hard_block to non-block.
//
// The pinned post-swap decision (per plan Step 3):
//   - Fresh valid row (timestamp > markerTime) → ok (constraint satisfied).
//   - Stale valid row (timestamp < markerTime) → escalate (staleness wins).
//   - No surviving valid row → hard_block (pre-existing behavior).

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateBashGate } from "../../core/evaluate-bash-gate.js";

function ts(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

describe("evaluate-bash-gate: constraint-match flip on malformed+valid sidecar", () => {
  let tempRoot;

  function writeMarker(timestamp) {
    // The bash-gate side reads markers via readLastOperatorMessage → readFromAllSurfaces
    // which scans every runtime surface coordination dir. Use .factory for stability.
    mkdirSync(join(tempRoot, ".factory", "coordination"), { recursive: true });
    const markerPath = join(tempRoot, ".factory", "coordination", ".last-operator-message");
    writeFileSync(markerPath, JSON.stringify({ timestamp, prompt_snippet: "test" }), "utf8");
  }

  test("setup: temp root + sidecar fixtures", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "bash-gate-runtime-state-"));
  });

  test("malformed line + fresh active vnstock row → constraint satisfied (non-block, ok or escalate)", () => {
    // Marker older than the surviving row → no staleness flip → constraint ok.
    writeMarker(ts(10));
    const validLine = JSON.stringify({
      id: "obs-valid",
      kind: "budget-state",
      status: "active",
      affected_system: "vnstock",
      timestamp: ts(5),
      value: 1,
      delta: 0,
      metadata: {},
    });
    writeFileSync(join(tempRoot, "runtime-state.jsonl"), `{ malformed\n${validLine}\n`, "utf8");

    const decision = evaluateBashGate({ command: "pnpm install vnstock", root: tempRoot });
    assert.notStrictEqual(
      decision.hard_block,
      true,
      `expected non-hard_block after swap; got: ${JSON.stringify(decision)}`
    );
    // Stale marker at ts(10), fresh row at ts(5) → no staleness → ok.
    assert.strictEqual(decision.decision, "ok", `expected ok; got: ${JSON.stringify(decision)}`);
  });

  test("malformed line + stale active vnstock row → escalate (staleness wins)", () => {
    writeMarker(ts(5));
    const validLine = JSON.stringify({
      id: "obs-valid",
      kind: "budget-state",
      status: "active",
      affected_system: "vnstock",
      timestamp: ts(10), // older than marker → stale
      value: 1,
      delta: 0,
      metadata: {},
    });
    writeFileSync(join(tempRoot, "runtime-state.jsonl"), `{ malformed\n${validLine}\n`, "utf8");

    const decision = evaluateBashGate({ command: "pnpm install vnstock", root: tempRoot });
    assert.notStrictEqual(
      decision.hard_block,
      true,
      `expected non-hard_block (constraint satisfied); got: ${JSON.stringify(decision)}`
    );
    assert.strictEqual(
      decision.decision,
      "escalate",
      `expected escalate via staleness; got: ${JSON.stringify(decision)}`
    );
    assert.strictEqual(decision.inbound_gate, true);
  });

  test("malformed line alone (no surviving valid row) → constraint blocks (no observation found)", () => {
    writeMarker(ts(5));
    writeFileSync(join(tempRoot, "runtime-state.jsonl"), `{ malformed\n`, "utf8");

    const decision = evaluateBashGate({ command: "pnpm install vnstock", root: tempRoot });
    // Pre-consolidation AND post-consolidation: no observation → constraint blocks.
    // `pnpm install vnstock` matches `package-manager`; makeGateDecision returns
    // { decision: "block" } (soft block — no hard_block flag). The constraint path
    // is the same in both worlds; the only behavior change is when a valid row
    // SURVIVES the malformed line.
    assert.strictEqual(
      decision.decision,
      "block",
      `expected block (no observation); got: ${JSON.stringify(decision)}`
    );
    assert.ok(
      decision.reason.includes("No active observation found") || decision.reason.includes("observation"),
      `expected reason to mention observation; got: ${decision.reason}`
    );
  });

  test("teardown", () => {
    rmSync(tempRoot, { recursive: true, force: true });
  });
});
