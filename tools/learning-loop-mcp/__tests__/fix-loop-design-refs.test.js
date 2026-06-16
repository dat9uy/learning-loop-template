import { readRegistry, writeEntry } from "#mcp/core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const root = resolveRoot();
const scriptPath = new URL("../scripts/fix-loop-design-refs.mjs", import.meta.url);

function countBrokenRefs(entries) {
  const entryIds = new Set(entries.map((e) => e.id));
  return entries
    .filter((e) => e.entry_kind === "loop-design")
    .flatMap((e) => e.proposed_design_for ?? [])
    .filter((ref) => !entryIds.has(ref)).length;
}

test("Phase 1: fix-loop-design-refs fixes broken refs and is idempotent", () => {
  const before = readRegistry(root);
  const brokenBefore = countBrokenRefs(before);

  const firstRun = execSync(`node ${scriptPath.pathname}`, { cwd: root, stdio: "pipe" }).toString();

  const after = readRegistry(root);
  const brokenAfter = countBrokenRefs(after);
  assert.strictEqual(brokenAfter, 0, `Expected 0 broken refs after fix, got ${brokenAfter}`);

  // Verify the 2 loop-design entries were cleaned
  const instructionLayer = after.find((e) => e.id === "loop-design-instruction-layer");
  const crossRefFields = after.find((e) => e.id === "loop-design-cross-reference-fields");
  assert.ok(instructionLayer, "loop-design-instruction-layer must exist");
  assert.ok(crossRefFields, "loop-design-cross-reference-fields must exist");
  // instruction-layer may have valid refs backfilled by design adoption (plan
  // 260609-adopt-instruction-layer); assert no broken refs remain rather than
  // asserting emptiness
  const instructionRefs = instructionLayer.proposed_design_for ?? [];
  const brokenInstruction = instructionRefs.filter(
    (ref) => !after.some((e) => e.id === ref)
  );
  assert.deepStrictEqual(brokenInstruction, [],
    "instruction-layer should have no broken refs after fix");
  // cross-reference-fields may have valid refs backfilled by design adoption;
  // assert no broken refs remain rather than asserting emptiness
  const crossRefRefs = crossRefFields.proposed_design_for ?? [];
  const brokenCrossRef = crossRefRefs.filter(
    (ref) => !after.some((e) => e.id === ref)
  );
  assert.deepStrictEqual(brokenCrossRef, [],
    "cross-reference-fields should have no broken refs after fix");

  // If there were broken refs before, first run should have made changes
  if (brokenBefore > 0) {
    assert.ok(/Fixed \d+ loop-design entries/.test(firstRun), "First run should make changes");
  }

  // Second run should be idempotent
  const secondRun = execSync(`node ${scriptPath.pathname}`, { cwd: root, stdio: "pipe" }).toString();
  assert.ok(secondRun.includes("No changes needed"), "Second run should be idempotent");
});

test("Phase 1: fix-loop-design-refs emits change-log entry", () => {
  const entries = readRegistry(root);
  const changeLogs = entries.filter(
    (e) => e.entry_kind === "change-log" && e.change_target?.includes("loop-design.proposed_design_for")
  );
  assert.ok(changeLogs.length >= 1, "Should have at least 1 change-log about the fix");
  const latest = changeLogs[changeLogs.length - 1];
  assert.ok(latest.reason.includes("loop-design"), "Change-log reason should mention loop-design");
});

test("Phase 1: fix-loop-design-refs change-log is CAS-consistent (C2)", () => {
  // C2 regression guard: the change-log's `removed` list must match the
  // refs that were ACTUALLY stripped from the registry. A CAS-blind
  // script could claim a strip succeeded when the update was overwritten
  // by a concurrent writer; this assertion catches that drift.
  const entries = readRegistry(root);
  const changeLogs = entries.filter(
    (e) => e.entry_kind === "change-log" && e.change_target?.includes("loop-design.proposed_design_for")
  );
  if (changeLogs.length === 0) return; // no fix was run; nothing to verify
  const latest = changeLogs[changeLogs.length - 1];
  const removed = latest.change_diff?.removed ?? [];

  // For each claimed-stripped ref, verify it does NOT currently appear
  // in any loop-design entry's proposed_design_for. If a CAS mismatch
  // occurred, the ref would still be in the registry and this would fail.
  for (const ref of removed) {
    const stillPresent = entries.some((e) => {
      if (e.entry_kind !== "loop-design") return false;
      return (e.proposed_design_for ?? []).includes(ref);
    });
    assert.strictEqual(
      stillPresent,
      false,
      `C2 regression: change-log claims ${ref} was stripped, but it's still in the registry (CAS may have failed silently)`
    );
  }
});
