---
phase: 4
title: "Acceptance Test on Real Workflow + First Real Use"
status: completed
priority: P2
effort: "0.5h"
dependencies: [1, 2, 3]
---

# Phase 4: Acceptance Test on Real Workflow + First Real Use

## Overview

The capstone of SP2: the agent uses the 2 new tools to demonstrate the end-to-end "legitimate code change" workflow on a real-world scenario. The acceptance tests cover:

1. **Hash mismatch drift detection:** create a temp finding with `mechanism_check: true` + `evidence_code_ref: <temp_file>`; first check records fingerprint; mutate `<temp_file>`; second check returns `status: "drifted"`, `drift_kind: "hash_mismatch"`, `hash_match: false`.
2. **Refresh workflow round-trip:** create a temp finding; check; mutate file; check (drifted); refresh; check again (`status: "grounded"`, `drift_kind: null`); lock in the full workflow.

The acceptance tests are the "first real use" of the tools — they answer the question "does the locked design work end-to-end?"

## Requirements

- Functional:
  - The acceptance tests exist and pass
  - The response shapes match the locked spec on real workflow scenarios
  - The hash mismatch detection works (the test asserts `status: "drifted"`, `drift_kind: "hash_mismatch"`, `hash_match: false` for the case where the file changes between calls)
  - The refresh round-trip works (the test asserts `status: "grounded"`, `drift_kind: null` after refresh + recheck)
- Non-functional:
  - 2 new smoke tests pass
  - 551 existing tests still pass
  - The acceptance tests do not mutate production state (they use temp files in a temp registry)

## Architecture

### Acceptance test 1: Hash mismatch drift detection

The acceptance test creates a temp registry and a temp file, then:

1. Creates a finding with `mechanism_check: true` + `evidence_code_ref: <temp_file>` via `metaStateReportTool`
2. Calls `metaStateCheckGroundingTool.handler({ id })` directly (the cook has direct access to the in-process tool)
3. Asserts the response is `status: "grounded"`, `fingerprint_was_recorded: true`, `grounding.code_fingerprint: <hash>`
4. Mutates `<temp_file>` (writes different bytes)
5. Calls `metaStateCheckGroundingTool.handler({ id })` again
6. Asserts the response is `status: "drifted"`, `drift_kind: "hash_mismatch"`, `hash_match: false`, `grounding.code_fingerprint: <old_hash>`, `grounding.code_ref_hash: <new_hash>`

### Acceptance test 2: Refresh workflow round-trip

The acceptance test continues from test 1's setup, then:

7. Calls `metaStateRefreshFingerprintTool.handler({ id })`
8. Asserts the response is `status: "refreshed"`, `code_fingerprint: <new_hash>`, `refreshed_at: <ISO timestamp>`
9. Calls `metaStateCheckGroundingTool.handler({ id })` again
10. Asserts the response is `status: "grounded"`, `drift_kind: null`, `hash_match: true`

The full workflow is locked in by the test.

## Tests (write FIRST, then implement)

Create `__tests__/sp2-check-grounding-acceptance.test.js` with 2 tests:

1. **`acceptance: meta_state_check_grounding detects hash mismatch after file mutation`** — find or create a finding with `mechanism_check: true` + `evidence_code_ref: <temp_file>`; check; mutate; check; assert `status: "drifted"`, `drift_kind: "hash_mismatch"`, `hash_match: false`.
2. **`acceptance: meta_state_refresh_fingerprint round-trips the drifted state back to grounded`** — from the drifted state in test 1; refresh; check; assert `status: "grounded"`, `drift_kind: null`, `hash_match: true`.

