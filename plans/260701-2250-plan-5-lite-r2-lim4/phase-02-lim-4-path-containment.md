---
phase: 2
title: "LIM-4 Path Containment (realpath + hardlink rejection)"
status: pending
priority: P1
dependencies: []
plan: "260701-2250-plan-5-lite-r2-lim4"
addresses:
  - red-team R5 (HIGH: hardlink escape + TOCTOU window)
  - red-team R15 (MEDIUM: evidence_code_ref format smuggling)
  - scout finding: 7 audit sites (verification-runner.js:34 added)
---

# Phase 2: LIM-4 Path Containment (realpath + hardlink rejection)

## Overview

Add a `resolveSafePath(root, userPath)` helper that returns the absolute, realpath-resolved path iff it lives inside the realpath of `root`; throws `PathContainmentError` otherwise. Migrate **7 audit sites** (the 6 listed in the original plan + the missed `verification-runner.js:34`) from naive `path.join(root, userPath)` to `resolveSafePath(root, userPath)`. Reject hardlinks to close the LIM-4 attack surface that pure `realpath` leaves open.

## Threat model (what this phase defends against)

| Threat | Concrete attack | This phase defends? |
|---|---|---|
| Path traversal via `../` | User path `../../../etc/passwd` | **Yes** (realpath + startsWith) |
| Symlink escape | File inside root is a symlink to outside | **Yes** (realpath resolves symlinks) |
| Hardlink escape (R5) | File inside root is a hardlink to `/etc/passwd` | **Yes** (lstat nlink check) |
| TOCTOU race (R5) | Symlink swap between gate check and write | **Partial** (caller must invoke `resolveSafePath` again before write; documented pattern) |
| Path-arg smuggling via `:` + line suffix (R15) | `evidence_code_ref` with `tools/foo.js:../../etc/passwd` | **Already covered** by `stripEvidenceAnchor` (line 634-647); this phase adds a defensive `:` reject as belt-and-suspenders |
| Null-byte injection (R17, A17) | Path containing `\0` | **Covered by Node** (`fs.realpath` throws) |

This phase does NOT defend against (documented residual):
- Windows UNC / device paths (D4 deferred)
- Sub-millisecond TOCTOU races between two `resolveSafePath` calls in different processes (deferred to a future plan)

## Requirements

### Functional (F1-F3 + must-fix F4-F5)

- **F1.** New module `tools/learning-loop-mastra/core/path-containment.js` exports:
  - `resolveSafePath(root, userPath)` — returns absolute, realpath-resolved path iff inside realpath of `root`; throws `PathContainmentError` otherwise.
  - `PathContainmentError` — extends `Error`; carries `{ reason: "outside_root" | "hardlink_rejected" | "traversal_detected" | "realpath_failed", root, userPath, resolvedPath }`.
  - `clearRealpathCache()` — test-only; clears the per-process `realpath(root)` cache.
  - **`isHardlinked(absPath)` (F4/R5)** — helper that returns true iff `lstat(absPath).nlink > 1`. Used by `resolveSafePath` to reject hardlinks.
- **F2.** The **7 audit sites** are migrated from `path.join(root, userPath)` to `resolveSafePath(root, userPath)`:
  1. `tools/learning-loop-mastra/tools/legacy/meta-state-refresh-fingerprint-tool.js:116` (`join(root, strippedCodeRef)` for `entry.evidence_code_ref`)
  2. `tools/learning-loop-mastra/core/check-grounding.js:142` (`join(root, strippedRef)` for `entry.evidence_code_ref`)
  3. `tools/learning-loop-mastra/core/derive-status.js:88` (`join(root, path)` in `checkExists` — called for both `evidence_code_ref` AND `evidence_test`)
  4. `tools/learning-loop-mastra/core/gate-logic.js:672` (`join(root, stripEvidenceAnchor(codeRef))` in `checkResolutionEvidence`)
  5a. `tools/learning-loop-mastra/tools/legacy/meta-state-check-grounding-tool.js:17` (`runTest(root, testPath)` for `entry.evidence_test`)
  5b. `tools/learning-loop-mastra/tools/legacy/meta-state-derive-status-tool.js:17` (`runTest(root, testPath)` for `entry.evidence_test`)
  5c. `tools/learning-loop-mastra/core/verification-runner.js:34` (`join(root, step.cwd)` — the **7th site** added by the scout; user-supplied `step.cwd` from `entry.verification.steps[*]`)
