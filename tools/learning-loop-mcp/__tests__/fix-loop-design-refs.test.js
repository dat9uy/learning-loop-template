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
  assert.deepStrictEqual(instructionLayer.proposed_design_for, [],
    "instruction-layer should have empty proposed_design_for after fix");
  assert.deepStrictEqual(crossRefFields.proposed_design_for, [],
    "cross-reference-fields should have empty proposed_design_for after fix");

  // If there were broken refs before, first run should have made changes
  if (brokenBefore > 0) {
    assert.ok(firstRun.includes("Fixed 2 loop-design entries"), "First run should make changes");
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
