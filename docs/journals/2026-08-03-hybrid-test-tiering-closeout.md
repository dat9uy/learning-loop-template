# 2026-08-03 — Hybrid test tiering and pre-push gate closeout

## What shipped

Plan `plans/260803-1314-hybrid-test-tiering-and-pre-push-gate/` shipped in two commits on `fix/write-gate-lineage-scan`:

- `af0ac94c` — initial split (vitest projects + hook rewire + guard test + R13 update)
- `0a83f67d` — code-review fixes (extended e2e marker set, R13 exact-match, trailing newlines, AGENTS.md gate table, plan Deviations block)

Branch: `fix/write-gate-lineage-scan` (alongside the prior CLI round-trip fixes).

## Why

`pre-commit: pnpm test && pnpm fallow:gate` ran the full vitest suite on every commit. Measured cold: 153.55s vitest duration / 2:35 wall. 281 unit test files + 19 e2e files (~25 with some markers counted twice). A 2.5-min gate per commit incentivizes `--no-verify`, which defeats the gate entirely. The plan adopts the hybrid architecture: pre-commit runs the fast unit tier, pre-push runs the full gate, CI remains the authoritative backstop.

## How

### Tier boundary (Strategy A from the plan)

`vitest.config.mjs` now defines `projects[]`:
- `unit` — original include globs MINUS e2e files, coverage off (reclaims ~19s istanbul transform tax)
- `e2e` — explicit 23-file list, coverage on (fallow consumes unfiltered coverage)

Classification markers: `connectMcpServer|with-mcp-server|StdioClientTransport|@modelcontextprotocol/sdk/client`. The first two catch the shared `with-mcp-server.js` helper users; the latter two catch the SDK-direct spawn pattern (4 files that bypass the helper — code-reviewer caught this in round 2).

A guard test (`test-tier-e2e-membership.test.js`) greps the same markers and asserts the e2e project's `include` equals the derived set. Drift → loud failure, not silent misclassification.

### Hook rewire

`simple-git-hooks`:
- `pre-commit`: `pnpm test:unit` (was: full `pnpm test && pnpm fallow:gate`)
- `pre-push`: `pnpm test && pnpm fallow:gate` (new)
- `commit-msg`: unchanged (R13 stable-artifacts hook)

CI `test.yml` is untouched — it still runs `pnpm test` + the fallow SARIF action on PRs and `push: main`. CI is the authority; local pre-push is a defense-in-depth backstop.

### R13 update (regression guard)

The pre-existing `r2/precommit-hook.test.js` locked the OLD invariant: "pre-commit must run `pnpm test && pnpm fallow:gate`". Updated to lock the NEW hybrid invariants (pre-commit exact match = `pnpm test:unit`, pre-push exact match = `pnpm test && pnpm fallow:gate`, scripts `test:unit`/`test:e2e` present). 7 tests in the updated R13 (was 6).

## Measured

| Run | Vitest | Wall | Tests |
|---|---|---|---|
| Original baseline (monolithic pre-commit) | 153.55s | 2:35.04 | 2832 |
| Phase 4 v1 `pnpm test:unit` (initial split) | 87.31s | 1:28.55 | 2727 |
| Phase 4 v2 `pnpm test:unit` (post-review fix, 4 misclassified files moved) | 81.57s | 1:22.58 | 2711 |
| Phase 4 v2 `pnpm test` (full, both projects) | 133.14s | 2:14.52 | 2835 |

Per-commit cost drops from 2:35 to 1:23 (~46% faster). Pre-push full gate is also 13% faster (less istanbul work because the unit project's tests skip coverage).

## Vitest 4 quirks encountered (and worked around)

Three non-obvious behaviors of vitest 4's `projects[]` config:

1. **`globals`, `testTimeout`, `hookTimeout`, `exclude` do not inherit from the root config.** Must be set per project. The vitest 4 type definitions put these in `NonProjectOptions`. Documented inline in `vitest.config.mjs`.

2. **Per-project `coverage.enabled: false` does not actually disable coverage when the root has `enabled: true`.** `coverage-final.json` gets generated either way. Workaround: configure coverage only on the e2e project (no root-level coverage block). Minor regression for unit-only changes — their files won't appear in `coverage-final.json`, so fallow's CRAP for those files inflates to `comp×(comp+1)`. Plan accepts this; unit files have low CRAP, inflation is bounded.

3. **The `exclude` pattern for `tools/learning-loop-mastra/scout/pipeline/test-fixtures/**` must be repeated per project** (same root non-inheritance rule). Without it, the test fixtures leak into the unit project.

## Pre-existing toolchain issue surfaced (not caused by this plan)

`pnpm fallow:gate` and `pnpm fallow:brief` fail with:
> `Error: coverage: failed to parse coverage data from coverage/coverage-final.json: invalid value: integer -50, expected u32`

11 negative branch hit counters across 7 source files (`with-mcp-server.js`, `core/meta-state.js`, `core/stale-view.js`, `core/canonical-compare.js`, `mastra/handler-adapter.js`, `mastra/schema-parity.js`, `lib/gate-logging.js`). The `@vitest/coverage-istanbul@4.1.10` instrumentation emits `-50` for certain branch shapes; fallow:3.10.0 strictly rejects u32 violations.

This is a pre-existing toolchain interaction (the same files were instrumented before this plan). The pre-push hook will hit this failure until a follow-up investigation sanitizes coverage-final.json before fallow parses it, or upgrades fallow to be more tolerant. CI's fallow action runs in SARIF mode (no `--coverage` flag) and is unaffected — so the CI gate is still functional.

## Deviations from plan

The plan's Phase 3 success criterion "pre-commit drops to seconds" was not met in absolute terms. Measured 82–87s vitest / 1:22–1:28 wall. Vitest 4's import phase alone is ~45s for 277–281 unit test files; that floor is independent of tiering. The 46% relative improvement is the actual win. Documented in `plan.md` Deviations block + `reports/phase-04-verification.md`.

## What I learned

- **vitest 4 projects config is opinionated about what inherits.** When in doubt, set per project; the verbose comments in `vitest.config.mjs` document this for the next operator.
- **A grep-based classification marker set needs to be derived from the actual spawn primitives, not just the project's preferred helper.** The shared `with-mcp-server.js` helper is the easy-to-find pattern; the SDK-direct `StdioClientTransport` import is the easy-to-miss one. The guard test catches both now, but only after the code-reviewer pointed out the gap.
- **Coverage configuration in vitest 4 is root-level by default; making it project-only works but is undocumented.** Future vitest 4.x bumps may regress; worth a follow-up comment in `vitest.config.mjs` (already there).
- **The plan's success criterion said "seconds"; the import-phase floor makes that unrealistic.** I should have measured the import phase during Phase 1 and updated the criterion then. The Phase 4 verification report is honest about the 46% relative win instead of the absolute "seconds" target.