/**
 * Read-only git-diff touched-paths reader.
 *
 * Plan 4: rec12-closed-loop, phase 2. The source of the "touched bound-
 * artifact paths" set the gap builder (phase 3) joins against.
 *
 * Returns the union of:
 *   1. paths committed on the current branch (diff <merge-base>..HEAD)
 *   2. uncommitted tracked working-tree edits (diff HEAD)
 *
 * On the operator's primary path (main, after PR merge): the committed
 * diff is empty, but uncommitted working-tree edits still surface — that
 * is the expected session-start signal. Committed-on-main edits that were
 * never logged are out of reach of this branch-bound detector (the deferred
 * pre-commit hook catches those at commit time) — accepted limitation.
 *
 * NEVER THROWS. All git failures (not a repo, git missing, base missing,
 * detached HEAD, shallow clone, timeout) degrade to an empty Set. The
 * session-start hook hot path must not crash on a git failure.
 *
 * Safety: spawnSync with shell:false + args-as-array (no shell injection),
 * timeout bound. Justified on side-effect-free grounds — git read is
 * observably side-effect-free. NOT justified via the bash-gate allowlist
 * (the allowlist governs operator shell commands; this is a `core/`
 * `spawnSync` call from a deterministic pipeline — red-team M1).
 */

import { spawnSync } from "node:child_process";

/** Default timeout for any individual `git` call (ms). Bounds the hot-path cost. */
const GIT_TIMEOUT_MS = 5000;

/**
 * Run a `git` command with safety guards. Returns `{ ok, stdout }` — on any
 * failure (non-zero exit, spawn error, throw, timeout), returns `{ ok: false, stdout: "" }`.
 * The caller checks `ok` and bails to empty Set.
 */
function runGit(args, { cwd, timeoutMs = GIT_TIMEOUT_MS } = {}) {
  try {
    const result = spawnSync("git", args, {
      cwd,
      shell: false,
      encoding: "utf8",
      timeout: timeoutMs,
    });
    if (result.error || result.status !== 0) return { ok: false, stdout: "" };
    return { ok: true, stdout: result.stdout };
  } catch {
    return { ok: false, stdout: "" };
  }
}

/** Parse `git diff --name-only` output into a trimmed, deduped array. */
function parseNameOnly(stdout) {
  if (!stdout) return [];
  return stdout
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** True iff `root` is a non-empty string (the only shape `cwd` accepts). */
function isValidRoot(root) {
  return typeof root === "string" && root.length > 0;
}

/** True iff `root` is inside a git work-tree. Guards all subsequent calls. */
function isInsideWorkTree(root) {
  const inside = runGit(["rev-parse", "--is-inside-work-tree"], { cwd: root });
  return inside.ok && inside.stdout.trim() === "true";
}

/**
 * Resolve the merge-base of `baseBranch` and HEAD. Returns null when the
 * branch is missing (no such ref) or git fails — callers bail to empty.
 */
function resolveMergeBase(root, baseBranch) {
  const mergeBase = runGit(["merge-base", baseBranch, "HEAD"], { cwd: root });
  if (!mergeBase.ok) return null;
  const base = mergeBase.stdout.trim();
  return base.length > 0 ? base : null;
}

/** Run a `git` subcommand and parse `--name-only` output; [] on any failure. */
function readNamesOrEmpty(args, root) {
  const result = runGit(args, { cwd: root });
  return result.ok ? parseNameOnly(result.stdout) : [];
}

/** Set-union of the input name arrays; O(n) dedupe. */
function unionPaths(...arrays) {
  const out = new Set();
  for (const arr of arrays) {
    for (const p of arr) out.add(p);
  }
  return out;
}

/**
 * Read the set of repo-relative paths touched on the current branch vs
 * `baseBranch`'s merge-base, plus uncommitted working-tree edits.
 *
 * @param {string} root — repo root used to cwd the `git` calls
 * @param {{ baseBranch?: string }} [opts] — base branch (default "main")
 * @returns {Set<string>} — repo-relative touched paths; never throws
 */
export function readBranchTouchedPaths(root, { baseBranch = "main" } = {}) {
  if (!isValidRoot(root)) return new Set();
  if (!isInsideWorkTree(root)) return new Set();
  const base = resolveMergeBase(root, baseBranch);
  if (base === null) return new Set();
  // Committed-on-branch diff (base..HEAD), uncommitted tracked edits
  // (`git diff HEAD`), and untracked-but-not-ignored files
  // (`git ls-files --others --exclude-standard`). The standard ignore list
  // (.gitignore) keeps the surface deterministic — a brand-new `.env` or
  // `node_modules/` is correctly skipped.
  const committed = readNamesOrEmpty(["diff", "--name-only", `${base}..HEAD`], root);
  const uncommitted = readNamesOrEmpty(["diff", "--name-only", "HEAD"], root);
  const untracked = readNamesOrEmpty(["ls-files", "--others", "--exclude-standard"], root);
  return unionPaths(committed, uncommitted, untracked);
}