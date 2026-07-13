/**
 * TDD tests for the read-only git-diff touched-paths reader.
 *
 * Plan 4: rec12-closed-loop, phase 2. The source of the "touched bound-
 * artifact paths" set the gap builder (phase 3) joins against.
 *
 * Fixture-repo pattern: a temp dir with `git init` + a baseline commit on
 * `main`, then a feature branch with edits; the helper asserts the set of
 * repo-relative touched paths. The skip-when-git-absent guard (M3) lets
 * the suite degrade cleanly on a git-less CI image.
 */

import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

/** Write a file ensuring its parent dir exists (fs.writeFileSync's `recursive` only works on certain Node versions). */
function writeFileEnsuringDir(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

// M3: skip-when-git-absent guard — degrade cleanly on a git-less CI image.
const GIT_AVAILABLE = spawnSync("git", ["--version"], { shell: false, encoding: "utf8" }).status === 0;
const describeGit = GIT_AVAILABLE ? describe : describe.skip;

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
const MOD_PATH = join(MCP_ROOT, "tools/learning-loop-mastra/core/git-diff.js");

/**
 * Create a fresh git repo at `tmp` with a baseline commit on the requested
 * initial branch (default `main`), returning the cwd. Uses --initial-branch
 * to avoid the "default branch" warning. Skips if git is absent.
 */
function makeRepo(tmp, { initialBranch = "main" } = {}) {
  if (!GIT_AVAILABLE) throw new Error("git is not available — caller must check");
  const env = { ...process.env, GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "t@e" };
  const run = (args) => spawnSync("git", args, { cwd: tmp, shell: false, encoding: "utf8", env });
  run(["init", "--initial-branch", initialBranch]);
  // Commit baseline so HEAD exists.
  run(["commit", "--allow-empty", "-m", "baseline"]);
  return tmp;
}

describe("git-diff module — file presence + export shape", () => {
  test("core/git-diff.js exists", () => {
    assert.ok(existsSync(MOD_PATH), "core/git-diff.js must exist");
  });

  test("exports readBranchTouchedPaths as a function", async () => {
    const mod = await import("../../core/git-diff.js");
    assert.strictEqual(typeof mod.readBranchTouchedPaths, "function", "readBranchTouchedPaths must be a function");
  });
});

describeGit("readBranchTouchedPaths — fixture-repo behavior", () => {
  let tmp;
  function fresh() {
    tmp = mkdtempSync(join(tmpdir(), "git-diff-"));
    return tmp;
  }
  function cleanup() {
    if (tmp && existsSync(tmp)) {
      try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  test("feature-branch: returns the set of paths committed on the branch + uncommitted tracked", async () => {
    fresh();
    const { readBranchTouchedPaths } = await import("../../core/git-diff.js");
    makeRepo(tmp, { initialBranch: "main" });
    // Baseline files on main.
    writeFileEnsuringDir(join(tmp, "README.md"), "readme");
    writeFileEnsuringDir(join(tmp, "docs", "a.md"), "a");
    writeFileEnsuringDir(join(tmp, "tools", "learning-loop-mcp", "x.js"), "x");
    spawnSync("git", ["add", "-A"], { cwd: tmp, shell: false, encoding: "utf8", env: process.env });
    spawnSync("git", ["commit", "-m", "baseline files"], { cwd: tmp, shell: false, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@e" } });
    // Create + switch to feature branch.
    spawnSync("git", ["checkout", "-b", "feature"], { cwd: tmp, shell: false, encoding: "utf8", env: process.env });
    // Edit a.md + add a new file + edit README.
    writeFileEnsuringDir(join(tmp, "docs", "a.md"), "a-modified");
    writeFileEnsuringDir(join(tmp, "tools", "learning-loop-mcp", "y.js"), "y");
    writeFileEnsuringDir(join(tmp, "README.md"), "readme-modified");
    // Stage + commit.
    spawnSync("git", ["add", "-A"], { cwd: tmp, shell: false, encoding: "utf8", env: process.env });
    spawnSync("git", ["commit", "-m", "feature work"], { cwd: tmp, shell: false, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@e" } });

    const touched = readBranchTouchedPaths(tmp, { baseBranch: "main" });
    assert.ok(touched instanceof Set, "readBranchTouchedPaths must return a Set");
    // Touched = diff main..feature (covers committed-on-branch).
    assert.ok(touched.has("docs/a.md"), `touched should include docs/a.md; got ${[...touched]}`);
    assert.ok(touched.has("tools/learning-loop-mcp/y.js"), "touched should include the new y.js");
    assert.ok(touched.has("README.md"), "touched should include the modified README.md");
    // Untouched baseline file should NOT be in the set.
    assert.ok(!touched.has("tools/learning-loop-mcp/x.js"), "untouched baseline file should not be in touched");
    cleanup();
  });

  test("on main with uncommitted tracked edit: surfaces the working-tree path", async () => {
    fresh();
    const { readBranchTouchedPaths } = await import("../../core/git-diff.js");
    makeRepo(tmp, { initialBranch: "main" });
    writeFileEnsuringDir(join(tmp, "docs", "a.md"), "a");
    writeFileEnsuringDir(join(tmp, "README.md"), "r");
    spawnSync("git", ["add", "-A"], { cwd: tmp, shell: false, encoding: "utf8", env: process.env });
    spawnSync("git", ["commit", "-m", "baseline"], { cwd: tmp, shell: false, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@e" } });
    // Uncommitted edit on main.
    writeFileEnsuringDir(join(tmp, "docs", "a.md"), "a-uncommitted");

    const touched = readBranchTouchedPaths(tmp, { baseBranch: "main" });
    assert.ok(touched.has("docs/a.md"), "uncommitted working-tree edit on main should surface");
    cleanup();
  });

  test("on main with clean working tree: returns empty set (no divergence + no uncommitted)", async () => {
    fresh();
    const { readBranchTouchedPaths } = await import("../../core/git-diff.js");
    makeRepo(tmp, { initialBranch: "main" });
    writeFileEnsuringDir(join(tmp, "README.md"), "r");
    spawnSync("git", ["add", "-A"], { cwd: tmp, shell: false, encoding: "utf8", env: process.env });
    spawnSync("git", ["commit", "-m", "baseline"], { cwd: tmp, shell: false, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@e" } });
    const touched = readBranchTouchedPaths(tmp, { baseBranch: "main" });
    assert.deepStrictEqual(touched, new Set());
    cleanup();
  });

  test("not-a-git-repo: returns empty set, no throw", async () => {
    fresh();
    const { readBranchTouchedPaths } = await import("../../core/git-diff.js");
    // No git init in tmp.
    const touched = readBranchTouchedPaths(tmp, { baseBranch: "main" });
    assert.deepStrictEqual(touched, new Set());
    cleanup();
  });

  test("base branch missing: returns empty set, no throw", async () => {
    fresh();
    const { readBranchTouchedPaths } = await import("../../core/git-diff.js");
    makeRepo(tmp, { initialBranch: "main" });
    spawnSync("git", ["checkout", "-b", "feature"], { cwd: tmp, shell: false, encoding: "utf8", env: process.env });
    // Request a base branch that does not exist.
    const touched = readBranchTouchedPaths(tmp, { baseBranch: "no-such-branch" });
    assert.deepStrictEqual(touched, new Set());
    cleanup();
  });

  test("untracked file (new in working tree, not yet staged) surfaces in touched set", async () => {
    fresh();
    const { readBranchTouchedPaths } = await import("../../core/git-diff.js");
    makeRepo(tmp, { initialBranch: "main" });
    // Commit a baseline so HEAD exists.
    writeFileEnsuringDir(join(tmp, "README.md"), "r");
    spawnSync("git", ["add", "-A"], { cwd: tmp, shell: false, encoding: "utf8", env: process.env });
    spawnSync("git", ["commit", "-m", "baseline"], { cwd: tmp, shell: false, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@e" } });
    // Add an untracked-but-not-ignored file (the "new module" case).
    writeFileEnsuringDir(join(tmp, "tools", "learning-loop-mastra", "core", "new-mod.js"), "// new module");

    const touched = readBranchTouchedPaths(tmp, { baseBranch: "main" });
    assert.ok(touched.has("tools/learning-loop-mastra/core/new-mod.js"), `untracked new module should surface; got ${[...touched]}`);
    cleanup();
  });
});