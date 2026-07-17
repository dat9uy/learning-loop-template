// End-to-end parallel-merge dry-run for meta-state.jsonl (Tier 2 Phase C).
//
// Proves the `.gitattributes` flip is safe end-to-end before merge:
//   (a) two branches from a shared base each append a NEW versioned line
//       for the SAME id at the same EOF position;
//   (b) `git merge` with `merge=union` produces a file with BOTH version
//       lines (no conflict, no driver dropping);
//   (c) the projection (registry-table.sh) dedupes to last-wins-by-max-version,
//       emitting exactly one line for that id.
//
// This is the load-bearing test that proves the Phase B write-path rewrite
// (versioned-append) + Phase C `.gitattributes` flip (`merge=union`) compose
// correctly: a parallel PR that touches the same id auto-merges without
// producing a content conflict OR a projection duplicate.
//
// Uses an isolated temp git repo per test; never touches the project's
// `.git/config` or working tree. Mirrors `setup-git-merge-drivers.test.js`
// temp-repo idiom.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REG_TABLE = resolve(__dirname, "../registry-table.sh");

function cleanGitEnv(base = process.env) {
  const env = { ...base };
  for (const k of Object.keys(env)) {
    if (k.startsWith("GIT_")) delete env[k];
  }
  return env;
}

function runGit(args, cwd) {
  return spawnSync("git", args, { encoding: "utf8", cwd, env: cleanGitEnv() });
}

function runBash(args, cwd) {
  return spawnSync("bash", args, { encoding: "utf8", cwd, env: cleanGitEnv() });
}

function makeTempRepo() {
  const tmp = mkdtempSync(join(tmpdir(), "meta-state-merge-union-"));
  const init = runGit(["init", "--initial-branch=main"], tmp);
  assert.equal(init.status, 0, `git init failed: ${init.stderr}`);
  runGit(["config", "user.email", "test@example.com"], tmp);
  runGit(["config", "user.name", "Test User"], tmp);
  runGit(["config", "commit.gpgsign", "false"], tmp);
  return tmp;
}

