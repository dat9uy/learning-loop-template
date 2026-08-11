# Debug Report — PR #139 CI: stale context-savings snapshot

- **Date:** 2026-08-11
- **Branch:** `chore/meta-state-findings-resolution` (PR #139)
- **Run:** `31459486635` (workflow `test`, job `Run test suite`)
- **Status:** Diagnosed + fixed (snapshot refreshed); fix pushed as `a905fced`

## Executive Summary

The `test` workflow on PR #139 failed with exactly one failing test:
`tools/learning-loop-mastra/__tests__/cli-context-savings-script.test.js > measure:context default run prints required keys with sane ranges` — a Vitest snapshot mismatch.

This is **not a product bug**. The failing test is a *byte-count snapshot guard* that exists precisely to force a human review whenever a CLI tool-definition's wire size changes. The PR's own legitimate tool-definition changes (adding a machine-readable `recovery` array to `meta_state_resolve`, de-advertising `meta_state_supersede` as a closure option) changed the measured per-tool byte sizes, so the checked-in snapshot became stale. The fix is to regenerate the snapshot and commit the reviewed deltas.

## Evidence

### Failing test (CI log, run 31459486635)

```
FAIL ... cli-context-savings-script.test.js > measure:context default run prints required keys with sane ranges
Error: Snapshot `measure:context default run prints required keys with sane ranges 1` mismatched

  "dropped_def_bytes": 51713  ->  51871   (+158)
  "meta_state_supersede" bytes: 1189 -> 1115 (-74)
  "meta_state_resolve"  bytes: 788 -> 1020  (+232)   [re-sorted upward]
  "savings_bytes": 47809 -> 47967  (+158)

Test Files  1 failed | 326 passed
Tests  1 failed | 3413 passed | 4 skipped
```

Only this one test failed; the other three workflows on the PR (`meta-state refs check`, `Meta-state union-safety guard`, `Meta-state registry delta advisory`) all passed.

### Root cause correlation

The delta direction matches the PR's own commits (verified via `git diff origin/main...HEAD`):

| Commit | Change | `meta_state_resolve` handler size |
|---|---|---|
| `43d8e6ff` fix(loop): emit machine-readable recovery in structured rejections | Added `recovery` array to `meta_state_resolve` (+ `meta_state_touch` grounding) | 6187 → 6419 bytes (**+232**) |
| `db2af32e` fix(loop): stop advertising supersede as a closure option | Removed supersede-as-closure text from `meta_state_supersede` arg schema | 4496 → 4422 bytes (**−74**) |

Arithmetic check:
- `resolve` +232 equals the snapshot delta 788→1020 (**+232**) exactly.
- `supersede` file shrank −74; the arg-schema delta is −74 (the rest of the handler is prose/guidance, not the measured wire definition).
- `dropped_def_bytes` and `savings_bytes` both moved **+158** = 232 − 74. Consistent.

Local reproduction (deterministic — not a flake):
```
$ node tools/scripts/measure-cli-context.mjs
  dropped_def_bytes: 51871, savings_bytes: 47967
  meta_state_supersede: 1115,  meta_state_resolve: 1020
```
These exactly match the CI "received" values.

### Why the test exists

From the test's own header comment:

> Snapshot = the "review every byte change" guard: any per-tool byte delta flakes here and forces a human `vitest -u` review. The band test in `cli-context-savings.test.js` is the softer "don't flake on normal growth" guard. The two are deliberately complementary.

So the failure is the guard doing its job. The checked-in snapshot was generated before this PR's tool-definition changes and needed regeneration.

## Fix

1. Measured current values with `tools/scripts/measure-cli-context.mjs` — matched CI.
2. Regenerated the snapshot: `vitest run -u tools/learning-loop-mastra/__tests__/cli-context-savings-script.test.js` (via `--project e2e`).
3. Reviewed the diff — only the 7 expected value lines changed (`dropped_def_bytes`, `meta_state_supersede` bytes, `meta_state_resolve` bytes + sort position, `savings_bytes`). No unrelated churn.
4. Focused e2e re-run: **1 passed**.
5. Committed `test(loop): refresh context-savings snapshot for tool-definition deltas` (`a905fced`) and pushed. Pre-commit hook ran the full unit suite: **1315/1315 passed**.

## Non-findings (ruled out)

- **`Invalid tool arguments { tool: 'mastra_meta_state_log_change', errors: Invalid option: expected one of "migration"|... }`** in the CI log — this is a negative-path schema-validation test (`operation-envelope.test.js`) intentionally asserting rejection. It logs the error and the test **passes**. Not a failure.
- **`[sync-skills] FATAL: ... no maturity frontmatter` / `skills-lock.json malformed`** lines — expected stderr from negative-path skill tests; those tests pass.
- The other three PR workflows passing confirmed no registry/union-safety/refs regression.

## Recommendation

None required beyond the committed snapshot refresh. The snapshot guard is working as designed; do not weaken it.
