# Report: Fallow Workaround & Ignore Refactor

**Date:** 2026-08-10
**Commit:** `1792acce` — `refactor(loop): resolve fallow workaround + ignore debt`
**Plan:** `plans/260810-0420-fallow-workaround-ignore-refactor/README.md`
**Status:** DONE — all acceptance signals met

## Outcome

Fallow-gate debt in `tools/learning-loop-mastra` reduced to zero in-scope
workarounds. Every in-scope fallow ignore is either refactored away (underlying
issue fixed) or explicitly classified (documented external-tool limitation or
deliberate design). `pnpm fallow:gate` clean; full test suite green.

## Phase results

### P1 — Stale file-ignores (7 → 0)
- `core/meta-state.js:1` was a comment-format bug: `// fallow-ignore-file
  complexity — registry CRUD with Zod, CAS, TTL` tokenized each word after
  `complexity` as a separate issue kind. Fixed to bare `// fallow-ignore-file
  complexity`.
- `core/operation-envelope.js:1` verified NOT stale — kept.
- Result: `fallow dead-code --stale-suppressions` = 0.

### P2 — Unused-export triage (35 reported + 24 inline)
Per locked method (`fallow dead-code --trace` + test grep for consumers fallow
can't see):
- **4 truly-dead deleted:** `_clearSessionIdCacheForTests`, `getMarkerPath`,
  `getLegacyMarkerPath` (worktree-session-id.js), `hashLoopVersion`
  (worktree-version.js).
- **5 internal-only de-exported:** `evaluateSkillsPreflight`,
  `evaluateSchemasPreflight`, `evaluateRuntimeStatePreflight`,
  `RUNTIME_STATE_WRITE_PATTERNS`, `writeToAllSurfacesSection`.
- **30 test-consumed → structured `ignoreExports`** entries in `.fallowrc.json`.
- **1 security-pinned kept:** `parse` (shell-parse.js) — `shell-quote-guard.test.js`
  pins it as the CVE-2026-9277 mitigation surface.
- All 24 inline `unused-export` ignores retired (19 → ignoreExports, 5 → de-export).
- Result: `fallow dead-code --unused-exports` = 0.

### P3 — Lift scout/pipeline/** dir-ignore
- Removed `scout/pipeline/**` from `ignorePatterns` after dry-run.
- The 5 files are test-consumed (4 `scout-*.test.js`); no unused-file/unused-export
  issues after de-exporting `stripComments` (a real unused export surfaced by the
  lift).
- Health findings (`bucket-classifier.js FS_WRITE_IN_LOGIC` regex data, coverage
  blind spot) captured in the re-saved health baseline.
- 16 inline complexity ignores cover the health findings, now documented.

### P4 — Complexity extraction (62 inline ignores)
- **1 genuine extraction:** `checkResolutionEvidence` Branch 1 → new helper
  `evaluateOrphanCandidate` (parent drops below complexity threshold).
- **59 documented with concrete reasons** — validation/guard chains, state
  machines, ordered decision tables, and inherited/test-covered code where
  extraction would degrade readability (plan's allowed "kept + documented" path).
- 2 file-wide ignores (`meta-state.js:1`, `operation-envelope.js:1`) documented
  via header comments (directive lines must stay bare per the P1 tokenization bug).
- Result: no inline complexity ignore left unclassified.

### P5 — Re-baseline + full verify
- All 3 baselines refreshed via `--save-baseline` (never
  `--save-regression-baseline`, per rule-tool-integration-same-commit-dep):
  `dead-code-baseline.json` (shrunk 52 lines — stale suppressions + dead exports
  retired), `health-baseline.json` (+scout findings), `dupes-baseline.json`.
- `pnpm fallow:gate` clean (exit 0, no issues in 37 changed files).
- `pnpm fallow:brief`: **dead code 0 · complexity 0 · duplication 0**.
- `pnpm test` green: 323 files passed, 3363 tests passed (4 skipped).

## Out-of-scope preserved (documented, not touched)
- `blanking.js` ↔ `recurrence-tracker.js` code-dup mirrors (2 ignores, deliberate).
- External-tool-limitation ignores: hooks CRAP blindspot (subprocess coverage),
  vitest-plugin absence (test files ignored).
- Circular-dep ignores: assessed, none new surfaced.
- Dupes-baseline clone groups: separate concern, untouched.
- No fallow upgrade or CI-workflow change.

## Scope guard
Diffed proposed deliverables vs locked contract at every phase boundary; no
material mismatch. No test/gate weakening. Behavior-preserving refactors only.

## Unresolved questions
None. All contract items and acceptance signals satisfied.
