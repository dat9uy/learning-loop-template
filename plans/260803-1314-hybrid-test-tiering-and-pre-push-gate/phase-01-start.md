---
phase: 1
title: "Measure and characterize the suite"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Measure and characterize the suite

## Overview

Validate the premise before committing to tiering. A prior completed plan (`260622-1249-GH-2246-pnpm-test-fix-design-B`) measured `pnpm test` at **12.87s** via a parallel runner that was since **deleted** (2026-07-13 vitest migration); a cold pre-commit run here measured **~153s** steady-state on plain `vitest run`. Phase 1 measures cold/warm × coverage on/off to decide whether full tiering is needed or coverage-off-in-pre-commit alone suffices, and freezes the ~25 e2e file list mechanically. The Phase 2 scope is confirmed or narrowed from this data.

## Requirements

- Functional: produce a measurement table (cold/warm × coverage on/off) for `vitest run`.
- Functional: a deterministic, grep-derived list of e2e files (those importing `with-mcp-server.js` / calling `connectMcpServer` / `spawnSync`-ing `loop.mjs` or `server.js`).
- Non-functional: read-only phase — no production config or test files are modified.

## Architecture

Three cost axes to isolate:
1. **Coverage transform tax** — istanbul's `?vitest-uncovered-coverage` SSR transform (~18s observed). Toggle with `--coverage false` / `coverage.enabled: false`.
2. **Server/subprocess spawn tax** — the ~25 e2e files. Isolated by timing a unit-only POC (run those files excluded).
3. **Cold vs warm** — vite transform cache. First run cold; second run warm. Determines whether 153s is steady-state or cold-start.

The namespaced runner that parallelized the suite (`run-pnpm-test-namespaced.mjs`) was **deleted** in the 2026-07-13 vitest migration (confirmed by the validation verification pass); `pnpm test` is now plain serial `vitest run`. So the ~153s is steady-state, not a cold-start artifact of a missing parallelism layer — there is no runner to wire back in.

## Related Code Files

- Read: `vitest.config.mjs`, `package.json` (scripts), `.github/workflows/test.yml`, `docs/journals/2026-07-13-vitest-migration-closeout.md`, `tools/learning-loop-mastra/__tests__/with-mcp-server.js`
- Create: `plans/260803-1314-hybrid-test-tiering-and-pre-push-gate/reports/phase-01-measurements.md` (the measurement record)
- Modify: none
- Delete: none

## Implementation Steps

1. **Cold baseline (as-is):** `time pnpm test` once from a clean state — capture wall-clock, `transform`, `import`, `tests` lines from the vitest summary.
2. **Warm baseline:** `time pnpm test` again immediately — capture the same. Compare to cold.
3. **Coverage-off:** run `vitest run --coverage false` (or temporarily `coverage.enabled:false`) cold + warm — isolate the coverage transform tax.
4. **Unit-only POC (exclusion):** run `vitest run` excluding the e2e files (ad-hoc `--exclude` or a temporary project) — measure the floor. Expect seconds.
5. **Confirm no parallel runner exists:** verify `tools/scripts/run-pnpm-test-namespaced.mjs` is absent (deleted 2026-07-13 per vitest-migration closeout) and `pnpm test` = plain `vitest run`. No runner to resurrect; the 153s is the steady-state serial baseline.
6. **Classify e2e files mechanically:** `grep -rl "connectMcpServer\|with-mcp-server\|spawnSync.*loop.mjs\|spawn.*server.js" tools/learning-loop-mastra/__tests__ .claude/coordination/__tests__ .factory/hooks/__tests__` → record the list. Cross-check count against the ~25 estimate (verification found 19 connectMcpServer + 6 spawnSync = 25).
7. **Reconcile 12.87s vs 153s (resolved):** the 12.87s was the deleted parallel runner; today's plain `vitest run` is ~153s steady-state. Record this as confirmed, not open.
8. **Decide scope:** if warm+coverage-off is already fast (seconds), narrow Phase 2 to "coverage-off in pre-commit + keep the full suite" (cheaper than tiering). If e2e spawn dominates even warm+coverage-off, proceed with the full tiering (Phase 2 as written).

## Success Criteria

- [ ] Measurement table exists with cold/warm × coverage on/off numbers.
- [ ] e2e file list produced by grep, count recorded.
- [ ] 12.87s-vs-153s discrepancy explained.
- [ ] Scope decision recorded: proceed with tiering (Phase 2 as written) OR narrow to coverage-off-only.

## Risk Assessment

- **Risk:** the 153s was a one-off cold start and warm runs are already fast → tiering is over-engineering. **Mitigation:** Phase 1 gates Phase 2; if the data says narrow, narrow. (Verification already established 153s is steady-state for the serial runner, but cold-vs-warm and coverage-tax still gate the scope.)
- **Risk:** measuring with `--coverage false` hides the real pre-commit cost (the hook runs coverage-on for `fallow:gate`). **Mitigation:** measure both; the pre-commit decision uses coverage-off (fallow moves to pre-push), so coverage-off is the relevant number for the unit tier.