---
phase: 3
title: "Phase 2: Atomic cutover"
status: pending
priority: P1
dependencies: [2]
---

# Phase 3: Phase 2: Atomic cutover

## Overview

The single self-consistent commit (red-team C1). Applies the Phase-1 codemod + 12-wrap to the **real** tree AND swaps `pnpm test` to vitest in the same commit, so the pre-commit hook (now vitest) is never observed broken. Also deletes the namespaced runner + c8, retires the 4 fallow ignore lines, adds the `r2/fallow-test-tree-clean` guard, and rewrites the 3 auxiliary `node:test` scripts. Highest-risk phase; gated by Phase 1 (`fallow:gate` green on shadow + 12-wrap sign-off + r2 green). **No dual-run window** — the codemod makes `node --test` unable to run the files, so c8 and vitest cannot coexist on the real tree.

## Requirements

- Functional: `pnpm test` = vitest + sanitize; all 234 files run; the 4 fallow ignore lines gone; `r2/fallow-test-tree-clean` green; 3 aux scripts on vitest.
- Non-functional: pre-commit hook green on this single commit (no intermediate broken state). `fallow:gate` green.

## Architecture

**`pnpm test` becomes:**
```json
"test": "vitest run && node tools/scripts/sanitize-coverage.mjs"
```
(`sanitize-coverage.mjs` kept — clamps V8→Istanbul `-1` columns. cwd=repo root so its `../../coverage/coverage-final.json` path matches vitest's `coverage/coverage-final.json` output — red-team L2.)

**Aux scripts (red-team H2):**
```json
"test:debug": "vitest run tools/learning-loop-mastra/__tests__/debug/",
"test:cold-session": "vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs",
"check:freshness": "vitest run tools/learning-loop-mastra/__tests__/freshness/"
```
(Verify `check:freshness` dependents — CI/gates — before changing; Open Question 4.)

**`.fallowrc.json`** — delete the **4** ignore lines (red-team L1): `**/*.test.js`, `**/*.test.cjs`, `**/*.spec.js`, `**/*.spec.cjs`. The vitest plugin registers `*.test.*` as entries (empirically confirmed); fallow now analyzes the test layer.

**`r2/fallow-test-tree-clean.test.js` (TDD guard):** asserts `fallow list --entry-points` includes ≥1 `*.test.*` with `source:"vitest"` AND `fallow dead-code --unused-files` reports 0 on the test tree. Guards that the ignore stays retired.

## Related Code Files

- Modify (codemod): all 222 `tools/` test files (import swap + 6 hook-call-site fixes + storage-parity t.skip).
- Modify (wrap): 12 `.claude/coordination/__tests__/*.test.cjs` + `.factory/hooks/__tests__/*.test.cjs` → vitest `test()`.
- Modify: `package.json` (`test` + 3 aux scripts + devDeps: drop `c8`, vitest+coverage-v8 already added in Phase 1).
- Delete: `tools/scripts/run-pnpm-test-namespaced.mjs` (199 LoC).
- Keep: `tools/scripts/sanitize-coverage.mjs`.
- Modify: `tools/learning-loop-mastra/.fallowrc.json` (delete 4 ignore lines).
- Create: `tools/learning-loop-mastra/__tests__/r2/fallow-test-tree-clean.test.js`.

## Implementation Steps

1. Confirm Phase 1 gate: `fallow:gate` green on shadow + 12-wrap sign-off + r2 green on shadow. Do not start otherwise.
2. **[TEST-FIRST]** Write `r2/fallow-test-tree-clean.test.js` (the guard). Red state expected pre-cutover (tests currently ignored, not registered) — but since this lands IN the cutover commit, it should go green in-commit.
3. Verify `check:freshness` dependents (grep CI/workflow files for `check:freshness`).
4. **Apply codemod** to the real `tools/` tree: `node tools/scripts/codemod-node-test-to-vitest.mjs tools/learning-loop-mastra`. Spot-check 10 files: diff is import line + (for 6 files) the hook-call-site fix.
5. **Apply 12-wrap** to the real `.claude/coordination/__tests__/` + `.factory/hooks/__tests__/`: `node tools/scripts/wrap-gate-tests.mjs ...`. Per-file review that gate semantics are preserved.
6. Edit `package.json`: `test` → vitest+sanitize; 3 aux scripts → `vitest run <glob>`; remove `c8` devDep.
7. Delete `run-pnpm-test-namespaced.mjs`.
8. Edit `.fallowrc.json`: delete the 4 test/spec ignore lines.
9. **Local verify (pre-commit):** `vitest run` → full suite green (234 files); `coverage/coverage-final.json` Istanbul-shaped; `sanitize-coverage.mjs` clamps ≥0 columns; `fallow:gate` exit 0; `r2/fallow-test-tree-clean` green; `pnpm test` (now vitest) green.
10. **Single atomic commit** with all of the above. The pre-commit hook (`pnpm test && pnpm fallow:gate`) runs vitest on the codemod'd+wrapped tree → self-consistent → green.
11. Push. CI runs `pnpm test` (vitest) → green. (No intermediate broken commit exists — red-team C1 satisfied.)

## Success Criteria

- [ ] `pnpm test` = `vitest run && sanitize`; full 234-file suite green; exits 1 on failure.
- [ ] Codemod applied: 0 `from "node:test"` in tree; 192 `from "node:assert"` preserved; 6 hook sites `(fn,N)`; storage-parity `t.skip(true,REASON)`.
- [ ] 12 gate tests wrapped in vitest `test()`, semantics preserved; run under vitest; pass.
- [ ] `run-pnpm-test-namespaced.mjs` deleted; `c8` removed; `vitest>=3.2.0` + `@vitest/coverage-v8` present.
- [ ] 4 `.fallowrc.json` ignore lines deleted; `r2/fallow-test-tree-clean.test.js` green.
- [ ] `fallow:gate` exit 0 (coverage accepted, no `-1` rejection; tests are entries `source:"vitest"`).
- [ ] `test:debug`/`test:cold-session`/`check:freshness` = `vitest run <glob>`; dependents verified.
- [ ] Pre-commit hook green on the single cutover commit; no intermediate broken commit pushed.

## Risk Assessment

- **R6 (per-commit hook):** resolved by atomicity — the codemod and the script-swap land in one commit; the hook (now vitest) is self-consistent.
- **R10/R13 (12-wrap):** per-file review (Step 5) + Phase 1 shadow sign-off. A wrapped gate that diverges would fail `vitest run` in Step 9 → caught before commit.
- **R5 (r2):** re-verified in Step 9 (`vitest run` includes r2); formal Phase 3 re-audit sign-off follows.
- **R11 (aux scripts):** rewritten in-commit; `check:freshness` dependents checked first (Step 3).
- **Rollback:** the cutover is ONE commit — revert restores c8+namespaced runner+ignores atomically. No partial state.