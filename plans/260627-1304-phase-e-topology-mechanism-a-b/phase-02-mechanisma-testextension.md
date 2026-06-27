---
phase: 2
title: "MechanismA-TestExtension"
status: pending
priority: P2
dependencies: [1]
effort: "0.25d"
---

# Phase 2: Mechanism A — Test Extension (placement-manifest.test.js)

## Overview

Locks the manifest from Phase 1 with a test that fails whenever a file is added to or removed from `core/` without a corresponding manifest update, and whenever a file's declared role violates layering invariants (e.g., a `primitive` importing another `primitive` is allowed; an `evaluator` importing a `facade` is not). This is the machine-checkable half of Mechanism A — without this test, the manifest is documentation; with it, the manifest is an enforced invariant.

The test follows the `fcis-invariant.test.js` and `schema-doc-exists.test.js` pattern (model tests Phase 1 references in the brainstorm §3.4). It lives in the same `__tests__/phase-e-foundation/` directory.

**TDD ordering:** write the test BEFORE this phase ships, watch it fail in a controlled way (e.g., remove a manifest row), then ship. This is the "red → green" gate for the whole Mechanism A.

## Requirements

- **Functional:** `placement-manifest.test.js` runs in `node --test` (or via `pnpm test` which uses `run-pnpm-test-namespaced.mjs` — verify the namespaced runner picks up the new test file from `__tests__/phase-e-foundation/`) and reports:
  1. Files in `core/` missing from the manifest (count must be 27 production files)
  2. Manifest entries pointing at non-existent files
  3. Manifest entries with paths that fail the `^[\w./-]+\.m?js$` regex (rejects `..`, absolute paths, glob patterns)
  4. Role-layering violations (an `evaluator` importing a `facade`, a `primitive` importing a `facade`, etc.)
- **Non-functional:** the test runs in <2 seconds (manifest is small; import graph scan is local-only).
- **Non-functional:** on violation, the error message includes the file path and a one-line fix recipe ("add to core/placement.yaml with role: <suggested>").

## Architecture

The test has 3 sub-tests:

1. **`manifest enumerates every core file`** — bidirectional: every file is in the manifest; every manifest row is a file. Use the same `find` filter as Phase 1 step 1 (excluding `__tests__/`, `lib/`, `*.test.js`). Expected manifest row count: **27**. Failure messages are explicit: `"<file> missing from core/placement.yaml; add a row with role: <primitive|evaluator|...>"`.

2. **`manifest uses only closed role values`** — assert every row's `role` is one of the 7 taxonomy values. The taxonomy list is duplicated in the test (small, easy to maintain) so the test catches "ad-hoc role invented in a manifest row" without needing the doc.

3. **`role-layering invariants hold`** — scan each `evaluator` and `facade` file's imports; check that:
   - `primitive` may only import `primitive` files + stdlib + `zod`/`yaml`/etc. (pure-npm packages from the FCIS doc).
   - `evaluator` may only import `primitive` files + stdlib + pure-npm packages (NOT `facade`, NOT other `evaluator` files; composing evaluators would couple them).
   - `verification` may import `primitive` + `facade` (it reads state).
   - `facade` may import anything.
   - `validator` may import `primitive` only.
   - `cache` wraps one sibling (assert the file imports exactly one non-stdlib local module).
   - `helper` is unrestricted (mixed).