- **F3.** Regression tests cover:
  - `traversal_relative`: `../../../etc/passwd` from a nested `evidence_code_ref` → throws `outside_root`
  - `symlink_escape`: file inside root is a symlink to `/etc/passwd` → throws `outside_root`
  - `legitimate_deep_path`: `foo/../bar` inside root → resolves to `root/bar` → allowed (no false-positive on `..` inside root)
  - `absolute_path_outside_root`: `/etc/passwd` as userPath → throws `outside_root`
  - `root_equals_root`: userPath == root → allowed (no false-positive)
  - **F4. `hardlink_rejected` (R5)**: file inside root is a hardlink to `/etc/passwd` → throws `hardlink_rejected`
  - **F5. `path_with_colon_suffix_rejected` (R15)**: `tools/foo.js:../../etc/passwd` → `stripEvidenceAnchor` strips `:...` first; if `:` remains in the post-strip path, `resolveSafePath` throws
  - `null_byte_throws`: path containing `\0` → throws (Node-level; passes through)
  - `cache_hit_per_root`: second call for same root uses cached realpath
- **NF1.** Per-call cost ≤ 0.2ms: one `realpath` syscall (cached per root) + one `lstat` syscall (for hardlink check) + one `startsWith` check.
- **NF2.** Cache `realpath(root)` per process via a `Map<root, realpath>` (avoids repeated syscalls in tight loops). NF1 cache key is `realpathSync(root)` itself (canonical form).

### Non-functional (must-fix additions)

- **NF3. (R5)** **TOCTOU closure documented:** the `resolveSafePath` helper MUST be invoked **inside the tool's execute body** before any `fs.writeFileSync`, not only in the gate. The gate's role is pre-flight; the tool's execute body is the actual write. Documented pattern: every tool that writes to a user-supplied path calls `resolveSafePath(root, userPath)` immediately before `fs.writeFileSync`. Failure to re-call closes the TOCTOU window only partially (the gate sees a benign path; the write hits an attacker-controlled symlink). The Phase 2 audit-site migrations are the canonical example; all 7 sites invoke `resolveSafePath` at the moment of use, not earlier.
- **NF4. (R15)** **Defensive `:` reject:** if `userPath` contains a `:` (after `stripEvidenceAnchor`), `resolveSafePath` throws `outside_root` with reason `traversal_detected`. The only legitimate `:` in `evidence_code_ref` is the `:line` / `:start-end` / `#anchor` suffix, which `stripEvidenceAnchor` (gate-logic.js:634-647) handles BEFORE the path-resolution step.

## Architecture

### `resolveSafePath` flow

```js
// tools/learning-loop-mastra/core/path-containment.js
import { realpathSync, lstatSync } from "node:fs";
import { isAbsolute, join, resolve as pathResolve, sep } from "node:path";

const realpathCache = new Map();  // canonicalRoot -> realpath

export class PathContainmentError extends Error {
  constructor(reason, { root, userPath, resolvedPath }) {
    super(`PathContainmentError: ${reason} (root=${root}, userPath=${userPath}, resolvedPath=${resolvedPath})`);
    this.name = "PathContainmentError";
    this.reason = reason;
    this.root = root;
    this.userPath = userPath;
    this.resolvedPath = resolvedPath;
  }
}

function canonicalRoot(root) {
  if (!realpathCache.has(root)) {
    try {
      realpathCache.set(root, realpathSync(root));
    } catch (err) {
      throw new PathContainmentError("realpath_failed", { root, userPath: root, resolvedPath: null });
    }
  }
  return realpathCache.get(root);
}

export function clearRealpathCache() {
  realpathCache.clear();
}

export function isHardlinked(absPath) {
  try {
    const stats = lstatSync(absPath);
    return stats.nlink > 1;
  } catch {
    return false;  // file missing; caller decides
  }
}

export function resolveSafePath(root, userPath) {
  // 1. Validate inputs
  if (typeof userPath !== "string" || userPath.length === 0) {
    throw new PathContainmentError("traversal_detected", { root, userPath, resolvedPath: null });
  }
  if (userPath.includes("\0")) {
    throw new PathContainmentError("traversal_detected", { root, userPath, resolvedPath: null });
  }
  // R15: defensive colon reject (after stripEvidenceAnchor)
  if (userPath.includes(":")) {
    throw new PathContainmentError("traversal_detected", { root, userPath, resolvedPath: null });
  }

  // 2. Resolve to absolute
  const absUserPath = isAbsolute(userPath) ? userPath : pathResolve(root, userPath);

  // 3. Realpath (resolves symlinks)
  let realUser;
  try {
    realUser = realpathSync(absUserPath);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new PathContainmentError("outside_root", { root, userPath, resolvedPath: null });
    }
    throw new PathContainmentError("realpath_failed", { root, userPath, resolvedPath: null });
  }

  // 4. Containment check
  const realRoot = canonicalRoot(root);
  if (realUser !== realRoot && !realUser.startsWith(realRoot + sep)) {
    throw new PathContainmentError("outside_root", { root, userPath, resolvedPath: realUser });
  }

  // 5. Hardlink check (R5)
  if (isHardlinked(realUser)) {
    throw new PathContainmentError("hardlink_rejected", { root, userPath, resolvedPath: realUser });
  }

  return realUser;
}
```

