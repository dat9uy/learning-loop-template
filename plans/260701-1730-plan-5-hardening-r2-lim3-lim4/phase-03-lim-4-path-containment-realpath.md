---
phase: 3
title: "LIM-4 Path Containment (realpath)"
status: pending
priority: P1
dependencies: []
effort: "1d"
---

# Phase 3: LIM-4 Path Containment (realpath)

## Overview

Replace the `isAbsolute(s) ? s : join(root, s)` pattern (currently in 6+ places) with a `realpath`-anchored containment helper that guarantees the resolved path lives inside the project root after symlink resolution. Closes LIM-4 (the path-traversal security finding) AND the test-runner attack surface where `evidence_test` flows into `spawnSync(pnpm test -- <attackerPath>)`. **TDD-first**: write the failing containment tests BEFORE implementing the helper; the helper is added to `core/path-containment.js` and applied to all 6 audit sites per Researcher B Section 1.

## Requirements

### Functional

- **F1.** New module `tools/learning-loop-mastra/core/path-containment.js` exports `resolveInsideRoot(userPath, root)` and a `PathContainmentError` class.
- **F2.** Helper contract:
  - Absolute paths OUTSIDE `root` → throw `PathContainmentError("outside_root")`.
  - Relative paths that traverse outside `root` (after `normalize`) → throw `PathContainmentError("outside_root")`.
  - Paths whose existing ancestor is a symlink pointing outside `root` → throw `PathContainmentError("outside_root")` (realpath detection).
  - Paths inside `root` (existing or non-existing leaf) → return resolved absolute path.
  - Empty / non-string inputs → throw `PathContainmentError("empty")`.
