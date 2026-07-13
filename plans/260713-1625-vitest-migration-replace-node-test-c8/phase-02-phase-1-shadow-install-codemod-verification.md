---
phase: 2
title: "Phase 1: Shadow install + codemod + verification"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Phase 1: Shadow install + codemod + verification

## Overview

Install vitest + `@vitest/coverage-v8` as devDeps and add a **non-gating** `pnpm test:vitest` (does NOT touch the pre-commit hook). Write the codemod (import swap + 6 hook-call-site fixes + t.skip fix) and the 12-gate-test wrap transforms. Run ALL of them against a **copy** of the tree and verify: vitest green, coverage Istanbul-shaped, **`fallow:gate` green** (the real gate — red-team H1), r2 green, vitest ≥3.2.0. No production test file is mutated. Output: a cutover checklist that gates Phase 2.

## Requirements

- Functional: in a copy, vitest runs all 234 files (222 `tools/` + 8 `.claude/coordination` + 4 `.factory/hooks`), emits a test-results JSON (`numTotalTests`/`numFailedTests`/`assertionResults[]`) and `coverage/coverage-final.json` (Istanbul).
- Non-functional: `pnpm test` (c8 + namespaced runner) **unchanged**. Production tree untouched. `pnpm test:vitest` is additive, not in the pre-commit hook.

## Architecture

**`vitest.config.mjs`** (repo root):
```js
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "tools/learning-loop-mastra/**/*.test.{js,cjs,mjs}",
      ".claude/coordination/__tests__/*.test.cjs",   // red-team C3: widen include
      ".factory/hooks/__tests__/*.test.cjs",
    ],
    testTimeout: 120000,
    hookTimeout: 120000,           // red-team C2: covers the 6 before(fn,{timeout}) hooks
    reporters: ["default", "json"],
    outputFile: ".test-logs/vitest-results.json",
    coverage: {
      provider: "v8",
      reporter: ["json"],
      reportsDirectory: "coverage",   // → coverage/coverage-final.json (istanbul json default)
      include: ["tools/learning-loop-mastra/**/*.js"],
      exclude: ["**/*.test.{js,cjs,mjs}", "**/fixtures/**", "**/__tests__/helpers/**"],
      clean: true,
    },
  },
});
```

