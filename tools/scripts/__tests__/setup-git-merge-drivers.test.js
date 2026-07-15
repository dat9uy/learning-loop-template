// Unit tests for tools/scripts/setup-git-merge-drivers.sh.
//
// Locks the corrected `git merge-file --union %A %O %B` arg-order contract:
//   (a) idempotent (running twice with correct value is a no-op)
//   (b) wrong-order existing config -> exit 1 + warning (no silent overwrite)
//   (c) --force flag overwrites a wrong-order config to the corrected value
//   (d) corrected driver produces a union (both appends, 0 conflicts)
//   (e) wrong `%O %A %B` order keeps only one side (regression guard)
//   (f) union merge fixture ids are distinct by construction (asserted at
//       fixture-gen, NOT at merge time — Red Team F12: fixture-id uniqueness
//       is a fixture property, not a driver guarantee)
//
// Uses an isolated temp git repo per test; never touches the real working
// tree or `.git/config` of the project. Mirrors the `registry-table.test.js`
// + `ci-registry-deltas.test.js` temp-repo idiom.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../setup-git-merge-drivers.sh");

function runScript(args = [], opts = {}) {
  return spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8", cwd: opts.cwd });
}

function runGit(args, cwd) {
  return spawnSync("git", args, { encoding: "utf8", cwd });
}

function makeTempRepo() {
  const tmp = mkdtempSync(join(tmpdir(), "setup-merge-drivers-"));
  // Init an isolated repo so we never touch the project's `.git/config`.
  const init = runGit(["init", "--initial-branch=main"], tmp);
  assert.equal(init.status, 0, `git init failed: ${init.stderr}`);
  runGit(["config", "user.email", "test@example.com"], tmp);
  runGit(["config", "user.name", "Test User"], tmp);
  runGit(["config", "commit.gpgsign", "false"], tmp);
  return tmp;
}

