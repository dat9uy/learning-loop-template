# Plan: Fallow Workaround & Ignore Refactor

**Status:** Ready for handoff (goal-warmup)
**Date:** 2026-08-10
**Branch:** main (handoff runs on a feature branch)

## Contract (locked — immutable)

See warmup session. Summary:

- **Intended result:** Fallow-gate debt in `tools/learning-loop-mastra` reduced. Every in-scope fallow workaround/ignore is either refactored away (underlying issue fixed) or explicitly reclassified as documented external-tool limitation / deliberate design. Fallow gate passes on refreshed baselines; full test suite green.
- **In scope:** (1) stale file-ignores, (2) triage all 24 `unused-export` inline ignores + the 35 fallow-reported unused exports, (3) lift `scout/pipeline/**` dir-ignore, (4) refactor genuinely-extractable `complexity` ignores, (5) re-verify + re-baseline.
- **Out of scope:** blanking↔tracker code-dup mirrors (keep), external-tool-limitation ignores (keep+document), circular-dep ignores (assess, defer if not certain), dupes-baseline clone groups (separate), no fallow upgrade/CI-workflow change.
- **Acceptance:** `pnpm fallow:gate` passes no new findings; every removed ignore maps to a change; `pnpm test` green; baselines refreshed; no inline ignore left unclassified.
- **Constraints:** no test/gate weakening; scoped to `tools/learning-loop-mastra`; behavior-preserving refactors.
- **Allowed substitution:** an in-scope ignore that can't be safely removed → reclassify (documented) + report.
- **Decision owner:** user

## Key facts (verified at warmup)

1. **7 stale suppressions** on `core/meta-state.js:1` are a **comment-format bug**, not a stale ignore:
   `// fallow-ignore-file complexity — registry CRUD with Zod, CAS, TTL`
   fallow tokenizes every word after `complexity` (`—`, `registry`, `CRUD`, `Zod`, `CAS`, `TTL`) as a separate "issue kind" and flags each as unrecognized/stale. Confirmed via `fallow dead-code --stale-suppressions`.
   → Fix: write `// fallow-ignore-file complexity` bare (or with a valid second kind), drop the em-dash prose.
2. **35 unused exports** reported by `fallow dead-code --unused-exports`. **But fallow cannot see test consumers** because `**/*.test.*` is in `ignorePatterns` (external limitation, R13). Grep for direct imports found only `JSON.parse` false positives, so the true dead/test-consumed split is UNKNOWN until an AST-aware semantic consumer check runs.
3. **`scout/pipeline/**` dir-ignore** (5 files, 16 inline complexity ignores) — files are directly test-consumed (`detectDangling`, `runScout`, `bucketClassifier`, `budgetEstimator` in `__tests__/legacy-mcp/scout-*.test.js`). Lifting the dir-ignore is safe if the 5 files pass coverage-aware fallow analysis.
4. **External-tool limitations (keep + document):** fallow 3.10.0 has no vitest plugin → `**/*.test.*` must stay ignored (192 unused-file false positives otherwise; guarded by `r2/fallow-test-tree-clean.test.js` + `prune-coverage-parity.test.js`). Hooks run as spawned subprocesses → Istanbul blind spot → hook complexity ignores are legitimately suppressed.
5. **Deliberate design (keep):** `blanking.js` ↔ `recurrence-tracker.js` code-duplication mirrors (2 ignores, documented).
6. **Fallow gate is `new-only`** — audits only changed files. Full re-baseline is the only way to retire inherited findings.

## Traceability

| Phase | Contract items | Acceptance signals | Facts / assumptions / prereqs |
| --- | --- | --- | --- |
| P0 Preflight | All | Baselines + toolchain ready | Prereq: coverage-final.json exists, fallow 3.10.0, node_modules resolvable |
| P1 Stale file-ignores | In#1 | `fallow dead-code --stale-suppressions` = 0 | Fact: 7 stale = comment-format bug on meta-state.js:1; operation-envelope.js:1 unverified |
| P2 Unused-export triage | In#2 | Each of 35 exports classified delete/ignoreExports/keep; inline ignores reduced | Assumption: AST consumer check distinguishes dead vs test-consumed. Fact: test files invisible to fallow |
| P3 Lift scout/pipeline ignore | In#3 | 5 files pass coverage-aware fallow; dir-ignore removed; tests green | Fact: functions test-consumed; prereq: P0 coverage accurate |
| P4 Complexity extraction | In#4 | Every genuinely-extractable ignore refactored; behavior preserved; tests green | Assumption: per-function extraction safety verified individually |
| P5 Re-baseline + full verify | In#5 | `pnpm fallow:gate` clean; `pnpm test` green; baselines refreshed | Prereq: P1–P4 landed; user decision: none |

## Phases

### P0 — Preflight
- Confirm `coverage/coverage-final.json` present and fresh (regen via `pnpm test` if stale).
- Confirm `fallow` resolvable from package root with `node_modules` visible (earlier runs hit the "node_modules not found" WARN from wrong CWD).
- Snapshot current baselines (git) for rollback.
- Gate-verb allowances refreshed (session-local) for bash/node/python.

