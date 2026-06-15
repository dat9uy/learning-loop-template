---
phase: 5
title: "Test quality improvements"
status: pending
priority: P3
effort: "30m"
dependencies: []
---

# Phase 5: Test quality improvements

## Overview

Three test-quality fixes: either strengthen or drop the "mutation test" in `gate-logic-glob-whitelist.test.js` (1.4), either strengthen or drop the "best-effort" test in `surfaces.test.js` (1.5), and strengthen the shim-mirror predicate in `check-runtime-agnostic-tool.js` to also verify file-content equality (4.2) OR document the weaker check as intentional. No new public surface; no behavior change to the runtime-agnostic audit.

## Cleanup items addressed

- **1.4** (Step 1, test-quality) — `gate-logic-glob-whitelist.test.js` "mutation test" doesn't actually exercise parameterization.
- **1.5** (Step 1, test-quality) — `surfaces.test.js` "best-effort" test doesn't actually exercise a failure path.
- **4.2** (Step 4, test-quality) — `check-runtime-agnostic-tool.js` shim-mirror predicate only checks existence, not content equality.

## Requirements

Functional: the strengthened tests must pin real contracts (not just exercise the existing implementation trivially).
Non-functional: prefer "strengthen" over "drop" — only drop a test if the contract is genuinely untestable in the current environment.

## Architecture

### 5.1 — `gate-logic-glob-whitelist.test.js` "mutation test" (item 1.4)

**Current code** (lines 36-47):
```js
await test("GLOB_SCOPE_WHITELIST includes both surfaces when SURFACES is multi-element", async () => {
  // Mutation test: dynamically import to get a fresh module with the current SURFACES
  const { SURFACES } = await import("../core/surfaces.js");
  // Create a temporary extended array (do not mutate the frozen constant)
  const extended = [...SURFACES, ".cursor"];
  // The whitelist is built from the actual SURFACES at module load time.
  // We verify the parameterization property by checking that both current
  // surfaces are present, which proves the spread-map construction works.
  assert.ok(SURFACES.includes(".claude"), "SURFACES includes .claude");
  assert.ok(SURFACES.includes(".factory"), "SURFACES includes .factory");
  assert.strictEqual(SURFACES.length, 2, "SURFACES has exactly 2 elements today");
});
```

The test is named "mutation test" but doesn't actually mutate anything; it just imports `SURFACES` and asserts its current contents. The real parameterization property — that adding a new surface to `SURFACES` causes the whitelist to include it — is not exercised.

**Option A — strengthen**: use `vi.spyOn` or a module-level mock to swap `SURFACES` for a 3-element array (e.g., `[".claude", ".factory", ".cursor"]`) and assert `isGlobScopeWhitelisted(".cursor/foo")` returns `true`. This requires:
- `import { vi } from "vitest"` or equivalent.
- Module mocking (`vi.mock("../core/surfaces.js", ...)`) to swap the export.
- Re-import of `gate-logic.js` to pick up the new module.

**Option B — drop**: the test is just an assertion on `SURFACES` itself, which is tested more directly in `surfaces.test.js:18` ("SURFACES is frozen and equals [.claude, .factory]"). The "mutation test" adds no value.

**Decision: Option A — strengthen with module mock**. The cost is ~20 LoC; the value is that the test actually pins the parameterization property. The codebase already has `vi`/`vitest` patterns (verify by `grep -rn "vi.mock\|vi.spyOn" tools/learning-loop-mcp/__tests__/`).

**Strengthened test** (sketch):
```js
import { vi } from "vitest";

await test("GLOB_SCOPE_WHITELIST parameterizes on SURFACES: adding a surface whitelists it", async () => {
  vi.resetModules();
  vi.doMock("../core/surfaces.js", () => ({
    SURFACES: Object.freeze([".claude", ".factory", ".cursor"]),
    // ... other exports (not relevant for this test)
  }));
  const { isGlobScopeWhitelisted } = await import("../core/gate-logic.js");
  assert.strictEqual(isGlobScopeWhitelisted(".cursor/some-file.txt"), true);
  assert.strictEqual(isGlobScopeWhitelisted(".unknown-surface/some-file.txt"), false);
  vi.doUnmock("../core/surfaces.js");
  vi.resetModules();
});
```

**Fallback if vi.mock is too fragile**: Option B (drop the test, document the gap).

### 5.2 — `surfaces.test.js` "best-effort" test (item 1.5)

