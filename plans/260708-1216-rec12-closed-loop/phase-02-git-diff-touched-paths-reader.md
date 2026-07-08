---
phase: 2
title: "git-diff touched-paths reader"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: git-diff touched-paths reader

## Overview

Introduce the only new mechanism class in this plan: a read-only `core/git-diff.js` helper that returns the set of repo-relative paths touched on the current branch vs its merge-base with `main`. This is the "touched bound-artifact paths" source the gap builder (phase 3) joins against. No git precedent exists in `core/` today; this phase lands it with a fixture-repo test and a degraded-to-empty contract on any git failure.

## Requirements

- Functional:
  - `readBranchTouchedPaths(root, { baseBranch = "main" } = {})` returns a `Set<string>` of repo-relative paths changed between `<merge-base(baseBranch, HEAD)>` and `HEAD` (`git diff --name-only <base>..HEAD`), including uncommitted tracked changes (`git diff --name-only HEAD` appended) so in-progress edits surface.
  - Returns `[]` (empty set) when: not a git repo, `git` binary missing, detached HEAD with no resolvable merge-base, shallow clone, or any git error. **Never throws** — the session-start hook hot path must not crash on a git failure.
  - **On `main`** (merge-base == HEAD): the committed-on-branch diff is empty, BUT uncommitted working-tree edits (`git diff --name-only HEAD`) still surface — this is the operator's primary path (recent commits are on main; red-team H1). Committed-on-main edits that were never logged are OUT of reach of the branch-bound detector (the deferred pre-commit hook catches those at commit time) — accepted limitation.
  - Paths are repo-relative (git's default for `--name-only` from the repo root); `root` is used only to cwd the command. `--name-only` reports the new path for renames, the deleted path for deletions, and the path for mode-only changes — all are valid touched-path signals (red-team L3).
- Non-functional: read-only (no git write); `spawnSync` with `shell:false` + args-as-array (no shell injection); a `timeout` option (e.g. 5000ms) so a hung git cannot block the session-start hook; deterministic given a fixed repo state. Justified on side-effect-free grounds (the relevant invariant), NOT the bash-gate verify-cmd-allowlist (red-team M1).

## Architecture

New module `core/git-diff.js` (ESM, sibling of `bound-artifacts.js`). Single export `readBranchTouchedPaths`. Internals:

1. `spawnSync('git', ['rev-parse','--is-inside-work-tree'], {cwd: root, shell:false, encoding:'utf8'})` — if non-zero / not inside → return `new Set()`.
2. `spawnSync('git', ['merge-base', baseBranch, 'HEAD'], ...)` — if non-zero (base missing) → return `new Set()`.
3. If merge-base === HEAD (on base branch or no branch divergence) → still append uncommitted (`git diff --name-only HEAD`) so working-tree edits on main surface; if both empty → `new Set()`.
4. `spawnSync('git', ['diff','--name-only', `${base}..HEAD`], ...)` → committed-on-branch paths.
5. `spawnSync('git', ['diff','--name-only', 'HEAD'], ...)` → uncommitted tracked paths.
6. Union both into a `Set`, trim, drop empties. Wrap each `spawnSync` in a try/catch returning `new Set()` on throw.

The hook (phase 4) calls this and passes the set to `buildChangeLogGapHints(entries, touchedPaths)` — the builder stays pure (caller-supplied set, the `dispatchIds` convention).

### Runtime-agnostic audit

`rule-runtime-agnostic-features` (consult-checklist, 6 items) — run `check_runtime_agnostic` against `core/git-diff.js`:
- Item 1 (core-in-universal-location): YES — `tools/learning-loop-mastra/core/`, not under `.claude/`/`.factory/`.
- Items 2–6: NO — no shim, no protocol-adapter I/O, no new MCP tool, no cross-surface iteration, no surface-specific paths (git operates on the repo root, surface-agnostic).
Record the audit result (item 1 satisfied, 2–6 n/a) in the phase 2 report.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/git-diff.js`.
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/git-diff.test.js` — fixture-repo TDD.
- Reference: `tools/learning-loop-mastra/core/verification-runner.js` — the existing `spawnSync({shell:false})` precedent (cmd + args-as-array + timeout pattern).

## Implementation Steps (TDD)

1. **Test first.** Create `git-diff.test.js` with a fixture-repo helper:
   - `mkdtempSync` → `git init` → set `user.name/email` → commit a baseline (`docs/a.md`, `tools/learning-loop-mcp/x.js`, `README.md`) → create + switch to branch `feature` → edit `docs/a.md` + add `tools/learning-loop-mcp/y.js` + edit `README.md` → assert `readBranchTouchedPaths(tmp)` returns `Set(["docs/a.md","tools/learning-loop-mcp/y.js","README.md"])` (committed + the uncommitted working-tree edit, depending on commit step).
   - Not-a-git-repo: `mkdtempSync` (no `git init`) → assert `readBranchTouchedPaths(tmp)` returns empty set, no throw.
   - On main (no divergence): commit baseline on `main`, no branch, then make an uncommitted working-tree edit to a bound file → assert `readBranchTouchedPaths(tmp)` returns that path (working-tree-on-main surfaces); with a clean tree → empty set.
   - git missing: set `PATH` to empty for the child (or stub `spawnSync` to return non-zero) → assert empty, no throw.
   - **git-absent guard (M3):** a `which git`/`spawnSync('git',['--version'])` skip check — when git is absent, the test suite degrades cleanly (skip, not fail) so a git-less CI image does not break the build.
   - Timeout: stub a git that hangs → assert the `timeout` option fires and returns empty, no throw.
2. **Implement** `core/git-diff.js` per the architecture above.
3. **Audit** with `check_runtime_agnostic` MCP tool against `core/git-diff.js`; record item-1-satisfied / 2–6-n/a.
4. **Measure on WSL2 (M4):** time `readBranchTouchedPaths` cold on the operator's WSL2 env over this repo. If >200ms cold, add a `(HEAD, merge-base)`-keyed cache file (mtime-checked) so a repeated session-start within the same HEAD pays the git cost once. If ≤200ms, ship without cache and note the measurement in the phase 2 report.
5. **Run** `pnpm test` legacy-mcp namespace; confirm green (incl. the git-absent skip guard).

## Success Criteria

- [ ] `readBranchTouchedPaths` returns the correct path set for a fixture feature-branch repo.
- [ ] On main with uncommitted working-tree edits → those paths surface; clean main tree → empty.
- [ ] Returns empty set (no throw) for: not-a-repo, git-missing, timeout.
- [ ] git-absent skip guard: suite degrades cleanly when `git` is missing (M3).
- [ ] Uses `spawnSync` with `shell:false`, args-as-array, `timeout` set.
- [ ] WSL2 cold-latency measured; cache added iff >200ms (M4).
- [ ] `check_runtime_agnostic` audit recorded (item 1 satisfied; 2–6 n/a).
- [ ] `git-diff.test.js` green; no existing suite regresses.

## Risk Assessment

Medium — new mechanism class (`child_process` in core). Mitigations: read-only + `shell:false` + args-as-array (no injection); never-throws contract (degraded to empty); `timeout` bounds the hot-path cost; fixture-repo tests cover the failure modes. The "deterministic core does no external side effects" invariant holds (git read is side-effect-free). Rollback: delete `core/git-diff.js` + its test; phase 3 builder still compiles (the hook would pass an empty set).