### P1 — Stale file-ignores
- **`core/meta-state.js:1`:** change `// fallow-ignore-file complexity — registry CRUD with Zod, CAS, TTL` → bare `// fallow-ignore-file complexity`. Re-run `fallow dead-code --stale-suppressions` → expect 0. Keep the file ignore (meta-state.js is 2606 lines, genuinely high-complexity CRUD) unless audit shows complexity actually clean.
- **`core/operation-envelope.js:1`:** **verified NOT stale** (`fallow dead-code --stale-suppressions` lists only meta-state.js:1). Keep + document — it is genuinely suppressing complexity.
- **Result:** 7 stale-suppressions → 0 (all on meta-state.js:1, comment-format bug). Highest-certainty win.

### P2 — Unused-export triage (35 exports + 24 inline ignores)
- **Method (locked at warmup):** for each of the 35 fallow-reported exports, run `fallow dead-code --trace <FILE:EXPORT>` to see what fallow's graph says, then a repo-wide grep over `__tests__`, test helpers, and `tools/handlers` for named/namespace/dynamic-import consumers fallow can't see (test files are in ignorePatterns). Grep alone is insufficient (false positives like `JSON.parse`) — the fallow `--trace` output is the authoritative "what fallow thinks" half, the test-grep is the "what tests consume" half.
- Classify each export:
  - **Truly dead** (no consumer anywhere) → delete export + any `unused-export` inline ignore.
  - **Test-consumed** (consumed in `__tests__`/test helpers) → either add a structured `ignoreExports` entry **or** keep the inline ignore with a documented reason. Prefer `ignoreExports` when it's a stable public/test API; prefer inline comment when the reason is narrow.
  - **Consumed only via ignoreExports already listed** → no change; verify listed exports are still real.
- Remove every `unused-export` inline ignore that resolves to delete/ignoreExports.
- **Key risk:** fallow reports 35 but the true dead count may be far lower (test-blindness). Do NOT delete anything grep suggests without the AST check. Treat "fallow says unused" as a *candidate list*, not a deletion order.
- Re-run `fallow dead-code --unused-exports` → count should drop; each remaining unused export must have a written classification.

### P3 — Lift `scout/pipeline/**` dir-ignore
- Run coverage-aware `fallow dead-code` + `fallow health` + `fallow dupes` with `scout/pipeline/**` **temporarily removed** from `ignorePatterns` to see real findings.
- Expect: the 16 inline complexity ignores cover the health findings; the 5 files are test-consumed so no unused-file/unused-export issues. If any new finding appears (e.g. circular-dep, dupes), classify: extract/ignoreExports/document.
- Remove `scout/pipeline/**` from `ignorePatterns` permanently once clean.
- Verify `scout-*.test.js` + `prune-coverage-parity.test.js` still pass.

### P4 — Complexity extraction (62 inline ignores)
- For each `fallow-ignore-next-line complexity` (62 total; 16 in scout/pipeline already handled in P3, so ~46 elsewhere), inspect the annotated function:
  - **Genuinely extractable** → extract helper(s), remove the ignore, add/adjust tests. Re-run `fallow health` scoped to confirm the function drops below threshold.
  - **Inherently complex** (validation chains, guard sequences with explicit reasons) → keep the ignore, ensure the comment carries a concrete reason (many already do, e.g. operation-envelope.js "3 fail-closed guards").
- **Risk:** 62 is a lot. Order by certainty: clear-cut extractions first (small pure functions), leave borderline/validation-heavy documented. Do not force extraction that degrades readability — the "kept + documented" path is the allowed substitution.
- Verify: focused tests per refactored module + `pnpm test`.

### P5 — Re-baseline + full verify
- Re-save all 3 baselines: `fallow dead-code --save-baseline`, `fallow health --save-baseline`, `fallow dupes --save-baseline` → `baselines/fallow/`.
- Verify the dead-code baseline no longer lists stale-suppressions for removed ignores.
- Run `pnpm fallow:gate` (new-only) → clean. Run `pnpm test` → green.
- Ensure `rule-tool-integration-same-commit-dep` is honored (baseline flag format: `--save-baseline`, never `--save-regression-baseline`).
- Commit baselines + code together; verify `git ls-files baselines/fallow/` includes them (fallow auto-`.gitignore`s `.fallow/baselines/`, not our committed `baselines/fallow/`).

## Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Deleting a test-consumed export (fallow test-blindness) | Med | High (broken tests) | P2 AST-aware consumer check before any delete; full test run |
| P4 force-extraction degrades readability | Med | Med | "Kept + documented" allowed substitution; per-function judgment |
| Lifting scout/pipeline ignore surfaces new findings | Low-Med | Med | P3 dry-run with ignore removed before committing removal |
| Baseline flag format error (regression vs save) | Low | High (unparseable baseline) | Use `--save-baseline` per rule; verify parse after save |
| Coverage drift makes CRAP scores move | Med | Low | Regenerate coverage in P0/P5; baseline refresh |

## Handoff

Ready packet: see warmup session output. Dual openers:
- Codex: `/goal <packet>`
- Claude: paste packet as long-run session instruction.

Scope guard: at each phase boundary, compare proposed work to the locked contract; on material mismatch, pause for user. Do not finish under reduced scope; do not weaken tests to satisfy stop conditions.