describe("meta-state.jsonl merge=union parallel-merge dry-run (Phase C)", () => {
  test("corrected merge.union.driver is configured", () => {
    const cwd = makeTempRepo();
    try {
      const setup = runBash([resolve(__dirname, "../setup-git-merge-drivers.sh")], cwd);
      assert.equal(setup.status, 0, `setup-git-merge-drivers.sh must exit 0, got ${setup.status}\nstderr: ${setup.stderr}`);
      const driver = runGit(["config", "--get", "merge.union.driver"], cwd);
      assert.match(driver.stdout, /%A %O %B/, `driver must use corrected arg order, got: ${driver.stdout}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("parallel branches appending same-id versions auto-merge via union; projection dedupes to last-wins", () => {
    const cwd = makeTempRepo();
    try {
      // Step 1: configure the corrected union driver.
      const setup = runBash([resolve(__dirname, "../setup-git-merge-drivers.sh")], cwd);
      assert.equal(setup.status, 0, `setup must succeed: ${setup.stderr}`);

      // Step 2: .gitattributes marks meta-state.jsonl merge=union.
      writeFileSync(join(cwd, ".gitattributes"), "meta-state.jsonl merge=union\n", "utf8");

      // Step 3: commit a baseline meta-state.jsonl with ONE pre-existing finding
      //         (single version) so both branches can append a NEW version for it.
      const baselinePath = join(cwd, "meta-state.jsonl");
      const baselineId = "meta-shared-finding";
      const baselineLine = JSON.stringify({
        id: baselineId,
        entry_kind: "finding",
        status: "open",
        version: 1,
        created_at: "2026-07-15T10:00:00.000Z",
      });
      writeFileSync(baselinePath, baselineLine + "\n", "utf8");

      runGit(["add", ".gitattributes", "meta-state.jsonl"], cwd);
      const baselineCommit = runGit(["commit", "-m", "baseline"], cwd);
      assert.equal(baselineCommit.status, 0, `baseline commit failed: ${baselineCommit.stderr}`);

      // Step 4: branch-a appends version=2 of the SAME id.
      runGit(["checkout", "-b", "branch-a"], cwd);
      const lineA = JSON.stringify({
        id: baselineId,
        entry_kind: "finding",
        status: "open",
        version: 2,
        created_at: "2026-07-15T11:00:00.000Z",
        description: "branch-a version bump",
      });
      writeFileSync(baselinePath, readFileSync(baselinePath, "utf8") + lineA + "\n", "utf8");
      runGit(["add", "meta-state.jsonl"], cwd);
      const commitA = runGit(["commit", "-m", "branch-a: version 2"], cwd);
      assert.equal(commitA.status, 0, `branch-a commit failed: ${commitA.stderr}`);

      // Step 5: branch-b (off main, NOT off branch-a) appends version=3.
      runGit(["checkout", "main"], cwd);
      runGit(["checkout", "-b", "branch-b"], cwd);
      const lineB = JSON.stringify({
        id: baselineId,
        entry_kind: "finding",
        status: "open",
        version: 3,
        created_at: "2026-07-15T12:00:00.000Z",
        description: "branch-b version bump",
      });
      writeFileSync(baselinePath, readFileSync(baselinePath, "utf8") + lineB + "\n", "utf8");
      runGit(["add", "meta-state.jsonl"], cwd);
      const commitB = runGit(["commit", "-m", "branch-b: version 3"], cwd);
      assert.equal(commitB.status, 0, `branch-b commit failed: ${commitB.stderr}`);

      // Step 6: merge branch-a into branch-b (the canonical parallel-merge scenario).
      //         With merge=union + corrected driver, the merge succeeds and both
      //         appended lines are retained in the file (raw).
      const mergeA = runGit(["merge", "--no-ff", "branch-a", "-m", "merge branch-a (union)"], cwd);
      assert.equal(mergeA.status, 0,
        `merge must succeed via union (no conflict), got status ${mergeA.status}\nstderr: ${mergeA.stderr}\nstdout: ${mergeA.stdout}`);

      // Step 7: assert the raw file has BOTH version lines (audit completeness).
      const mergedRaw = readFileSync(baselinePath, "utf8");
      const mergedLines = mergedRaw.split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l));
      const matching = mergedLines.filter((l) => l.id === baselineId);
      assert.strictEqual(matching.length, 3,
        `raw file must retain all 3 version lines (v1 baseline + v2 branch-a + v3 branch-b), got ${matching.length}: ${mergedRaw}`);

      // Step 8: assert the projection dedupes to last-wins-by-max-version.
      const projection = runBash([REG_TABLE, baselinePath], cwd);
      assert.strictEqual(projection.status, 0,
        `registry-table.sh must exit 0, got ${projection.status}\nstderr: ${projection.stderr}`);
      const projectedLines = projection.stdout.split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l));
      const projectedForId = projectedLines.filter((l) => l.id === baselineId);
      assert.strictEqual(projectedForId.length, 1,
        `projection must dedupe to exactly 1 line per id, got ${projectedForId.length}: ${projection.stdout}`);
      assert.strictEqual(projectedForId[0].version, 3,
        `projection must surface last-wins (max version=3 from branch-b), got version=${projectedForId[0].version}`);
      assert.strictEqual(projectedForId[0].description, "branch-b version bump",
        `projection must surface branch-b's payload, got: ${projectedForId[0].description}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("the per-clone driver is the single point of failure for a wrong-arg-order clone", () => {
    // Defensive: same scenario with the WRONG driver; both branches' appends
    // must NOT be lost silently (this is the silent data-loss `merge=union`
    // exists to prevent — verified in setup-git-merge-drivers.test.js's
    // "wrong %O %A %B order keeps only one side" test; here we just sanity
    // check the assertion holds when applied to meta-state.jsonl).
    const cwd = makeTempRepo();
    try {
      // Force the WRONG arg order directly via git config.
      runGit(["config", "merge.union.driver", "git merge-file --union %O %A %B"], cwd);

      writeFileSync(join(cwd, ".gitattributes"), "meta-state.jsonl merge=union\n", "utf8");

      const baselinePath = join(cwd, "meta-state.jsonl");
      const baselineLine = JSON.stringify({
        id: "x",
        entry_kind: "finding",
        status: "open",
        version: 1,
        created_at: "2026-07-15T10:00:00.000Z",
      });
      writeFileSync(baselinePath, baselineLine + "\n", "utf8");
      runGit(["add", ".gitattributes", "meta-state.jsonl"], cwd);
      runGit(["commit", "-m", "baseline"], cwd);

      runGit(["checkout", "-b", "branch-x"], cwd);
      writeFileSync(baselinePath, readFileSync(baselinePath, "utf8") + JSON.stringify({
        id: "x",
        entry_kind: "finding",
        status: "open",
        version: 2,
        created_at: "2026-07-15T11:00:00.000Z",
        marker: "BRANCH-X",
      }) + "\n", "utf8");
      runGit(["add", "meta-state.jsonl"], cwd);
      runGit(["commit", "-m", "branch-x: v2"], cwd);

      runGit(["checkout", "main"], cwd);
      runGit(["checkout", "-b", "branch-y"], cwd);
      writeFileSync(baselinePath, readFileSync(baselinePath, "utf8") + JSON.stringify({
        id: "x",
        entry_kind: "finding",
        status: "open",
        version: 3,
        created_at: "2026-07-15T12:00:00.000Z",
        marker: "BRANCH-Y",
      }) + "\n", "utf8");
      runGit(["add", "meta-state.jsonl"], cwd);
      runGit(["commit", "-m", "branch-y: v3"], cwd);

      // With the wrong driver, the merge still completes (no conflict markers),
      // but branch-x's append is dropped (the canonical silent-data-loss bug).
      const mergeX = runGit(["merge", "--no-ff", "branch-x", "-m", "merge (wrong driver)"], cwd);
      assert.equal(mergeX.status, 0, `merge with wrong driver still completes (silent no-op), got ${mergeX.status}\nstderr: ${mergeX.stderr}`);

      const afterRaw = readFileSync(baselinePath, "utf8");
      assert.ok(!afterRaw.includes("BRANCH-X"), `wrong driver must drop branch-x's append, got: ${afterRaw}`);
      assert.ok(afterRaw.includes("BRANCH-Y"), `wrong driver must keep branch-y (ours), got: ${afterRaw}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