describe("setup-git-merge-drivers.sh: contract", () => {
  test("script is executable and exists", () => {
    assert.ok(existsSync(SCRIPT), `script missing at ${SCRIPT}`);
  });

  test("idempotent — sets corrected driver on first run, no-op on second", () => {
    const cwd = makeTempRepo();
    try {
      // First run: sets the driver.
      const proc1 = runScript([], { cwd });
      assert.strictEqual(proc1.status, 0, `first run must exit 0, got ${proc1.status}\nstderr: ${proc1.stderr}`);
      const driver = runGit(["config", "--get", "merge.union.driver"], cwd);
      assert.strictEqual(driver.status, 0);
      assert.match(driver.stdout, /%A %O %B/, `driver must use corrected arg order, got: ${driver.stdout}`);

      // Second run: must be a no-op (idempotent).
      const proc2 = runScript([], { cwd });
      assert.strictEqual(proc2.status, 0, `second run must exit 0 (idempotent), got ${proc2.status}\nstderr: ${proc2.stderr}`);
      assert.match(proc2.stdout, /already configured correctly/, `second run must report idempotent no-op, got: ${proc2.stdout}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("wrong-order existing config -> exit 1 + warning (no silent overwrite)", () => {
    const cwd = makeTempRepo();
    try {
      // Pre-set the WRONG arg order (the canonical bug per Plan 260715-1608 Phase 4).
      runGit(["config", "merge.union.driver", "git merge-file --union %O %A %B"], cwd);

      const proc = runScript([], { cwd });
      assert.strictEqual(proc.status, 1, `wrong-order detection must exit 1, got ${proc.status}\nstderr: ${proc.stderr}`);
      assert.match(proc.stderr, /wrong|order|%O %A %B|data-loss/i,
        `stderr must call out the wrong order, got: ${proc.stderr}`);

      // Driver must NOT have been silently overwritten.
      const driver = runGit(["config", "--get", "merge.union.driver"], cwd);
      assert.match(driver.stdout, /%O %A %B/, `driver must be preserved (not silently overwritten), got: ${driver.stdout}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("--force flag overwrites a wrong-order config to the corrected value", () => {
    const cwd = makeTempRepo();
    try {
      runGit(["config", "merge.union.driver", "git merge-file --union %O %A %B"], cwd);

      const proc = runScript(["--force"], { cwd });
      assert.strictEqual(proc.status, 0, `--force must exit 0, got ${proc.status}\nstderr: ${proc.stderr}`);

      const driver = runGit(["config", "--get", "merge.union.driver"], cwd);
      assert.match(driver.stdout, /%A %O %B/, `driver must be corrected, got: ${driver.stdout}`);
      assert.doesNotMatch(driver.stdout, /%O %A %B/, `driver must NOT retain the wrong order, got: ${driver.stdout}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("corrected driver unions both appends (no conflict)", () => {
    const cwd = makeTempRepo();
    try {
      // Step 1: configure the corrected driver via the script.
      const setupProc = runScript([], { cwd });
      assert.equal(setupProc.status, 0, `setup script must succeed, got ${setupProc.status}\nstderr: ${setupProc.stderr}`);

      // Step 2: commit a baseline change-log.jsonl.
      const baselinePath = join(cwd, "change-log.jsonl");
      writeFileSync(baselinePath, JSON.stringify({
        id: "meta-baseline-1",
        entry_kind: "change-log",
        change_dimension: "semantic",
        change_target: "tools/example.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Baseline change-log for union-merge fixture (min 20 chars)",
        created_at: "2026-07-15T10:00:00Z",
      }) + "\n", "utf8");
      // .gitattributes marks change-log.jsonl merge=union.
      writeFileSync(join(cwd, ".gitattributes"), "change-log.jsonl merge=union\n", "utf8");
      runGit(["add", ".gitattributes", "change-log.jsonl"], cwd);
      const baselineCommit = runGit(["commit", "-m", "baseline"], cwd);
      assert.equal(baselineCommit.status, 0, `baseline commit failed: ${baselineCommit.stderr}`);

      // Step 3: branch A appends a line with a distinct id (no duplicate-id
      // assertion at merge time — that's a fixture property, Red Team F12).
      const branchA = runGit(["checkout", "-b", "branch-a"], cwd);
      assert.equal(branchA.status, 0);
      const idA = "meta-branch-a-append-1";
      const lineA = JSON.stringify({
        id: idA,
        entry_kind: "change-log",
        change_dimension: "semantic",
        change_target: "tools/branch-a.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Branch A append: distinct id from branch B (min 20 chars)",
        created_at: "2026-07-15T10:01:00Z",
      });
      writeFileSync(baselinePath, readFileSync(baselinePath, "utf8") + lineA + "\n", "utf8");
      runGit(["add", "change-log.jsonl"], cwd);
      const commitA = runGit(["commit", "-m", "branch-a append"], cwd);
      assert.equal(commitA.status, 0, `branch-a commit failed: ${commitA.stderr}`);

      // Step 4: branch B (off main, NOT off branch-a) appends a different id.
      const branchB = runGit(["checkout", "main"], cwd);
      assert.equal(branchB.status, 0);
      runGit(["checkout", "-b", "branch-b"], cwd);
      const idB = "meta-branch-b-append-2";
      const lineB = JSON.stringify({
        id: idB,
        entry_kind: "change-log",
        change_dimension: "semantic",
        change_target: "tools/branch-b.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Branch B append: distinct id from branch A (min 20 chars)",
        created_at: "2026-07-15T10:02:00Z",
      });
      writeFileSync(baselinePath, readFileSync(baselinePath, "utf8") + lineB + "\n", "utf8");
      runGit(["add", "change-log.jsonl"], cwd);
      const commitB = runGit(["commit", "-m", "branch-b append"], cwd);
      assert.equal(commitB.status, 0, `branch-b commit failed: ${commitB.stderr}`);

      // Assert distinct ids by construction (Red Team F12).
      assert.notStrictEqual(idA, idB);

      // Step 5: merge branch-a into branch-b (no-ff to force merge commit).
      const mergeA = runGit(["merge", "--no-ff", "branch-a", "-m", "merge branch-a"], cwd);
      assert.equal(mergeA.status, 0, `merge branch-a must succeed (corrected driver), got status ${mergeA.status}\nstderr: ${mergeA.stderr}\nstdout: ${mergeA.stdout}`);

      // Step 6: verify both lines are present in the merged file.
      const mergedContent = readFileSync(baselinePath, "utf8");
      assert.ok(mergedContent.includes(idA), `merged file must contain branch-a id ${idA}, got: ${mergedContent}`);
      assert.ok(mergedContent.includes(idB), `merged file must contain branch-b id ${idB}, got: ${mergedContent}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("wrong %O %A %B order keeps only one side (regression guard)", () => {
    const cwd = makeTempRepo();
    try {
      // Force the WRONG arg order directly via git config.
      runGit(["config", "merge.union.driver", "git merge-file --union %O %A %B"], cwd);

      // Same setup as the corrected test: baseline + 2 branches with distinct appends.
      const baselinePath = join(cwd, "change-log.jsonl");
      writeFileSync(baselinePath, JSON.stringify({
        id: "meta-baseline-2",
        entry_kind: "change-log",
        change_dimension: "semantic",
        change_target: "tools/example.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Baseline change-log for wrong-order regression fixture (min 20 chars)",
        created_at: "2026-07-15T10:00:00Z",
      }) + "\n", "utf8");
      writeFileSync(join(cwd, ".gitattributes"), "change-log.jsonl merge=union\n", "utf8");
      runGit(["add", ".gitattributes", "change-log.jsonl"], cwd);
      runGit(["commit", "-m", "baseline"], cwd);

      const idA = "meta-regression-a";
      const lineA = JSON.stringify({
        id: idA,
        entry_kind: "change-log",
        change_dimension: "semantic",
        change_target: "tools/regression-a.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Regression A append: must be DROPPED by wrong-order driver (min 20 chars)",
        created_at: "2026-07-15T10:01:00Z",
      });
      runGit(["checkout", "-b", "branch-a"], cwd);
      writeFileSync(baselinePath, readFileSync(baselinePath, "utf8") + lineA + "\n", "utf8");
      runGit(["add", "change-log.jsonl"], cwd);
      runGit(["commit", "-m", "branch-a append"], cwd);

      const idB = "meta-regression-b";
      const lineB = JSON.stringify({
        id: idB,
        entry_kind: "change-log",
        change_dimension: "semantic",
        change_target: "tools/regression-b.js",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "Regression B append: kept by wrong-order driver (drops branch-a) (min 20 chars)",
        created_at: "2026-07-15T10:02:00Z",
      });
      runGit(["checkout", "main"], cwd);
      runGit(["checkout", "-b", "branch-b"], cwd);
      writeFileSync(baselinePath, readFileSync(baselinePath, "utf8") + lineB + "\n", "utf8");
      runGit(["add", "change-log.jsonl"], cwd);
      runGit(["commit", "-m", "branch-b append"], cwd);

      const mergeA = runGit(["merge", "--no-ff", "branch-a", "-m", "merge branch-a (wrong driver)"], cwd);
      // With the wrong order, git merge-file writes the union into %O
      // (the ancestor copy), leaves %A unchanged, and reads the result
      // from %A. So branch-a's append is DROPPED — but the merge still
      // succeeds (no conflict markers). We assert the dropped-line outcome.
      assert.equal(mergeA.status, 0, `merge with wrong driver still completes (silent no-op), got status ${mergeA.status}\nstderr: ${mergeA.stderr}\nstdout: ${mergeA.stdout}`);

      const mergedContent = readFileSync(baselinePath, "utf8");
      assert.ok(mergedContent.includes(idB), `merged file must contain branch-b id (kept), got: ${mergedContent}`);
      assert.ok(!mergedContent.includes(idA), `merged file must NOT contain branch-a id (dropped by wrong driver), got: ${mergedContent}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});