**Codemod (`tools/scripts/codemod-node-test-to-vitest.mjs`)** — a pure transform per file:
1. Swap `import { test, describe, it, before, beforeEach, after, afterEach, ... } from "node:test"` → `from "vitest"` (only bindings present; red-team verified the set is `{after,afterEach,before,beforeEach,describe,it,test}`).
2. **Keep** `import assert from "node:assert"` / `import { strict as assert }` untouched (192 files).
3. **red-team C2:** rewrite `before|after|beforeEach|afterEach(fn, { timeout: N })` → `(fn, N)` (6 sites: agent-parity:32, mcp-tools-list-parity:43, cold-session-enumerate-mastra:60, workflow-parity:48, storage-parity:232, debug/agent-e2e-integration:38).
4. **red-team M1:** rewrite `t.skip(REASON)` → `t.skip(true, REASON)` (storage-parity:162 only — lifecycle-migration-finalize's 3 sites are pruned in Phase 0).
5. Leave `node:fs`/`node:path`/etc. untouched.

**12-gate-test wrap transform** (red-team C3, operator-approved) — for each of the 8 `.claude/coordination/__tests__/*.test.cjs` + 4 `.factory/hooks/__tests__/*.test.cjs`:
- Wrap the script body (top-level `spawnSync` + `assert` + `process.exit(failed?1:0)`) in `test("<gate name>", () => { <body, with process.exit(1)→throw> })`.
- **Semantic preservation (R13):** the wrapped `test()` must assert the SAME gate outcome as the script version (same spawnSync invocation, same exit-code interpretation, now throwing on failure instead of `process.exit(1)`). Per-file review required.
- Add the `vitest` import (these files currently use `require()` + `spawnSync`; they're CommonJS script-style — the wrap adds `import { test } from "vitest"` or uses a `require`-compatible form).

**Discovery (shadow dry-run):**
1. Copy `tools/learning-loop-mastra/` + `.claude/coordination/__tests__/` + `.factory/hooks/__tests__/` to `/tmp/vitest-shadow/`.
2. Run the codemod + 12-wrap transforms on the copy.
3. Run `vitest run` (with the config, cwd=repo root) on the copy.
4. Capture: full `node:test` binding set (R1), all import/undefined-ref/API-mismatch errors, the 12 wrapped gates' pass/fail vs the script versions (R13), coverage-file Istanbul shape, `t.test()` usage (expect 0 — red-team confirmed).
5. **The gate (red-team H1):** run `fallow:gate` on the shadow `coverage-final.json` → must exit 0. (Per-file %-parity vs c8 is **diagnostic-only** — print deltas, don't fail on them.)
6. Assert `numTotalTests` ≈ the current node:test count (sanity vitest collected the same tests).
7. Assert installed vitest version ≥3.2.0 (red-team M2).

## Related Code Files

- Create: `vitest.config.mjs`, `tools/scripts/codemod-node-test-to-vitest.mjs`, `tools/scripts/__tests__/codemod-node-test-to-vitest.test.js` (TDD unit test), `tools/scripts/wrap-gate-tests.mjs` (the 12-wrap transform) + its unit test.
- Modify: `package.json` — add `vitest` (≥3.2.0) + `@vitest/coverage-v8` to `devDependencies`; add `"test:vitest": "vitest run && node tools/scripts/sanitize-coverage.mjs"` (additive; **do not** touch `test` or the pre-commit hook).
- No production test file is modified in this phase.

## Implementation Steps

1. **[TEST-FIRST]** Write `codemod-node-test-to-vitest.test.js` fixtures: node:test import → vitest; node:assert import → unchanged; `before(fn,{timeout:N})` → `before(fn,N)`; `t.skip(REASON)` → `t.skip(true,REASON)`; no-node:test file → unchanged. Pins the transform.
2. Implement `codemod-node-test-to-vitest.mjs` to pass.
3. **[TEST-FIRST]** Write a unit test for `wrap-gate-tests.mjs`: a fixture script-style `.test.cjs` (`spawnSync`+`process.exit`) → wrapped in `test()` with `process.exit(1)`→`throw`, gate outcome identical. Pins the wrap.
4. Implement `wrap-gate-tests.mjs`.
5. Add `vitest` ≥3.2.0 + `@vitest/coverage-v8` to devDeps; `pnpm install`; assert version.
6. Write `vitest.config.mjs`.
7. Copy the tree to `/tmp/vitest-shadow/`; run codemod + wrap on the copy; `vitest run` on the copy (cwd=repo root).
8. **The gate:** run `fallow:gate` on the shadow `coverage-final.json` → must exit 0. Print c8-vs-vitest per-file %-deltas as diagnostics (not gating).
9. Verify the 12 wrapped gates pass/fail identically to their script versions (R13).
10. Capture the incompat report → `plans/260713-1625-vitest-migration-replace-node-test-c8/reports/phase-01-shadow-report.md`. This is the cutover checklist for Phase 2.
11. Commit config + codemod + wrap transforms + unit tests + report. `pnpm test` (c8) still green and unchanged.

## Success Criteria

- [ ] `vitest.config.mjs` exists with `testTimeout:120000` + `hookTimeout:120000`; `include` covers `tools/` + `.claude/coordination` + `.factory/hooks`.
- [ ] `pnpm test:vitest` runs (additive); `pnpm test` + pre-commit hook unchanged and green.
- [ ] Codemod + wrap unit tests pass.
- [ ] Shadow `vitest run` produces test-results JSON + Istanbul-shaped `coverage-final.json`.
- [ ] **`fallow:gate` exits 0 on the shadow coverage** (the real gate — H1). %-parity is diagnostic-only.
- [ ] 12 wrapped gates assert identically to script versions (R13 sign-off).
- [ ] Installed vitest ≥3.2.0 (M2).
- [ ] Shadow `numTotalTests` ≈ node:test count.
- [ ] `pnpm test` (c8) still green.

## Risk Assessment

- **R1 (missed binding):** shadow enumerates the full set; red-team verified it's complete.
- **R2 (coverage shape):** `fallow:gate` on shadow IS the gate. If it fails, resolve here (reporter/provider/version) — do not proceed to Phase 2 on assumption.
- **R13 (12-wrap semantics):** the per-file shadow comparison (Step 9) is the gate. A wrapped gate that diverges from its script version blocks Phase 2.
- **No mutation risk:** production tree untouched.