### Files to create

- `tools/learning-loop-mastra/core/path-containment.js` (above)
- `tools/learning-loop-mastra/__tests__/path-containment.test.js` (regression suite)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/path-containment-audit-sites.test.js` (covers all 7 audit sites in one suite)

### Files to modify

- `tools/learning-loop-mastra/tools/legacy/meta-state-refresh-fingerprint-tool.js:116`
  - Add `import { resolveSafePath } from "../../core/path-containment.js";`
  - Replace `const absPath = join(root, strippedCodeRef);` with `const absPath = resolveSafePath(root, strippedCodeRef);`
- `tools/learning-loop-mastra/core/check-grounding.js:142`
  - Add import; replace `const absPath = isAbsolute(strippedRef) ? strippedRef : join(root, strippedRef);` with `const absPath = resolveSafePath(root, strippedRef);`
- `tools/learning-loop-mastra/core/derive-status.js:88` (`checkExists`)
  - Add import; replace `const fullPath = isAbsolute(path) ? path : join(root, path);` with `const fullPath = resolveSafePath(root, path);`
  - Note: this single edit covers BOTH `evidence_code_ref` (line 57) AND `evidence_test` (line 58) since both flow through `checkExists`.
- `tools/learning-loop-mastra/core/gate-logic.js:672` (`checkResolutionEvidence`)
  - Add import; replace `const absPath = join(root, stripEvidenceAnchor(codeRef));` with `const absPath = resolveSafePath(root, stripEvidenceAnchor(codeRef));`
- `tools/learning-loop-mastra/tools/legacy/meta-state-check-grounding-tool.js:17` (`runTest`)
  - Add import; replace `const fullPath = join(root, testPath);` with `const fullPath = resolveSafePath(root, testPath);`
- `tools/learning-loop-mastra/tools/legacy/meta-state-derive-status-tool.js:17` (`runTest`)
  - Same migration as 5a.
- `tools/learning-loop-mastra/core/verification-runner.js:34` (`runVerification`)
  - Add import; replace `const cwd = step.cwd ? (isAbsolute(step.cwd) ? step.cwd : join(root, step.cwd)) : root;` with `const cwd = step.cwd ? resolveSafePath(root, step.cwd) : root;`
  - Document that `step.cwd` is now strictly inside `root`; out-of-tree `cwd` throws.

## Implementation Steps (TDD-first: Red → Green → Refactor → Lock)

### Step 1: RED — Helper core

1. Write `__tests__/path-containment.test.js` cases:
   - `traversal_relative`: `root=/tmp/r`, `userPath='../../../etc/passwd'` → throws `PathContainmentError({ reason: 'outside_root' })`
   - `symlink_escape`: create temp root, symlink `root/leak → /etc/passwd`, call `resolveSafePath(root, 'leak')` → throws `outside_root`
   - `legitimate_deep_path`: `root=/tmp/r/foo`, `userPath='../bar'` → returns `/tmp/r/bar` (allowed)
   - `absolute_path_outside_root`: `root=/tmp/r`, `userPath='/etc/passwd'` → throws `outside_root`
   - `root_equals_root`: `userPath='.'` → returns `realpath(root)` (allowed)
   - `hardlink_rejected`: create temp root, hardlink `root/leak → /etc/passwd`, call `resolveSafePath(root, 'leak')` → throws `hardlink_rejected`
   - `path_with_colon_suffix`: `userPath='tools/foo.js:../../etc/passwd'` → throws `traversal_detected` (R15 defensive)
   - `null_byte_throws`: `userPath='foo\0bar'` → throws
   - `cache_hit`: call twice with same root → second call uses cache (verified by spy on `realpathSync` or by reading `realpathCache` via test export)
   - `clear_cache_test_helper`: after `clearRealpathCache()`, next call re-resolves
2. Run tests → fail.

### Step 2: GREEN — Implement `path-containment.js`

1. Create the module per the Architecture snippet.
2. Run tests → all pass.

### Step 3: RED — Audit-site migrations

1. Write `__tests__/legacy-mcp/path-containment-audit-sites.test.js` cases (one per site):
   - `refresh_fingerprint_rejects_traversal`: stub entry with `evidence_code_ref: 'tools/foo.js:../../../etc/passwd'`, call the tool → throws `PathContainmentError`
   - `check_grounding_rejects_traversal`: similar
   - `derive_status_rejects_traversal`: similar
   - `gate_logic_resolution_evidence_rejects_traversal`: similar
   - `check_grounding_tool_run_test_rejects_traversal`: similar
   - `derive_status_tool_run_test_rejects_traversal`: similar
   - `verification_runner_rejects_out_of_tree_cwd`: stub step with `cwd: '../../../etc'`, call `runVerification` → throws `PathContainmentError`
   - `legitimate_paths_still_work`: smoke test that legitimate paths (e.g., `tools/learning-loop-mastra/core/surfaces.js`) still resolve correctly across all 7 sites.
2. Run tests → fail (sites still use `path.join`).

### Step 4: GREEN — Migrate each audit site

1. For each of the 7 sites, add the import and replace `path.join(root, ...)` with `resolveSafePath(root, ...)`. One commit per site (or batched if mechanical).
2. Run tests after each migration → pass.

### Step 5: REFACTOR

1. Extract `canonicalRoot(root)` and `isHardlinked(absPath)` as exported testable helpers (already done in step 2).
2. Add JSDoc to each migration site pointing back to `path-containment.js`.
3. Add an `/* istanbul ignore next */` on the `try/catch` fallback for `isHardlinked` (return false on error is intentional; tests verify).

### Step 6: LOCK — Edge case guards

1. Add a "Files NOT migrated" guard test: assert that the ONLY `path.join(root,` callers in `core/` and `tools/legacy/` (that match the user-path pattern) are now `resolveSafePath(root,`. Anything else is a regression.
2. Add cross-platform skip: tests for Windows UNC paths are wrapped in `if (process.platform === "win32")`; the rest run on Linux/macOS.

## Success Criteria

- [ ] Red-team R5 finding has passing tests (`hardlink_rejected`, TOCTOU documented pattern)
- [ ] Red-team R15 finding has passing test (`path_with_colon_suffix`)
- [ ] All 7 audit sites migrated from `path.join` to `resolveSafePath`
- [ ] Per-call cost ≤ 0.2ms (measured by `bench` or simple `console.time` in test)
- [ ] No `path.join(root, userPath)` calls remain in `core/` or `tools/legacy/` that take user input (verified by a grep guard test)
- [ ] `pnpm test` passes (~165 tests; +5 from LIM-4 new files)

## Tests / Validation

- **Unit:** `__tests__/path-containment.test.js`, `__tests__/legacy-mcp/path-containment-audit-sites.test.js`
- **Regression:** existing `__tests__/legacy-mcp/check-grounding.test.js`, `__tests__/legacy-mcp/derive-status.test.js`, `__tests__/legacy-mcp/strip-evidence-anchor.test.js`, `__tests__/legacy-mcp/meta-state-refresh-fingerprint-tool.test.js`, `__tests__/legacy-mcp/meta-state-check-grounding-tool.test.js`, `__tests__/legacy-mcp/meta-state-derive-status-tool.test.js`
- **Performance:** inline `console.time` + `console.timeEnd` in one test to assert ≤ 0.2ms per call; CI fails if it exceeds

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hardlink rejection breaks legitimate multi-link files (e.g., `node_modules/.bin/foo`) | Medium | Medium | Most user-path joins are `evidence_code_ref` / `evidence_test` (specific files), not `node_modules`. Document the trade-off; add `pathAllowHardlink` per-call opt-out for tools that need it. |
| Realpath syscall races on rapidly-created files (TOCTOU) | Low | Medium | Document NF3: callers MUST re-invoke `resolveSafePath` immediately before write. Audit-site migrations follow this pattern. |
| Colon reject breaks legitimate `evidence_code_ref` with `:line` | Low | Low | `stripEvidenceAnchor` runs BEFORE `resolveSafePath`; the colon-suffix is stripped first. Defensive reject only fires on residual colons. |
| `path-containment.js` import side-effect on `core/surfaces.js` consumers | Low | Low | `path-containment.js` has no top-level side effects; only `realpathCache` is module-scoped. Test imports to verify. |

## Rollback

If Phase 2 fails validation post-merge:
1. Revert commit `fix(path): LIM-4 realpath containment for user-supplied write paths`
2. Audit sites fall back to `path.join(root, userPath)` (current behavior)
3. Open follow-up plan; do not ship hotfix without validation

## Cross-references

- Phase 1 (R2): `phase-01-r2-write-gate.md` (gating chain: path containment → R2 ownership → execute)
- Scout report (audit-site verification): see plan.md References section
- Red-team review: `plans/reports/general-purpose-260701-2312-GH-5-plan-5-lite-r2-lim4-red-team-plan-review-report.md` (Findings R5, R15, R17)
- Original plan: `plans/260701-1730-plan-5-hardening-r2-lim3-lim4/phase-03-lim-4-path-containment-realpath.md`
- Phase 3 (Cross-Cutting): `phase-03-cross-cutting.md` (docs update + audit-log hardening)