**Current code** (lines 78-88):
```js
await test("writeToAllSurfaces best-effort: does not throw if one surface fails", () => {
  // Create a read-only parent directory for .factory to simulate a failure
  const factoryParent = join(root, ".factory");
  mkdirSync(factoryParent, { recursive: true });
  // Best-effort means it should still succeed for .claude even if .factory fails
  // We can't easily simulate a real failure cross-platform, so we verify the
  // contract by asserting no throw and .claude still gets the file.
  writeToAllSurfaces(root, "markers/best-effort.json", '{"ok": true}');
  const claudePath = join(root, ".claude", "coordination", "markers", "best-effort.json");
  assert.ok(existsSync(claudePath), ".claude should still get the file");
});
```

The test acknowledges it can't easily simulate a real failure cross-platform. The test passes whether the implementation throws or not (because the simulated failure isn't actually triggered — `mkdirSync(join(root, ".factory"))` succeeds, and `writeFileSync` to `.factory/coordination/markers/best-effort.json` also succeeds in the normal case).

**Option A — strengthen with chmod 000 (Unix-only)**: tag the test with `@platform=posix` and use `chmodSync(join(root, ".factory", "coordination"), 0o000)` to deny write, then restore with `chmodSync(..., 0o755)` in a `try/finally`. This actually exercises the best-effort path.

**Option B — drop the test, document the gap**: the contract is "best-effort per surface; one failure does not abort the others" — already documented in `surfaces.js:35-36`. The function is small; the documentation is the source of truth.

