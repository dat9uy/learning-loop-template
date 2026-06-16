import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  // Realistic ceiling: ~24/29 (82.8%) after the 2026-06-15 updateEntry compaction
  // (~420 old terminal findings aged out per the documented 7-day compaction
  // invariant in core/meta-state.js#updateEntry). Survivors without
  // mechanism_check include the 2 historically unreachable:
  //   1. meta-260602T1116Z-... — no evidence_code_ref, no evidence.code_ref
  //   2. meta-260601T1353Z-use-mcp-skill-... — file path doesn't exist
  //      (.factory/skills/use-mcp/scripts/package.json was removed/moved)
  // …plus 3 newer entries (e.g. operator-actioned resolutions within the
  // 7-day compaction window) that the backfill script will mark on a
  // future run. The 70% safety net remains; the realistic assertion
  // tracks the post-compaction steady state with a small headroom.
  const coverage = withCheckAfter / resolvedBefore.length;
  console.log(`Coverage: ${withCheckAfter}/${resolvedBefore.length} = ${(coverage * 100).toFixed(1)}%`);
  assert.ok(
    coverage >= 0.70,
    `Coverage should be >= 70% (safety net), got ${(coverage * 100).toFixed(1)}%`
  );
  assert.ok(
    coverage >= 0.80,
    `Coverage should be >= 80% (realistic ceiling 24/29 post-compaction), got ${(coverage * 100).toFixed(1)}%`
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
  // Uses a self-contained tmpRoot fixture to avoid depending on live registry state.
  const fixtureRoot = mkdtempSync(join(tmpdir(), "backfill-fragment-"));

  // Use an absolute path to a real file as the target (guaranteed to exist).
  const targetFile = join(root, "tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs");
  const entries = [
    {
      id: "test-fragment-entry",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      status: "resolved",
      description: "Test entry with #fragment in evidence_code_ref",
      evidence_code_ref: `${targetFile}#computeFileHash`,
      created_at: new Date().toISOString(),
    },
    {
      id: "test-colon-line-entry",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      status: "resolved",
      description: "Test entry with :line suffix in evidence_code_ref",
      evidence_code_ref: `${targetFile}:16`,
      created_at: new Date().toISOString(),
    },
  ];
  writeFileSync(
    join(fixtureRoot, "meta-state.jsonl"),
    entries.map(JSON.stringify).join("\n") + "\n",
    "utf8"
  );

  execSync(`node ${scriptPath.pathname} --root=${fixtureRoot}`, { cwd: root, stdio: "pipe" });

  const after = readRegistry(fixtureRoot);
  const fragmentEntry = after.find((e) => e.id === "test-fragment-entry");
  assert.ok(fragmentEntry, "fragment entry should exist");
  assert.strictEqual(fragmentEntry.mechanism_check, true, "fragment entry should be backfilled");
  assert.ok(
    fragmentEntry.code_fingerprint?.startsWith("sha256:"),
    "fragment entry should have a sha256 fingerprint"
  );

  const colonEntry = after.find((e) => e.id === "test-colon-line-entry");
  assert.ok(colonEntry, "colon-line entry should exist");
  assert.strictEqual(colonEntry.mechanism_check, true, "colon-line entry should be backfilled");
  assert.ok(
    colonEntry.code_fingerprint?.startsWith("sha256:"),
    "colon-line entry should have a sha256 fingerprint"
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
