import { existsSync, statSync } from "node:fs";
import { resolveSafePath, PathContainmentError } from "../learning-loop-mastra/core/path-containment.js";
import { runVerification } from "../learning-loop-mastra/core/verification-runner.js";

/** Per-process test-runner cache (keyed by absolute file path + mtime string).
 *  Cleared on process restart. mtime changes invalidate the cache.
 *  Shared between meta_state_derive_status and meta_state_check_grounding so a
 *  test result observed by one tool is reused by the other (same pnpm invocation). */
const testRunCache = new Map();

/**
 * Run a single test file and return its pass/fail status, with realpath
 * containment and per-(path, mtime) caching.
 *
 * Returns `true` on pass, `false` on fail, or `null` when the test file is
 * missing inside root or the runner returned an indeterminate status (caller
 * must surface null as "test did not yield a definitive result").
 *
 * LIM-4 realpath containment: rejects traversal/symlink/hardlink escape. A
 * missing test file inside root (ENOENT, resolvedPath === null) returns null
 * (skip running tests); an actual escape (resolvedPath set) propagates.
 * Invoked at moment of use per NF3.
 */
export function runTest(root, testPath) {
  let fullPath;
  try {
    fullPath = resolveSafePath(root, testPath);
  } catch (err) {
    if (err instanceof PathContainmentError && err.reason === "outside_root" && err.resolvedPath === null) {
      return null;  // missing test file — skip running tests
    }
    throw err;
  }
  if (!existsSync(fullPath)) return null;
  const mtime = statSync(fullPath).mtimeMs;
  const key = `${fullPath}:${mtime}`;
  if (testRunCache.has(key)) return testRunCache.get(key);
  const result = runVerification(root, {
    cmd: "pnpm",
    args: ["test", "--", fullPath],
    cwd: root,
    timeout_ms: 30_000,
  });
  if (result.status === "passed") {
    testRunCache.set(key, true);
    return true;
  }
  if (result.status === "failed") {
    testRunCache.set(key, false);
    return false;
  }
  testRunCache.set(key, null);
  return null;
}

/** Test-only: clear the test-runner cache between assertions. */
export function _clearTestRunCacheForTests() {
  testRunCache.clear();
}