**Decision: Option A — strengthen with chmod 000 + try/finally**. The test is tagged Unix-only (the project's tests already run on Linux per `package.json` scripts; the WSL2 environment is Linux). The ~5 LoC addition is worth the genuine coverage.

**Strengthened test** (sketch):
```js
import { chmodSync } from "node:fs";

await test("writeToAllSurfaces best-effort: skip-on-permission-denied (Unix)", () => {
  if (process.platform === "win32") return; // skip on Windows
  const factoryDir = join(root, ".factory", "coordination");
  mkdirSync(factoryDir, { recursive: true });
  chmodSync(factoryDir, 0o000);
  try {
    // Should not throw; .claude should still get the file.
    writeToAllSurfaces(root, "markers/best-effort.json", '{"ok": true}');
    const claudePath = join(root, ".claude", "coordination", "markers", "best-effort.json");
    assert.ok(existsSync(claudePath), ".claude should still get the file");
  } finally {
    chmodSync(factoryDir, 0o755);
  }
});
```

### 5.3 — `check-runtime-agnostic-tool.js` shim-mirror predicate (item 4.2)

**Current code** (line 55-75 in `check-runtime-agnostic-tool.js`; the CHECKLIST item `shims-in-sync` is in `runtime-agnostic-checklist.js:106-134`):

```js
// runtime-agnostic-checklist.js
{
  id: "shims-in-sync",
  description: "...",
  verify(featurePath, root) {
    const hookFiles = [];
    for (const file of walkFiles(root, featurePath)) {
      if (!isCodeFile(file)) continue;
      if (isHookFile(file)) hookFiles.push(file);
    }
    if (hookFiles.length === 0) return pass();

    const missing = [];
    for (const file of hookFiles) {
      const shimName = basename(file, extname(file)) + ".cjs";
      for (const shimDir of SHIM_DIRS) {
        const shimPath = join(root, shimDir, shimName);
        if (!existsSync(shimPath)) missing.push(`${shimDir}/${shimName}`);
      }
    }
    if (missing.length) {
      return fail(missing.join(", "), "matching shim in both .claude/coordination/hooks and .factory/coordination/hooks", "...");
    }
    return pass();
  },
},
```

The current check verifies **existence only** — a `.claude/coordination/hooks/foo.cjs` that contains `console.log("not a real shim")` would pass. The code review's recommendation: hash-compare the shim files (or document the weaker check as intentional).

**Option A — hash-compare the shim files**: use `readFileSync` + a SHA-256 hash. If the two shims' contents differ, fail. Implementation: in the `verify` function, after `existsSync`, compare `readFileSync(shimPath, "utf8")` across the two surface directories.

**Option B — document the weaker check as intentional**: the shim-not-fork invariant is "the shim is a thin wrapper that delegates to the universal hook"; the content equality is a stronger check that's useful but not required. The current existence check is the contract; the content check is a future hardening.

**Decision: Option A — hash-compare**. The shim-mirror invariant's whole point is "if I edit the universal hook, both shims get the same wrapper automatically." If the shims diverge, that invariant is broken. ~10 LoC; matches the code review's recommendation.

**Strengthened check** (sketch):
```js
import { readFileSync, createHash } from "node:fs";
// ...
{
  id: "shims-in-sync",
  description: "...",
  verify(featurePath, root) {
    // ... (collect hookFiles as before)
    const missing = [];
    const mismatched = [];
    for (const file of hookFiles) {
      const shimName = basename(file, extname(file)) + ".cjs";
      const [claudeShim, factoryShim] = SHIM_DIRS.map((d) => join(root, d, shimName));
      if (!existsSync(claudeShim)) missing.push(`${SHIM_DIRS[0]}/${shimName}`);
      if (!existsSync(factoryShim)) missing.push(`${SHIM_DIRS[1]}/${shimName}`);
      if (existsSync(claudeShim) && existsSync(factoryShim)) {
        const claudeHash = createHash("sha256").update(readFileSync(claudeShim, "utf8")).digest("hex");
        const factoryHash = createHash("sha256").update(readFileSync(factoryShim, "utf8")).digest("hex");
        if (claudeHash !== factoryHash) {
          mismatched.push(`${shimName} (claude=${claudeHash.slice(0, 8)} factory=${factoryHash.slice(0, 8)})`);
        }
      }
    }
    const allIssues = [...missing, ...mismatched];
    if (allIssues.length) {
      return fail(
        allIssues.join(", "),
        "matching shim content in both .claude/coordination/hooks and .factory/coordination/hooks",
        "Run the shim mirror script (or copy the shim from one surface to the other) so the content matches. " +
        "The shim is a thin wrapper; the universal hook does the real work — the shim contents should be identical.",
      );
    }
    return pass();
  },
},
```

The test (`__tests__/runtime-agnostic.test.js`) should add a new case for the mismatched case. The existing existence-check tests should still pass (the new hash check is layered on top of the existence check).

## Related Code Files

- Modify: `tools/learning-loop-mcp/__tests__/gate-logic-glob-whitelist.test.js:36-47` (item 1.4)
- Modify: `tools/learning-loop-mcp/__tests__/surfaces.test.js:78-88` (item 1.5)
- Modify: `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:106-134` (item 4.2 — strengthen the shim-mirror predicate)
- Modify: `tools/learning-loop-mcp/__tests__/runtime-agnostic.test.js` (item 4.2 — add a new test for the mismatched case)

## Implementation Steps

1. **Item 1.4** — Strengthen the "mutation test" in `gate-logic-glob-whitelist.test.js` using `vi.doMock` + a re-import of `gate-logic.js`. Verify the strengthened test passes and the original 10 tests still pass.
2. **Item 1.5** — Strengthen the "best-effort" test in `surfaces.test.js` with `chmodSync(0o000)` + `try/finally`. Tag with a Unix-only check.
3. **Item 4.2** — Add hash-compare to the `shims-in-sync` CHECKLIST item in `runtime-agnostic-checklist.js`. Add a new test in `runtime-agnostic.test.js` for the mismatched case (write different content to both shims; expect `fail`).
4. **Verify** by `pnpm test` — expect 987-990/988-991 (1 skipped + 2-3 new tests from items 1.4/1.5/4.2).

## Success Criteria

- [ ] `gate-logic-glob-whitelist.test.js` "mutation test" actually exercises parameterization (uses `vi.doMock` or equivalent to swap `SURFACES`; asserts `.cursor` is whitelisted).
- [ ] `surfaces.test.js` "best-effort" test actually exercises a failure path (uses `chmodSync(0o000)` on Unix; restores in `try/finally`).
- [ ] `runtime-agnostic-checklist.js#shims-in-sync` checks both existence AND content equality (SHA-256 hash compare).
- [ ] `__tests__/runtime-agnostic.test.js` has a new test for the mismatched-shim case.
- [ ] `pnpm test` shows ≥ 988/988 (1 skipped) — at least 2 new tests (1.4 + 1.5 + 4.2 = 3 new tests possible; minimum 2 if 1.4 falls back to drop).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `vi.doMock` doesn't reset cleanly between tests | `vi.resetModules()` + `vi.doUnmock` in a `try/finally`-style cleanup at the end of the test. Verified pattern in many vitest codebases. |
| `chmodSync(0o000)` test is platform-specific; fails on Windows | The early-return `if (process.platform === "win32") return;` skips the test on Windows. The WSL2 environment is Linux. |
| Hash-compare is slower than existence check (full file read per surface) | The shim files are tiny (≤100 LoC each). Hash-compare is O(file-size). For a feature with N shims, the cost is N × 2 × file-size. ~ms for typical features. Documented in the CHECKLIST JSDoc. |
| Hash-compare detects a legitimate divergence (e.g., a shim that intentionally includes a surface-specific env var) | If the shim-not-fork invariant says "the shim is a thin universal wrapper," then a divergent shim IS a violation. The fix_suggestion tells the agent to "copy the shim from one surface to the other." If the divergence is intentional, the feature should not use the shim pattern. |
| Existing tests in `runtime-agnostic.test.js` rely on the existence-only check (write one shim, skip the other) | Verify by re-running the test suite. If any test fails, update the test to also write both shims with matching content. |
