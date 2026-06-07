import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

  // Realistic ceiling: 14/16 (87.5%). The 2 unreachable entries are:
  //   1. meta-260602T1116Z-... — no evidence_code_ref, no evidence.code_ref
  //   2. meta-260601T1353Z-use-mcp-skill-... — file path doesn't exist
  //      (.factory/skills/use-mcp/scripts/package.json was removed/moved)
  // Plan red-team claim of 15/16 (94%) was optimistic; the path-fragment
  // fix (C3) recovered 2 entries that were previously skipped, leaving
  // only the 2 truly unreachable. Threshold stays at 70% as a safety net;
  // the realistic assertion is 14/16 (locked below).
  const coverage = withCheckAfter / resolvedBefore.length;
  console.log(`Coverage: ${withCheckAfter}/${resolvedBefore.length} = ${(coverage * 100).toFixed(1)}%`);
  assert.ok(
    coverage >= 0.70,
    `Coverage should be >= 70% (safety net), got ${(coverage * 100).toFixed(1)}%`
  );
  assert.ok(
    coverage >= 0.85,
    `Coverage should be >= 85% (realistic ceiling 14/16), got ${(coverage * 100).toFixed(1)}%`
  );

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

test("Phase 5: backfill handles #fragment in code_ref paths (C3 + M1)", () => {
  // C3/M1 regression guard: evidence_code_ref / evidence.code_ref often
  // include a function anchor like "path/to/file.js#functionName". Before
  // the fix, `existsSync` would fail because the path included the fragment.
  // The fix strips the fragment before path resolution.
  const entries = readRegistry(root);
  const resolvedWithCodeRef = entries.filter(
    (e) => e.entry_kind === "finding" && e.status === "resolved" && (e.evidence_code_ref || e.evidence?.code_ref)
  );

  // All resolved findings with a code_ref should have been backfilled,
  // UNLESS the file at the path doesn't exist. The 2 previously-skipped
  // entries with #fragment (gate-logic.js#splitSegments, loop-surface-inject.cjs#spawnAndCall)
  // should now be backfilled.
  const splitSegments = entries.find(
    (e) => e.id === "meta-260606T0301Z-splitsegments-quote-unaware-bash-gate-false-positive"
  );
  assert.ok(splitSegments, "splitsegments entry should exist");
  assert.strictEqual(
    splitSegments.mechanism_check,
    true,
    "splitsegments entry should be backfilled (was skipped before the #fragment fix)"
  );
  assert.ok(
    splitSegments.code_fingerprint?.startsWith("sha256:"),
    "splitsegments entry should have a sha256 fingerprint"
  );

  const mcpTools = entries.find(
    (e) => e.id === "meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list"
  );
  assert.ok(mcpTools, "mcp-tools entry should exist");
  assert.strictEqual(
    mcpTools.mechanism_check,
    true,
    "mcp-tools entry should be backfilled (was skipped before the #fragment fix)"
  );
});

test("Phase 5: backfill uses CAS-safe updateEntry (C3)", () => {
  // C3 regression guard: the script must pass _expected_version to
  // updateEntry so concurrent invocations cannot overwrite newer versions.
  // We verify this statically by inspecting the script source for the
  // CAS guard pattern. A behavioral CAS test would require real concurrency
  // (out of scope for unit tests).
  const scriptSource = readFileSync(scriptPath.pathname, "utf8");
  assert.ok(
    scriptSource.includes("_expected_version"),
    "backfill-mechanism-check.mjs must pass _expected_version to updateEntry (C3)"
  );
  assert.ok(
    /version_mismatch/.test(scriptSource),
    "backfill-mechanism-check.mjs must handle version_mismatch return (C3)"
  );
});