The test pattern mirrors `__tests__/sp0-change-log-self-log.test.js` (smoke test that exercises a real workflow) and `__tests__/sp1-derive-status-acceptance.test.js` (SP1's acceptance test pattern).

## TDD Workflow

1. **Write both smoke tests first.** Run `pnpm test -- __tests__/sp2-check-grounding-acceptance.test.js`. Observe RED (file not found).
2. **Create the test file** with the 2 tests.
3. **Run tests.** Observe GREEN (2 passing).
4. **Verify regression-safety floor:** run `pnpm test` (full suite). All 551 + 2 = 553 tests pass.

## First Real Use (Operational, Cook-Driven)

After the tests pass, the cook (or a future agent) can run the 2 new tools on a real finding in `meta-state.jsonl` to demonstrate the workflow. The 8 of 18 existing findings that use `evidence.code_ref` (legacy form) are good candidates — they have a `code_ref` but no `mechanism_check` flag, so the first call returns `status: "skipped"`. The agent can then:

1. Call `meta_state_report` (or `updateEntry`) to set `mechanism_check: true` on a finding with `evidence.code_ref`
2. Call `meta_state_check_grounding` to record the initial fingerprint
3. (Time passes; the file changes)
4. Call `meta_state_check_grounding` again to detect drift
5. Call `meta_state_refresh_fingerprint` to update the fingerprint
6. Call `meta_state_check_grounding` to confirm grounded

The cook records the result in a journal entry (per the AGENTS.md `journal-writer` skill pattern).

## Related Code Files

- Create:
  - `tools/learning-loop-mcp/__tests__/sp2-check-grounding-acceptance.test.js` (the 2 smoke tests)
- Modify: none
- Delete: none

## Implementation Steps

1. Create the test file `__tests__/sp2-check-grounding-acceptance.test.js` with 2 stubbed tests.
2. Run `pnpm test -- __tests__/sp2-check-grounding-acceptance.test.js` — confirm file not found / 2 tests error (RED).
3. Fill in the test bodies.
4. Run `pnpm test -- __tests__/sp2-check-grounding-acceptance.test.js` — confirm 2 tests pass (GREEN).
5. Run `pnpm test` (full suite) — confirm 551 + 2 = 553 tests pass.
6. Run `pnpm validate:records` — confirm passes.
7. Run `pnpm validate:plan-loop` — confirm passes.

## Success Criteria

- [ ] 2 new smoke tests written and failing (RED)
- [ ] 2 new smoke tests pass after implementation (GREEN)
- [ ] 551 existing tests still pass
- [ ] The hash mismatch test asserts `status: "drifted"`, `drift_kind: "hash_mismatch"`, `hash_match: false` after file mutation
- [ ] The refresh round-trip test asserts `status: "grounded"`, `drift_kind: null`, `hash_match: true` after refresh + recheck
- [ ] `pnpm test` passes (full suite, ≥ 553 tests)
- [ ] `pnpm validate:records` passes
- [ ] `pnpm validate:plan-loop` passes

## Risk Assessment

- **Risk: the temp registry is not properly isolated, leading to production state mutation.** Mitigation: the test uses `mkdtempSync` to create a temp directory; the registry is written to `<tempDir>/meta-state.jsonl`. The test uses `try { ... } finally { rmSync(tempDir, { recursive: true, force: true }) }` to ensure cleanup.
- **Risk: the test's `metaStateReportTool` call mutates the production registry.** Mitigation: the test mocks `resolveRoot()` to return the temp directory. The `metaStateReportTool` writes to `<tempDir>/meta-state.jsonl`, not the production registry.
- **Risk: the test's subprocess call (`pnpm test`) leaks into the production test runner.** Mitigation: the test does NOT use `run_tests: true`. The test exercises the file-existence + hash path only. The `run_tests: true` path is covered by the tool tests in Phase 2.
- **Risk: the temp file's SHA-256 changes due to filesystem-specific behavior (e.g., line ending conversion on Windows).** Mitigation: the test uses `writeFileSync(path, content)` with explicit byte content (no implicit conversion). The hash is computed on the raw bytes.
- **Risk: the test's mutation step (`writeFileSync` with different content) doesn't actually change the hash.** Mitigation: the test asserts `hash_match: false` after mutation; if the mutation didn't change the hash, the test would fail with a clear error message. The test is robust to mutation variations.
