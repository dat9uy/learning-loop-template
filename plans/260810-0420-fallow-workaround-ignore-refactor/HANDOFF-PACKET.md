# Goal packet (from ak:goal-warmup)

> Paste this into the next session as its opening instruction.
> State: **Ready** · Contract approved · Plan at `plans/260810-0420-fallow-workaround-ignore-refactor/README.md`

---

## Outcome contract (LOCKED)

- **Intended result:** Fallow-gate debt in `tools/learning-loop-mastra` reduced — every in-scope fallow workaround/ignore is refactored away (underlying issue fixed) or explicitly reclassified as a documented external-tool limitation / deliberate design. Fallow gate passes on refreshed baselines; full test suite green.
- **In scope:**
  1. Stale file-ignores: `core/meta-state.js:1` comment-format bug → 7 stale-suppressions to 0.
  2. Triage all 24 `unused-export` inline ignores + the 35 fallow-reported unused exports: delete truly dead / `ignoreExports` test-consumed / keep documented.
  3. Lift `scout/pipeline/**` directory ignore.
  4. Refactor genuinely-extractable `complexity` ignores.
  5. Re-verify + re-baseline (all 3 baselines).
- **Out of scope:** `blanking.js`↔`recurrence-tracker.js` code-dup mirrors (keep as designed); external-tool-limitation ignores (no vitest plugin → test-file ignores; subprocess-coverage blind spot → hook complexity ignores; keep + document); circular-dep ignores (assess, defer if not certain); dupes-baseline clone groups (separate); no fallow upgrade or CI-workflow change.
- **Acceptance signals:** `pnpm fallow:gate` clean (no new findings); `fallow:brief` shows no in-scope workaround findings except documented external limits; every removed ignore maps to a change; `pnpm test` green; baselines refreshed + committed; no inline ignore left unclassified.
- **Constraints:** no test/gate weakening; scoped to `tools/learning-loop-mastra` + baselines; behavior-preserving refactors; external-limitation ignores stay documented.
- **Allowed substitutions:** an in-scope ignore that can't be safely removed → reclassify (documented reason) + report.
- **Decision owner:** user

## Plan

- **Path:** `plans/260810-0420-fallow-workaround-ignore-refactor/README.md`
- **Phases:** P0 preflight → P1 stale file-ignores → P2 unused-export triage → P3 lift scout/pipeline ignore → P4 complexity extraction → P5 re-baseline + full verify
- **Contract traceability:** present (traceability table + risk register in plan)

## Preflight

- **Blocking:** none
- **P2 method (locked):** `fallow dead-code --trace <FILE:EXPORT>` for each reported export + repo-wide grep over `__tests__`/helpers for consumers fallow can't see (test files are ignored). Grep alone insufficient (`JSON.parse` false positives).
- **Deferred:** P4 borderline-complexity extractions (contract allows "kept + documented")

## Scope guard (MUST follow during long-run)

1. At each phase boundary, diff proposed deliverables vs locked contract.
2. Material mismatch → pause for user; do not finish under reduced scope.
3. Do not weaken, skip, or delete tests to satisfy the stop condition.
4. Pause for human decision instead of inventing product choices.

## Codex opener

```
/goal Complete the fallow workaround & ignore refactor per the locked contract.
Read first: plans/260810-0420-fallow-workaround-ignore-refactor/README.md.
Constraints: no test/gate weakening; scoped to tools/learning-loop-mastra + baselines;
behavior-preserving refactors; keep blanking↔tracker mirrors and external-limitation ignores
documented; P2 method = fallow --trace + test grep.
Validate after each checkpoint: pnpm test; fallow dead-code --stale-suppressions = 0;
pnpm fallow:gate clean.
Keep a brief progress log.
Stop when acceptance signals are met, or when further work needs human input.
Follow the scope guard above.
```

## Claude long-run opener

```
Complete the fallow workaround & ignore refactor per the locked contract.
Read first: plans/260810-0420-fallow-workaround-ignore-refactor/README.md.
Honor the LOCKED outcome contract above.
Validate: pnpm fallow:gate clean, pnpm test green, stale-suppressions = 0, baselines refreshed.
At each phase boundary apply the scope guard.
Stop when done or when a human decision is required.
Do not auto-expand scope.
```

---

## Key facts (verified at warmup — keep front-of-mind)

1. **The 7 stale-suppressions are a comment-format bug**, not a stale ignore:
   `// fallow-ignore-file complexity — registry CRUD with Zod, CAS, TTL` — fallow tokenizes every word after `complexity` (`—`, `registry`, `CRUD`, `Zod`, `CAS`, `TTL`) as a separate issue kind. Fix: bare `// fallow-ignore-file complexity`.
2. **`core/operation-envelope.js:1` is verified NOT stale** — keep it (still genuinely suppressing complexity).
3. **Fallow's 35 "unused exports" is a candidate list, not a deletion order** — it cannot see test consumers (test files in `ignorePatterns`). The `parse` grep hits were `JSON.parse` false positives. Use `--trace` + test grep before deleting anything.
4. **`scout/pipeline/**` lift is safe** — the 5 files are directly test-consumed (4 `scout-*.test.js`: `detectDangling`, `runScout`, `bucketClassifier`, `budgetEstimator`). Dry-run with the ignore removed first, then commit removal.
5. **Baselines live at `tools/learning-loop-mastra/baselines/fallow/` (git-tracked)**, outside fallow's auto-`.gitignore`d `.fallow/baselines/`. Use `--save-baseline` (never `--save-regression-baseline`).
6. **Fallow gate is `new-only`** — audits only changed files; full re-baseline is the only way to retire inherited findings.
7. **External-tool limitations to keep + document:** fallow 3.10.0 has no vitest plugin → `**/*.test.*`/`**/*.spec.*` must stay ignored (192 unused-file false positives otherwise; guarded by `r2/fallow-test-tree-clean.test.js` + `prune-coverage-parity.test.js`). Hooks run as spawned subprocesses → Istanbul blind spot → hook complexity ignores legitimately suppressed.
