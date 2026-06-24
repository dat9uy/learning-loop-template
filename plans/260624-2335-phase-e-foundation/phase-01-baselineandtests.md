---
phase: 1
title: "BaselineAndTests"
status: pending
priority: P2
dependencies: []
effort: "1h"
---

# Phase 1: Baseline and Tests (red baseline)

## Overview

Establish the pre-rename baseline so every later phase can verify against a known starting point. Write 4 regression-guard tests that fail BEFORE the rename and will pass AFTER the rename. This is the TDD "red" step — no production code changes yet; only test code and a baseline snapshot.

## Requirements

- Functional: capture a JSON snapshot of (a) all files containing the `core/legacy` substring (across all import styles: `from`, `require`, `await import`, `pathToFileURL(join(...))`), (b) all 7 fingerprints anchored to `core/legacy/*` paths, (c) the FCIS baseline (0 `@mastra/*` imports in `core/legacy/`).
- Non-functional: the baseline must be deterministic and reproducible; running the baseline script twice produces byte-identical output.

## Architecture

The baseline is a snapshot, not a test runner. Tests are static-analysis assertions that the codebase currently VIOLATES the post-rename invariants. The tests will turn green in Phases 2–5 as the rename + doc work completes.

**Test suite location:** `tools/learning-loop-mastra/__tests__/phase-e-foundation/` (new dir; mirrors the per-phase pattern used by `__tests__/legacy-mcp/`).

