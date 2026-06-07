import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { readRegistry } from "#mcp/core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();
const scriptPath = new URL("../scripts/backfill-mechanism-check.mjs", import.meta.url);

function countResolvedWithMechanismCheck(entries) {
  return entries.filter(
    (e) => e.entry_kind === "finding" && e.status === "resolved" && e.mechanism_check === true
  ).length;
}

function countResolvedWithoutMechanismCheck(entries) {
  return entries.filter(
    (e) => e.entry_kind === "finding" && e.status === "resolved" && e.mechanism_check !== true
  ).length;
}

test("Phase 5: backfill-mechanism-check runs and is idempotent", () => {
  const before = readRegistry(root);
  const resolvedBefore = before.filter((e) => e.entry_kind === "finding" && e.status === "resolved");
  const withCheckBefore = countResolvedWithMechanismCheck(before);
  const withoutCheckBefore = countResolvedWithoutMechanismCheck(before);

  // First run
  const firstRun = execSync(`node ${scriptPath.pathname}`, { cwd: root, stdio: "pipe" }).toString();
  console.log(firstRun);

  const after = readRegistry(root);
  const withCheckAfter = countResolvedWithMechanismCheck(after);
  const withoutCheckAfter = countResolvedWithoutMechanismCheck(after);

  // Verify we gained some coverage
  assert.ok(
    withCheckAfter >= withCheckBefore,
    `mechanism_check coverage should not decrease (${withCheckAfter} >= ${withCheckBefore})`
  );

  // The actual coverage depends on which evidence files exist. 12/16 = 75% is realistic.
  const coverage = withCheckAfter / resolvedBefore.length;
  console.log(`Coverage: ${withCheckAfter}/${resolvedBefore.length} = ${(coverage * 100).toFixed(1)}%`);
  assert.ok(coverage >= 0.70, `Coverage should be >= 70%, got ${(coverage * 100).toFixed(1)}%`);

  // Second run should be idempotent
  const secondRun = execSync(`node ${scriptPath.pathname}`, { cwd: root, stdio: "pipe" }).toString();
  console.log(secondRun);
  assert.ok(secondRun.includes("Backfilled: 0"), "Second run should backfill 0 (idempotent)");

  const after2 = readRegistry(root);
  const withCheckAfter2 = countResolvedWithMechanismCheck(after2);
  assert.strictEqual(withCheckAfter2, withCheckAfter, "Idempotent: no change on second run");
});

test("Phase 5: backfilled entries have code_fingerprint set", () => {
  const entries = readRegistry(root);
  const backfilled = entries.filter(
    (e) => e.entry_kind === "finding" && e.status === "resolved" && e.mechanism_check === true
  );

  for (const entry of backfilled) {
    assert.ok(
      entry.code_fingerprint && entry.code_fingerprint.startsWith("sha256:"),
      `Entry ${entry.id} should have code_fingerprint starting with sha256:`
    );
  }
});
