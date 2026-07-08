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
    if (result.error) return { ok: false, stdout: "" };
    if (result.status !== 0) return { ok: false, stdout: "" };
    return { ok: true, stdout: result.stdout || "" };
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

/**
 * Read the set of repo-relative paths touched on the current branch vs
 * `baseBranch`'s merge-base, plus uncommitted working-tree edits.
 *
 * @param {string} root — repo root used to cwd the `git` calls
 * @param {{ baseBranch?: string }} [opts] — base branch (default "main")
 * @returns {Set<string>} — repo-relative touched paths; never throws
 */
export function readBranchTouchedPaths(root, { baseBranch = "main" } = {}) {
  const empty = new Set();
  if (typeof root !== "string" || root.length === 0) return empty;

  // 1. Inside a work-tree? — guards all subsequent calls.
  const inside = runGit(["rev-parse", "--is-inside-work-tree"], { cwd: root });
  if (!inside.ok || inside.stdout.trim() !== "true") return empty;

  // 2. Resolve merge-base. If base missing (no such branch), bail.
  const mergeBase = runGit(["merge-base", baseBranch, "HEAD"], { cwd: root });
  if (!mergeBase.ok) return empty;
  const base = mergeBase.stdout.trim();
  if (base.length === 0) return empty;

  // 3. Committed-on-branch diff (base..HEAD). On main this is empty by
  //    design (merge-base == HEAD); we still attempt to keep the contract
  //    simple — if it is empty, no committed divergence to add.
  const committed = runGit(["diff", "--name-only", `${base}..HEAD`], { cwd: root });
  const committedPaths = committed.ok ? parseNameOnly(committed.stdout) : [];

  // 4. Uncommitted tracked working-tree edits — always attempt (covers the
  //    on-main working-tree case and the no-divergence-but-edits case).
  const uncommitted = runGit(["diff", "--name-only", "HEAD"], { cwd: root });
  const uncommittedPaths = uncommitted.ok ? parseNameOnly(uncommitted.stdout) : [];

  // 5. Untracked-but-not-ignored files (e.g. brand-new files added in this
  //    session, before the first commit). `git diff` does not list them;
  //    `git ls-files --others --exclude-standard` does. Excluding the
  //    standard ignore list (.gitignore) keeps the surface deterministic —
  //    a brand-new `.env` or `node_modules/` is correctly skipped.
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], { cwd: root });
  const untrackedPaths = untracked.ok ? parseNameOnly(untracked.stdout) : [];

  // 6. Union + dedupe. Sets are O(1) — keep the more-specific Set type so
  //    phase 3's caller-supplied-set contract is preserved end-to-end.
  const touched = new Set();
  for (const p of committedPaths) touched.add(p);
  for (const p of uncommittedPaths) touched.add(p);
  for (const p of untrackedPaths) touched.add(p);
  return touched;
}