- **F3.** Apply `resolveInsideRoot` at 7 audit sites identified by Researcher B Section 1 + red-team Finding 1:
  1. `tools/learning-loop-mastra/tools/legacy/meta-state-refresh-fingerprint-tool.js:116` — `evidence_code_ref` for fingerprint refresh.
  2. `tools/learning-loop-mastra/core/check-grounding.js:142` — `evidence_code_ref` for hash + existence.
  3. `tools/learning-loop-mastra/core/derive-status.js:88` — `evidence_code_ref` AND `evidence_test`.
  4. `tools/learning-loop-mastra/core/gate-logic.js:672` — `resolveEvidence` helper.
  5. `tools/learning-loop-mastra/tools/legacy/meta-state-check-grounding-tool.js:17` — `evidence_test` for `run_tests`.
  6. `tools/learning-loop-mastra/tools/legacy/meta-state-derive-status-tool.js:17` — `evidence_test` for `run_tests`.
  7. **`tools/learning-loop-mastra/tools/legacy/meta-state-derive-status-tool.js:23`** (`runTest`'s `spawnSync` for `pnpm test`) — **direct attack surface; Researcher B §1 item 6 was the wrong call site; red-team Finding 1 added this site**. `resolveInsideRoot(fullPath, root)` at line 17 BEFORE `spawnSync`; wrap in try/catch for `PathContainmentError`.
- **F4.** Existing error contract preserved: when containment throws, the caller returns the existing `code_missing` shape with an additional `path_containment: "outside_root"` field. No new tool error shape.
- **F5.** `evaluate-write-gate.js:147-152` is NOT modified (Researcher B item 13; LOW risk; path is relative-only; current `normalize()` already covers the escape; symlink edge case noted as future hardening).

### Non-functional

- **NF1.** `realpath` cost: ≤ 5ms per call (single syscall); helper caches `realRoot` per process via module-level memoization.
- **NF2.** Fail-closed semantics: any containment error → throw → caller catches → returns existing `code_missing` shape with `path_containment` flag. Never silently allow + log.
- **NF3.** Compatibility: the existing `stripEvidenceAnchor` call (`tools/learning-loop-mastra/mastra/workflows/workflow-intentional-skip.js`-style usage) is preserved; containment runs AFTER the anchor strip.

## Architecture

### Helper module — **REVISED to key cache by `realpath(root)`** (red-team Findings 20 + AD7)

```js
// tools/learning-loop-mastra/core/path-containment.js (proposed)
import { realpath, sep, isAbsolute, normalize } from "node:path";
import { existsSync } from "node:fs";

export class PathContainmentError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "PathContainmentError";
    this.code = code;
  }
}

// RED-TEAM FIX (Findings 20 + AD7): key cache by canonicalized realRoot, NOT user-passed root string.
// Avoids stale cache hits on macOS symlinked temp dirs and on input-string canonicalization drift.
let _realRootCache = new Map();

export function resolveInsideRoot(userPath, root) {
  if (typeof userPath !== "string" || !userPath) {
    throw new PathContainmentError("path must be a non-empty string", "empty");
  }
  if (!root || typeof root !== "string") {
    throw new PathContainmentError("root must be a non-empty string", "empty_root");
  }
  // Compute realRoot once, cache by canonicalized form.
  let realRoot = realpath(root);
  const cacheKey = realRoot; // canonical key
  if (_realRootCache.has(cacheKey)) {
    realRoot = _realRootCache.get(cacheKey);
  } else {
    _realRootCache.set(cacheKey, realRoot);
  }
  const candidate = isAbsolute(userPath)
    ? userPath
    : normalize(`${realRoot}${sep}${userPath}`);
  const resolved = existsSync(candidate) ? realpath(candidate) : candidate;
  const inside =
    resolved === realRoot || resolved.startsWith(realRoot + sep);
  if (!inside) {
    throw new PathContainmentError(
      `path escapes project root: ${userPath}`,
      "outside_root",
    );
  }
  return resolved;
}
```

### Edge-case matrix

| Input | Expected behavior |
|-------|-------------------|
| `"/etc/passwd"` (absolute, outside) | throw `outside_root` |
| `"../../../etc/passwd"` (traversal) | throw `outside_root` |
| `"src/file.js"` (inside, exists) | return `<root>/src/file.js` |
| `"link.txt"` (inside but symlink → /etc/hostname) | throw `outside_root` (realpath detects) |
| `"nested/missing.md"` (inside, doesn't exist) | return `<root>/nested/missing.md` (no realpath on missing leaf) |
| `""` or `null` | throw `empty` |
| `"../README.md"` (file outside via ..) | throw `outside_root` |
| `"/abs/path/equal/to/root"` (no trailing sep) | return `<root>` (equality branch) |
| Symlink parent → outside | throw `outside_root` |

### Audit sites + changes — **REVISED 2026-07-01 to add audit site #7** (red-team Finding 1)

| # | File:line | Before | After |
|---|-----------|--------|-------|
| 1 | `tools/legacy/meta-state-refresh-fingerprint-tool.js:116` | `const absPath = isAbsolute(strippedCodeRef) ? strippedCodeRef : join(root, strippedCodeRef);` | `const absPath = resolveInsideRoot(strippedCodeRef, root);` |
| 2 | `core/check-grounding.js:142` | `const abs = isAbsolute(s) ? s : join(root, s);` | `const abs = resolveInsideRoot(s, root);` |
| 3 | `core/derive-status.js:88` | `const abs = isAbsolute(s) ? s : join(root, s);` (x2 for evidence_code_ref + evidence_test) | both replaced with `resolveInsideRoot(s, root)` |
| 4 | `core/gate-logic.js:672` (`resolveEvidence`) | `const abs = isAbsolute(s) ? s : join(root, stripEvidenceAnchor(s));` | `const abs = resolveInsideRoot(stripEvidenceAnchor(s), root);` |
| 5 | `tools/legacy/meta-state-check-grounding-tool.js:17` | `const abs = isAbsolute(s) ? s : join(root, s);` | `const abs = resolveInsideRoot(s, root);` |
| 6 | `tools/legacy/meta-state-derive-status-tool.js:17` | `const abs = isAbsolute(s) ? s : join(root, s);` | `const abs = resolveInsideRoot(s, root);` |
| **7 (NEW)** | **`tools/legacy/meta-state-derive-status-tool.js:23`** (`runTest`) | `spawnSync("pnpm", ["test", "--", fullPath], { cwd: root, timeout: 30_000, shell: false })` — **bypasses `runVerification` entirely**; Researcher B §1 item 6 was the WRONG call site (red-team Finding 1) | **Apply `resolveInsideRoot(fullPath, root)` at line 17 (ABSOLUTE-PATH-INJECTION GUARD); wrap `spawnSync` in try/catch for `PathContainmentError` to return `code_missing` with `path_containment: "outside_root"`** |

### Containment error handling

Each call site wraps the throw in a try/catch that returns the existing tool error shape:

```js
// Pattern at each call site (after the fix):
let absPath;
try {
  absPath = resolveInsideRoot(strippedCodeRef, root);
} catch (err) {
  if (err instanceof PathContainmentError) {
    return {
      content: [{ type: "text", text: JSON.stringify({
        error: "code_missing",
        id,
        evidence_code_ref: strippedCodeRef,
        path_containment: err.code,  // "outside_root" or "empty"
        cache_hit: false,
      }) }],
    };
  }
  throw err;
}
```

This preserves the public tool contract (still returns `code_missing`) while exposing the new failure reason.

## Related Code Files

### Create

- `tools/learning-loop-mastra/core/path-containment.js` (~50 LoC: helper + error class + realRoot cache)
- `tools/learning-loop-mastra/__tests__/path-containment.test.js` (~150 LoC: 8 edge cases per Researcher B Section 5 + 4 integration tests)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-refresh-fingerprint-tool-path-traversal.test.js` (~80 LoC: TDD red test asserting `/etc/passwd` is refused with `code_missing + path_containment: "outside_root"`)

### Modify

- `tools/learning-loop-mastra/tools/legacy/meta-state-refresh-fingerprint-tool.js:116` (TDD refactor; preserves existing test parity)
- `tools/learning-loop-mastra/tools/legacy/meta-state-check-grounding-tool.js:17`
- `tools/learning-loop-mastra/tools/legacy/meta-state-derive-status-tool.js:17`
- `tools/learning-loop-mastra/core/check-grounding.js:142`
- `tools/learning-loop-mastra/core/derive-status.js:88`
- `tools/learning-loop-mastra/core/gate-logic.js:672` (`resolveEvidence`)

### Delete

- None.

## Implementation Steps

### Step 1: Write failing regression tests (TDD red)

Write the 8 helper unit tests + 2 integration tests:

1. `__tests__/path-containment.test.js` (8 cases from §"Edge-case matrix"):
   - absolute outside → throws `outside_root`
   - traversal → throws `outside_root`
   - inside existing → returns resolved path
   - inside symlink to outside → throws `outside_root`
   - inside non-existent leaf → returns candidate
   - empty/null → throws `empty`
   - .. escape → throws `outside_root`
   - root equality (no trailing sep) → returns root

2. `__tests__/legacy-mcp/meta-state-refresh-fingerprint-tool-path-traversal.test.js` (2 integration tests):
   - Call `meta_state_refresh_fingerprint` with an entry whose `evidence_code_ref = "/etc/passwd"` → returns `{ error: "code_missing", path_containment: "outside_root" }` (NOT a hash of `/etc/passwd`).
   - Call with `evidence_code_ref` pointing to a project symlink that escapes → same denial.

Run tests; both fail. Commit "Phase 3 Step 1: TDD red — path containment gap regression tests added".

### Step 2: Implement helper (TDD green)

- Implement `core/path-containment.js` per §"Helper module".
- Re-run Step 1 tests; they pass.

### Step 3: Apply at audit site #1 (TDD green — refresh-fingerprint)

- Modify `tools/learning-loop-mastra/tools/legacy/meta-state-refresh-fingerprint-tool.js:116` to use `resolveInsideRoot`.
- Add the try/catch wrapper per §"Containment error handling".
- Run the existing `meta-state-refresh-fingerprint-tool.test.js`; all baseline tests still pass.
- Run the new path-traversal test from Step 1; passes.

### Step 4: Apply at audit sites #2-6 (TDD green)

- Apply the same `resolveInsideRoot` + try/catch pattern at sites 2-6.
- Run existing tests for each affected module:
  - `core/__tests__/check-grounding.test.js`
  - `core/__tests__/derive-status.test.js`
  - `core/__tests__/gate-logic.test.js`
  - `__tests__/legacy-mcp/meta-state-check-grounding-tool.test.js`
  - `__tests__/legacy-mcp/meta-state-derive-status-tool.test.js`
- All baseline + new tests pass.

### Step 5: Add cross-cutting symlink test

- Add a test case to `__tests__/path-containment.test.js` that creates a temp project, creates a symlink inside the project pointing to `/etc/hostname`, and asserts `resolveInsideRoot(symlinkPath, tempRoot)` throws `outside_root`.
- Verifies the realpath detection works.

### Step 6: Lock regression guards

- Add `path-containment` to `run-pnpm-test-namespaced.mjs` test GLOB (extends `phase-5-hardening` namespace).
- Run all 10+ namespaces; no regressions.

## Success Criteria

- [ ] All 8 helper unit tests pass (Step 1).
- [ ] All 2 integration tests pass (Step 1 + Step 3 + Step 4).
- [ ] `meta_state_refresh_fingerprint` against `/etc/passwd` returns `code_missing + path_containment: "outside_root"` (NOT a hash).
- [ ] `meta_state_check_grounding` + `meta_state_derive_status` similarly refuse paths outside root (test-runner RCE vector closed).
- [ ] Existing tool contract preserved: `code_missing` shape + `cache_hit: false` unchanged; only the new `path_containment` field is added.
- [ ] `pnpm test` passes with no regressions (all 10+ namespaces green).
- [ ] Containment helper is symlink-aware (verified by Step 5 test).

## Risk Assessment

- **R1 (HIGH):** Modifying `core/check-grounding.js`, `core/derive-status.js`, `core/gate-logic.js` touches the FCIS core layer (per Phase E Plan 1 invariant). Mitigation: the helper is a pure function (`core/path-containment.js`); it doesn't import anything that breaks FCIS. TDD refactor with all existing core tests must pass.
- **R2 (MED):** `realpath` is a syscall; per-call cost is ~0.5-2ms depending on FS. Mitigation: cache `realRoot` per process via module-level Map; never re-resolve the project root within one process lifetime.
- **R3 (MED):** The test-runner path injection (Researcher B §1 items 5+6) is partially mitigated by `resolveInsideRoot`, but `verification-runner.js` itself can still be attacked via `--` arg smuggling in the test command. Out of scope for Plan 5; document in Phase 4 docs as future hardening.
- **R4 (MED):** `gate-logic.js:672` `resolveEvidence` is called from many places; the change propagates broadly. Mitigation: TDD refactor; run ALL core + tool tests.
- **R5 (LOW):** `evaluate-write-gate.js:147-152` is NOT modified (intentional; LOW risk; symlink edge case noted). Mitigation: future hardening can add the same helper here.
- **R6 (LOW):** Symlink-on-parent edge case: if the project root itself is a symlink (unusual but possible with `git worktree`), `realpath(root)` resolves it; helper is anchored to the real path. Caller `resolveRoot()` must return the same root used to compute `realRoot` — pin them in the same module.