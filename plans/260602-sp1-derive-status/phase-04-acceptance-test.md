---
phase: 4
title: "Acceptance Test on Real Finding + First Real Use"
status: completed
priority: P2
effort: "0.5h"
dependencies: [1, 2, 3]
---

# Phase 4: Acceptance Test on Real Finding + First Real Use

## Overview

The capstone of SP1: the agent uses the new `meta_state_derive_status` tool to derive the status of a real finding in `meta-state.jsonl` and verifies the response matches the locked acceptance criterion. The acceptance-test entry is the finding `meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internalization-rule-to-agents` (or its truncated slug `meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz`), which has `evidence.code_ref: "tools/learning-loop-mcp/lib/source-ref-validator.js"` (nested form per the C-1 mitigation).

The acceptance test:
1. Loads the production `meta-state.jsonl` (or a copy in a temp dir)
2. Finds the acceptance-test entry by description substring (per the C-2 mitigation; the SP0 pattern in `sp0-change-log-self-log.test.js`)
3. Calls `metaStateDeriveStatusTool.handler({ id })` directly (the cook has direct access to the in-process tool)
4. Asserts the response matches the locked shape with `derived_status: "resolved-by-mechanism"`, `kind: "mechanism-shipped"`, `recommendation: "resolve"`, `drift: true` (note: `drift: true`, correcting the brainstorm example's typo of `drift: false`)

The acceptance test is the "first real use" of the tool — it answers the question "does the locked design work end-to-end on a real finding?"

## Requirements

- Functional:
  - The acceptance test exists and passes
  - The response shape matches the locked spec on a real finding
  - The drift detection works (the test asserts `drift: true` for the case where `raw_status: "active"` and `derived_status: "resolved-by-mechanism"`)
  - The fast path works on the change-log entry (the test also verifies the change-log fast path on the SP0 self-log entry)
- Non-functional:
  - 1 new smoke test passes (acceptance test for the finding)
  - 1 new smoke test passes (acceptance test for the change-log fast path)
  - 509 existing tests still pass
  - The acceptance test does not mutate production state (it reads `meta-state.jsonl` and runs the tool in a temp dir context)

## Architecture

### Acceptance test for the finding

The acceptance test reads the production `meta-state.jsonl` and runs the tool with a `codeContext.root` pointing to the project root (so the `existsSync` calls resolve correctly). The test uses `GATE_ROOT` env var to point to a temp copy of the registry (to avoid mutating production). The acceptance-test entry's `evidence.code_ref` is `tools/learning-loop-mcp/lib/source-ref-validator.js`; the file exists in the project root, so `code_ref_exists: true`.

The expected response:

```json
{
  "id": "meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz",
  "raw_status": "active",
  "derived_status": "resolved-by-mechanism",
  "derivation": {
    "kind": "mechanism-shipped",
    "signals": {
      "code_ref_exists": true,
      "code_ref_path": "tools/learning-loop-mcp/lib/source-ref-validator.js",
      "test_passed": null
    },
    "checked_at": "2026-06-02T...",
    "duration_ms": 0
  },
  "drift": true,
  "recommendation": "resolve"
}
```

(The `test_file_exists` and `test_file_path` fields are absent because the acceptance-test entry has no `evidence_test` field — per the H-4 mitigation, the function does not auto-derive a test file path.)

### Acceptance test for the change-log fast path

The acceptance test reads the production `meta-state.jsonl` and finds the SP0 self-log change-log entry (line 19, with `entry_kind: "change-log"`). It calls the tool with that entry's id and asserts the fast-path response.

The expected response:

```json
{
  "id": "meta-260602T1705Z-tools-learning-loop-mcp-tools-meta-state-log-change-tool-js",
  "raw_status": "active",
  "derived_status": "active-no-signal",
  "derivation": {
    "kind": "no-signals",
    "signals": {
      "test_passed": null
    },
    "checked_at": "2026-06-02T...",
    "duration_ms": 0
  },
  "drift": false,
  "recommendation": "no_action"
}
```

## Tests (write FIRST, then implement)

Create `__tests__/sp1-derive-status-acceptance.test.js` with 2 tests:

1. **`acceptance: meta_state_derive_status on the source-ref-validator finding returns resolved-by-mechanism + drift: true`** — find the entry by description substring, run the tool, assert the locked shape matches.
2. **`acceptance: meta_state_derive_status on the SP0 self-log change-log entry returns the fast-path response`** — find the change-log entry by `entry_kind: "change-log"`, run the tool, assert the fast-path response.

The test pattern mirrors `__tests__/sp0-change-log-self-log.test.js` (smoke test that reads `meta-state.jsonl` and asserts entry existence) and the existing `__tests__/g8-subcommand-class-entry.test.js` (read-only smoke test).

## TDD Workflow

1. **Write both smoke tests first.** Run `pnpm test -- __tests__/sp1-derive-status-acceptance.test.js`. Observe RED (file not found).
2. **Create the test file** with the 2 tests.
3. **Run tests.** Observe GREEN (2 passing).
4. **Verify regression-safety floor:** run `pnpm test` (full suite). All 509 + 2 = 511 tests pass.

## First Real Use (Operational, Cook-Driven)

After the test passes, the cook (or a future agent) can run the tool on the 4 stale `reported` findings (the `meta-260601T1353Z-*` family) to verify the resolver path. This is the operational first use, not a test:

```bash
# Via MCP tool (cook session has direct access)
meta_state_derive_status({ id: "meta-260601T1353Z-bash-gate-constraint-matcher-does-not-distinguish-heredoc-co" })
# Expected: derived_status: "resolved-by-mechanism" or "active-uncertain" depending on whether the file exists
```

The cook records the result in a journal entry (per the AGENTS.md `journal-writer` skill pattern).

## Related Code Files

- Create:
  - `tools/learning-loop-mcp/__tests__/sp1-derive-status-acceptance.test.js` (the 2 smoke tests)
- Modify: none
- Delete: none

## Implementation Steps

1. Create the test file `__tests__/sp1-derive-status-acceptance.test.js` with 2 stubbed tests.
2. Run `pnpm test -- __tests__/sp1-derive-status-acceptance.test.js` — confirm file not found / 2 tests error (RED).
3. Fill in the test bodies.
4. Run `pnpm test -- __tests__/sp1-derive-status-acceptance.test.js` — confirm 2 tests pass (GREEN).
5. Run `pnpm test` (full suite) — confirm 509 + 2 = 511 tests pass.
6. Run `pnpm validate:records` — confirm passes.
7. Run `pnpm validate:plan-loop` — confirm passes.

## Success Criteria

- [ ] 2 new smoke tests written and failing (RED)
- [ ] 2 new smoke tests pass after implementation (GREEN)
- [ ] 509 existing tests still pass
- [ ] The acceptance test asserts `derived_status: "resolved-by-mechanism"`, `kind: "mechanism-shipped"`, `recommendation: "resolve"`, `drift: true` (correcting the brainstorm example's typo)
- [ ] The change-log fast-path test asserts `kind: "no-signals"`, `derived_status: "active-no-signal"`, `drift: false`, `recommendation: "no_action"`
- [ ] `pnpm test` passes (full suite, ≥ 511 tests)
- [ ] `pnpm validate:records` passes
- [ ] `pnpm validate:plan-loop` passes

## Risk Assessment

- **Risk: the acceptance-test entry is mutated between plan creation and plan execution (e.g., `meta_state_resolve` is called on it, changing `status: "active"` to `"resolved"`).** Mitigation: the test is robust to `raw_status` changes; it asserts the `derived_status` and `kind` (which don't depend on `raw_status`). If the entry is resolved, the test would assert `drift: false` and `recommendation: "log_drift"` (per the H-1 mitigation) — the cook updates the test if needed.
- **Risk: the production `meta-state.jsonl` is moved or restructured.** Mitigation: the test reads from a fixed path (`meta-state.jsonl` at the project root). If the path changes, the test fails loudly and the cook updates it.
- **Risk: the source-ref-validator.js file is deleted or moved.** Mitigation: if the file is deleted, `code_ref_exists: false` and the test asserts `kind: "code-missing"` (a different but valid locked shape). The test should be updated to match the new reality, but the failure is informative.
- **Risk: the SP0 self-log change-log entry is compacted (e.g., a future change-log subtype with terminal status).** Mitigation: change-log entries are explicitly not compacted (per the SP0 compaction invariant in `core/meta-state.js:108-112`). The test relies on this invariant.
- **Risk: the test mutates `GATE_ROOT` env var and doesn't restore it.** Mitigation: the test uses `try { ... } finally { process.env.GATE_ROOT = originalEnv; }` (matches the SP0 test pattern in `meta-state-log-change.test.js`).