**Baseline manifest location:** `plans/260624-2335-phase-e-foundation/reports/pre-rename-baseline.json` (write-only from this phase; read-only from Phases 2–6).

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/phase-e-foundation/no-core-legacy-refs.test.js`
- Create: `tools/learning-loop-mastra/__tests__/phase-e-foundation/fcis-invariant.test.js`
- Create: `tools/learning-loop-mastra/__tests__/phase-e-foundation/schema-doc-exists.test.js`
- Create: `tools/learning-loop-mastra/__tests__/phase-e-foundation/agents-section-1-layers.test.js`
- Create: `tools/260624-2335-phase-e-foundation/scripts/capture-baseline.cjs` (the baseline snapshot script)
- Create: `plans/260624-2335-phase-e-foundation/reports/pre-rename-baseline.json` (the snapshot output)

## Implementation Steps

1. **Capture the baseline (deterministic).**
   - Write `plans/260624-2335-phase-e-foundation/scripts/capture-baseline.cjs` that:
     - `grep -rl 'core/legacy' tools/learning-loop-mastra/ AGENTS.md docs/ .claude/ .factory/ tools/scripts/ 2>/dev/null | grep -v plans/260624-2335-phase-e-foundation | grep -v docs/journals/260624- | sort` → returns the 123 files (use `wc -l` for the count).
     - `grep -r 'core/legacy' tools/learning-loop-mastra/ AGENTS.md docs/ .claude/ .factory/ tools/scripts/ 2>/dev/null | wc -l` → returns ~230+ raw substring matches across all import styles.
     - `grep -rE "from\s+['\"]@mastra" tools/learning-loop-mastra/core/legacy/ 2>/dev/null | wc -l` → returns 0 (FCIS baseline holds).
     - `meta_state_query_drift({ filter: { status: 'reported' } })` → returns drift entries anchored to `core/legacy` (1 confirmed: `meta-260624T1920Z-...`).
     - `meta_state_list({ id: <each of the 7 fingerprint-bearing findings> })` (use FULL slugs) → returns the current `code_fingerprint` and `evidence_code_ref` for each.
   - Write the output to `plans/260624-2335-phase-e-foundation/reports/pre-rename-baseline.json` (sorted keys, no timestamps, deterministic ordering).
   - Exit code 0 on success; the script is idempotent (running twice produces byte-identical output).

2. **Write Test #1: no `core/legacy` references in the source tree.**
   - File: `tools/learning-loop-mastra/__tests__/phase-e-foundation/no-core-legacy-refs.test.js`.
   - Assert: `grep -r "core/legacy" tools/learning-loop-mastra/ AGENTS.md .claude/ .factory/ --include='*.js' --include='*.cjs' --include='*.mjs' --include='*.md' 2>/dev/null | grep -v "plans/260624-2335-phase-e-foundation" | grep -v "docs/journals/260624-" | wc -l` returns 0.
   - **Before the rename:** returns ~123. **After Phase 2:** returns 0. The test passes only after Phase 2's implementation.
   - Allow the baseline manifest + plan files to contain `core/legacy` (they ARE the history); the `--exclude` arg + `grep -v` clause handles this.

3. **Write Test #2: FCIS invariant.**
   - File: `tools/learning-loop-mastra/__tests__/phase-e-foundation/fcis-invariant.test.js`.
   - Assert: every `*.js` under `tools/learning-loop-mastra/core/` (post-rename) has zero `import` / `require` of `@mastra/*`.
   - Implementation: walk the dir, parse each file with a simple regex for `from\s+['"]@mastra` and `require\(['"]@mastra`, collect violations, fail the test if any.
   - **Before the rename:** the dir is empty (only `legacy/` subdir exists, which is excluded by the path). Test passes vacuously. **After Phase 2 (rename done):** the dir contains 30+ files. **After Phase 3 (FCIS codified):** still passes (verified: 0 `@mastra/*` imports in `core/legacy/` today).
   - The test is forward-looking: it locks the invariant for future drift.

4. **Write Test #3: schema doc exists and is non-empty.**
   - File: `tools/learning-loop-mastra/__tests__/phase-e-foundation/schema-doc-exists.test.js`.
   - Assert: `tools/learning-loop-mastra/docs/schemas.md` exists; size > 500 bytes; contains the strings "finding", "change-log", "rule", "loop-design" (4 kinds) and "wire envelope" or "envelope-stripper" (wire format) and "schema-parity" or "parity" (parity contract).
   - **Before Phase 4:** the file does not exist → test fails (red). **After Phase 4:** test passes (green).

5. **Write Test #4: AGENTS.md §1 names the 3 layers.**
   - File: `tools/learning-loop-mastra/__tests__/phase-e-foundation/agents-section-1-layers.test.js`.
   - Assert: the first 100 lines of `AGENTS.md` (the §1 section) contains the strings "Core" (case-insensitive), "Mastra shell" (exact), "Runtime interface" (exact). The original §1 content (meta-surface, 4-kind union, product-surface reframe) must remain (asserted by substring match on key phrases like "meta-surface", "4-kind", "product surface").
   - **Before Phase 5:** the 3-layer strings are absent → test fails (red). **After Phase 5:** all 3 strings present, original content preserved.

6. **Verify the tests are red.**
   - Run `node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/*.test.js`.
   - Expected: Test #1 may pass or fail depending on baseline state (today there are 126 references; it fails); Tests #2–4 fail (their targets don't exist yet).
   - Document the red state in the baseline manifest: `phase_1_red_state: { test_1: 'fail', test_2: 'pass-vacuously', test_3: 'fail', test_4: 'fail' }`.

## Success Criteria

- [ ] `pre-rename-baseline.json` is captured and committed
- [ ] 4 regression-guard tests exist in `__tests__/phase-e-foundation/`
- [ ] At least 3 of the 4 tests fail before the rename (Test #2 may pass vacuously; the others must fail)
- [ ] Baseline manifest is reproducible: running `capture-baseline.cjs` twice produces byte-identical output
- [ ] No production code is changed in this phase (only test code + manifest)

## Risk Assessment

- **R1 (Test #1 false positive on historical references):** journals, old plan dirs, and the `core/legacy/` dir itself contain `core/legacy` strings. Mitigation: `grep -v plans/260624-2335-phase-e-foundation` and explicit `--include` for source files only; the test does NOT scan `__tests__/legacy-mcp/` (legacy tests are pinned, per the scope report § E.3).
- **R2 (Test #2 false positive on `core/README.md` mentioning @mastra):** the FCIS doc itself mentions `@mastra/*` (as a string, not an import). Mitigation: the test parses `import` / `require` syntax with regex, not substring search; a README that says "no `@mastra/*` imports" will not match the regex.
- **R3 (Baseline script nondeterminism):** if `find` returns different ordering across runs, the manifest will diff. Mitigation: `sort` every output; exclude timestamps from the manifest; use `git ls-files` instead of `find` (git output is sorted by the index).

## Test Output Reference (expected red state, 2026-06-24)

```text
$ node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/no-core-legacy-refs.test.js
# Subtest: no core/legacy references in source tree
# Expected: 0
# Actual: 126
# fail 1/1
not ok 1 - no core/legacy references in source tree
  ---
    error: '126 references found; expected 0 after rename'
  ...
```

```text
$ node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/schema-doc-exists.test.js
# Subtest: schema doc exists
# Expected: file exists
# Actual: ENOENT
not ok 1 - schema doc exists
```

(Two of the four expected to fail; Test #2 passes vacuously because `core/` is empty before the rename.)