The layering test mirrors the FCIS test's regex-based import scanning pattern. If a layered file imports an out-of-role local module, the test fails with: `"<file> (role=<role>) imports <out-of-role-file> (role=<other-role>); layering invariant violated. <one-line fix recipe>"`.

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/phase-e-foundation/placement-manifest.test.js`

No other files modified.

## Implementation Steps

1. **Write the test BEFORE running it** (TDD red phase).
   - Open `placement-manifest.test.js`.
   - Stub the 3 sub-tests with the assertions above.
   - Run: `node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/placement-manifest.test.js`
   - Expected: 3 passing (the manifest is correct from Phase 1; we just want to confirm the test can run).

2. **Red phase: temporarily break the manifest to confirm the test catches it.**
   - Pick a test scenario: remove one manifest row (e.g., delete the `slugify.js` row).
   - Run the test. Expected: sub-test 1 fails with `"slugify.js missing from core/placement.yaml"`.
   - Restore the row. Run again. Expected: green.
   - Repeat for sub-test 2 (set a row's role to `"utility"`): expected to fail with `"role 'utility' is not in the closed taxonomy"`.
   - Repeat for sub-test 3 (add a fake `evaluator` file that imports a `facade`): expected to fail with the layering-violation message.
   - All three confirmed → green phase begins.

3. **Add a 4th sub-test: role taxonomy matches `docs/placement.md`.**
   - Parse `placement.md` for the role list (e.g., extract bullet points under §2).
   - Parse the test's hard-coded role list.
   - Assert: the lists are equal.
   - Failure: `"docs/placement.md role taxonomy (X) disagrees with test (Y); reconcile."`

4. **Add a 5th sub-test: `"adding a new core file fails the test"`** — the operator narrative.
   - Programmatically: write a temp file in `os.tmpdir()` (NOT in `core/` — that triggers the pre-commit hook's recursive `pnpm test` invocation; see red-team Finding F6). Use `path.join(os.tmpdir(), 'placement-fixture-' + crypto.randomUUID() + '.js')`, write a minimal stub, pass the temp path into a manifest enumeration function that accepts an override, assert the temp path shows up as missing from the canonical manifest, then `unlinkSync` in `try/finally`.
   - This is the "manifest survives an add" test from the brainstorm §3.4 acceptance list.

5. **Run the full test suite to confirm no regression.**
   - `pnpm test` (or whatever the project standard is — verify in `package.json`).
   - Expected: all baseline tests pass + 5 new tests pass.

6. **Commit.**
   - One commit: `test(phase-e): add placement-manifest.test.js (Mechanism A enforcement)`
   - Body: `Locks the core/placement.yaml manifest as an enforced invariant. 5 new sub-tests. No code change. All tests green.`

## Success Criteria

- [ ] `placement-manifest.test.js` exists with ≥5 sub-tests (enumeration, role values, path-validation, layering, taxonomy agreement, temp-file add)
- [ ] Test runs in `node --test` (or via `pnpm test` if namespaced runner discovers it) and completes in <2 seconds
- [ ] Removing a manifest row → test fails with a fix recipe message
- [ ] Setting a manifest row's role to an invalid value → test fails
- [ ] Setting a manifest row's path to `../etc/passwd` or `/root/.ssh/id_rsa` → test fails
- [ ] An `evaluator` file importing a `facade` file → layering test fails
- [ ] All existing tests still pass (baseline measured at Phase-0)
- [ ] The 4 existing `__tests__/phase-e-foundation/` tests still pass (FCIS, sibling-imports, schema-doc, agents-section-1) — placement-manifest is the 5th

## Risk Assessment

- **R1 (import-regex false positives in layering test):** same risk as the FCIS test — a comment containing `from './meta-state.js'` would match the regex. Mitigation: the FCIS test has been live for weeks with zero false positives; the same regex pattern is fine here. If false positives appear, upgrade to acorn (out of scope).
- **R2 (test is too strict on `cache` role):** `cache` wraps one sibling, but "wraps" is fuzzy. Mitigation: keep the assertion soft — assert that exactly one non-stdlib local module is imported, but don't assert the *direction* of the wrap (the file's own summary already explains the direction).
- **R3 (the 5th sub-test leaves a temp file behind on failure):** the temp-file test uses try/finally + `unlinkSync`; if the test crashes between write and unlink, the temp file persists. Mitigation: name the temp file with a clear prefix (`__test-fixture-*.js`) and document manual cleanup in the test body. CI runs in a clean checkout, so a leaked file in a dev run is local-only.
- **R4 (layering test breaks existing files):** the layering invariants from §3.2 of the brainstorm are aspirational; some existing files may violate them (e.g., a `facade` that imports an `evaluator` — should be flipped, but isn't urgent). Mitigation: in Phase 1, the manifest roles are assigned to match *current* file behavior. If a file violates the invariant, fix the role assignment (not the file) in the manifest. File-role mismatch is fixed in a follow-up PR.