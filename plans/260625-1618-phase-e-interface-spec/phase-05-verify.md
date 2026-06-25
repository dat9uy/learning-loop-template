---
phase: 5
title: "Verify"
status: completed
priority: P2
dependencies: [1, 2, 3, 4]
effort: "30min"
---

# Phase 5: Verify (full test suite + meta-state log + journal)

## Overview

Final verification phase. Run the full test suite (`pnpm test`) to confirm no regression; run the validator against the 3 known runtimes to confirm pass/fail behavior; file `meta_state_log_change` to record the change in the meta-state registry; write a journal entry summarizing the plan's ship; verify the 3-layer architecture tree shows the new `interface/` directory.

**Source:** Scope report §"Verification" (lines 397-410); Plan 1's Phase 6 (fingerprint repoint + verify) as a parallel pattern.

## Requirements

- **Functional:** `pnpm test` passes (all existing tests preserved + 29 new tests); `node contract.js claude-code` returns `{ok: true}`; `node contract.js droid` returns `{ok: true}`; `node contract.js mastra-code` returns `{ok: false}`; `meta_state_log_change` is filed with the interface-spec change; journal entry summarizes the plan.
- **Non-functional:** the plan's PR description includes the verification commands; the plan's status flips from `pending` to `done` after merge; the master tracker updates.

## Architecture

Phase 5 is **read-only** — no production code changes. The phase exercises the new `interface/` directory end-to-end and records the change in the meta-state registry. The pattern matches Plan 1's Phase 6 (fingerprint repoint + verify) which used `meta_state_batch` to repoint 7 findings in 1 atomic call.

**Verification steps (in order):**
1. Run the full test suite (`pnpm test`)
2. Run the validator against all 3 known runtimes (smoke test)
3. Verify the 3-layer architecture tree (`ls tools/learning-loop-mastra/`)
4. File `meta_state_log_change` (audit log entry)
5. Update the master tracker (1 line: this plan's status flip)
6. Write a journal entry (concise ship summary)
7. Verify the scope report's verification checklist (10 items)

## Related Code Files

- Create: `docs/journals/260625-phase-e-plan-2-interface-spec-shipped.md` (journal entry)
- Modify: `plans/reports/productization-260612-1530-master-tracker.md` (1-line status update)
- Modify: `meta-state.jsonl` (1 new `change-log` entry via `meta_state_log_change`)
- Modify: `plans/260625-1618-phase-e-interface-spec/plan.md` (status flip: `pending` → `done`)

## Implementation Steps

### Step 1: Run the full test suite.

```bash
pnpm test
```

Expected: all test namespaces green. Specifically:
- `tools/learning-loop-mastra/__tests__/phase-e-foundation/*.test.js` (4 tests from Plan 1)
- `tools/learning-loop-mastra/__tests__/interface/*.test.js` (5 tests from Phase 1)
- `tools/learning-loop-mastra/interface/__tests__/contract.test.js` (24 tests from Phase 4)
- All other existing test suites (test count preserved from baseline; no reduction)

Total: existing tests preserved + 29 new tests, 0 fail.

If any test fails, diagnose and fix before proceeding to Step 2.

### Step 2: Smoke-test the validator against all 3 known runtimes.

```bash
node tools/learning-loop-mastra/interface/contract.js claude-code
echo "exit: $?"
node tools/learning-loop-mastra/interface/contract.js droid
echo "exit: $?"
node tools/learning-loop-mastra/interface/contract.js mastra-code
echo "exit: $?"
node tools/learning-loop-mastra/interface/contract.js --list
echo "exit: $?"
node tools/learning-loop-mastra/interface/contract.js --help
echo "exit: $?"
```

Expected:
- `claude-code`: `{ok: true, ...}` — exit 0
- `droid`: `{ok: true, ...}` — exit 0
- `mastra-code`: `{ok: false, missing: [4], ...}` — exit 1 (4 hard fails; `identity-marker` is advisory)
- `--list`: `{runtimes: [...], requirements: [...5 IDs...]}` — exit 0
- `--help`: usage message on stderr — exit 2

### Step 3: Verify the 3-layer architecture tree.

```bash
ls tools/learning-loop-mastra/
```

Expected: `agent-manifest.json agents agents-manifest.json core create-loop-agent.js create-loop-tool.js create-loop-workflow.js data docs hooks interface legacy-handler-adapter.js schema-parity.js schemas.js scout scripts server.js storage.js __tests__ tools workflows workflows-manifest.json`

The new `interface/` directory is present. The 3 layers (`core/`, the top-level shell, `interface/`) are all visible at the top level.

### Step 4: File `meta_state_log_change`.

This is the audit log entry for the interface-spec change. Use the MCP tool:

```javascript
mastra_meta_state_log_change({
  change_dimension: "surface",
  change_target: "plans/260625-1618-phase-e-interface-spec/plan.md",
  change_diff: {
    added: [
      "tools/learning-loop-mastra/interface/README.md",
      "tools/learning-loop-mastra/interface/CONTRACT.md",
      "tools/learning-loop-mastra/interface/contract.js",
      "tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md",
      "tools/learning-loop-mastra/interface/__tests__/contract.test.js",
      "tools/learning-loop-mastra/__tests__/interface/interface-dir-exists.test.js",
      "tools/learning-loop-mastra/__tests__/interface/contract-md-exists.test.js",
      "tools/learning-loop-mastra/__tests__/interface/contract-js-exports-validate.test.js",
      "tools/learning-loop-mastra/__tests__/interface/skill-md-references-tools.test.js",
      "tools/learning-loop-mastra/__tests__/interface/runtimes-pass-contract.test.js",
    ],
    removed: [],
    changed: [
      ".claude/skills/learning-loop/SKILL.md",
      ".factory/skills/learning-loop/SKILL.md",
    ],
  },
  reason: "Phase E Plan 2 ships the runtime interface layer: a 5-requirement contract (CONTRACT.md), a pure validator (contract.js), an onboarding guide (RUNTIME_ONBOARDING.md), and a 24-test suite that locks the contract against silent regression. Both SKILL.md files (E.0) are updated to reference the contract + tool manifest + 3-layer architecture. The validator passes for both claude-code and droid; it returns ok:false for mastra-code (no .mastracode/ dir yet), which proves the contract is forward-compatible.",
  applies_to: {
    surfaces: ["claude-code", "droid", "mastra-code"],
    rules: ["rule-runtime-agnostic-features"],
  },
  evidence_code_ref: "tools/learning-loop-mastra/interface/contract.js:1",
})
```

Note: if the `meta_state_log_change` MCP tool requires operator role (per its tool schema), the implementer may need to use the operator flow. Plan 1 used `meta_state_log_change` for the rename; the same pattern applies.

### Step 5: Update the master tracker.

Open `plans/reports/productization-260612-1530-master-tracker.md` and update the Phase E table:

```markdown
| Plan 2 | phase-e-interface-spec | E.0 + E.1b | Done 2026-06-25 via PR #17 | … |
```

(Replace `#17` with the actual PR number after the PR is opened; the status flip happens before merge.)

### Step 6: Write a journal entry.

Create `docs/journals/260625-phase-e-plan-2-interface-spec-shipped.md`:

```markdown
# Phase E Plan 2: Interface spec — shipped 2026-06-25

## Summary

Shipped the runtime interface layer (E.0 + E.1b from the scope report). The `tools/learning-loop-mastra/interface/` directory is now a first-class structure containing the contract spec, validator, onboarding guide, and test suite.

## What shipped

- **E.0**: Both SKILL.md files updated to reference the new contract + tool manifest + 3-layer architecture. Fixed broken legacy references (the "References" section pointed to `tools/learning-loop-mastra/tools/legacy/references/*` which does not exist since Plan 1's rename).
- **E.1b**: Created `tools/learning-loop-mastra/interface/` with:
  - `README.md` — what the interface IS, why it exists as a first-class structure, relationship to Core + Mastra shell, distinction from `protocol-adapter`.
  - `CONTRACT.md` — the 5 requirements (`hook-shim-set`, `mcp-client-config`, `skill-spec`, `identity-marker`, `settings-integration`) with verification predicates.
  - `contract.js` — pure ESM validator (~160 LoC; FCIS-clean; exports `validate`, `validateAll`, `REQUIREMENT_IDS`; CLI mode via `--list`, `<runtime-id>`, `--help`).
  - `RUNTIME_ONBOARDING.md` — step-by-step guide for adding a new runtime, with a worked example for Mastra Code.
  - `__tests__/contract.test.js` — 24-test suite covering structural, pass-mode, per-requirement, fail-mode, and golden scenarios.

## Verification at merge

- All 5 regression-guard tests pass (`tools/learning-loop-mastra/__tests__/interface/`).
- All 24 contract tests pass.
- `node contract.js claude-code` returns `{ok: true, ...}` (exit 0).
- `node contract.js droid` returns `{ok: true, ...}` (exit 0).
- `node contract.js mastra-code` returns `{ok: false, missing: [4], ...}` (exit 1).
- `pnpm test` passes (existing tests preserved + 29 new tests, 0 fail).

## Net source delta

- 1 new directory (`tools/learning-loop-mastra/interface/`)
- 5 new files in `interface/` (README, CONTRACT, contract.js, RUNTIME_ONBOARDING, contract.test.js)
- 5 new regression-guard tests in `__tests__/interface/`
- 2 SKILL.md updates (E.0)
- ~150 LoC production + ~140 LoC tests + ~30 LoC SKILL.md additions

## What this plan did NOT ship (deferred)

- The Mastra Code implementation (Plan 4 / E.5) — depends on this plan's contract + validator.
- The `RUNTIME_ID` enforcement gate (hardening plan / LIM-3) — the marker is advisory today; future hardening will make it mandatory for R2 write-gate ownership.
- The runtime-agnostic integration (the `core/runtime-agnostic-checklist.js` 6-item gate remains separate; the new contract is a runtime-level check, the existing checklist is a feature-level check).

## Cross-references

- Plan: `plans/260625-1618-phase-e-interface-spec/plan.md` (status: done)
- Phase files: `phase-01-baselineandtests.md` through `phase-05-verify.md`
- Test files: `__tests__/interface/*.test.js` (5) + `interface/__tests__/contract.test.js` (1)
- Scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` § "Plan split for execution" Plan 2 row
- Plan 1 journal (predecessor): `docs/journals/260625-phase-e-plan-1-review-fixes.md`
```

### Step 7: Verify the scope report's verification checklist (10 items).

Per the scope report §"Verification (how to test the change is right)" lines 397-410:

1. ✓ `ls tools/learning-loop-mastra/interface/` shows 4 docs + 1 test file (verified in Step 3).
2. ✓ `node contract.js claude-code` returns `{ok: true, ...}` (verified in Step 2).
3. ✓ `node contract.js droid` returns `{ok: true, ...}` (verified in Step 2).
4. ✓ `node contract.js mastra-code` returns `{ok: false, missing: [4], ...}` (verified in Step 2).
5. ✓ `node contract.js --list` exits 0 and prints 3 runtime IDs + 5 requirement IDs (verified in Step 2).
6. ✓ `node --test tools/learning-loop-mastra/__tests__/interface/*.test.js` passes (5 tests, verified in Step 1).
7. ✓ `grep -c "loop_describe" .claude/skills/learning-loop/SKILL.md .factory/skills/learning-loop/SKILL.md` returns ≥1 for each file (verified in Phase 2).
8. ✓ `grep -c "interface/CONTRACT.md" .claude/skills/learning-loop/SKILL.md .factory/skills/learning-loop/SKILL.md` returns ≥1 for each file (verified in Phase 2).
9. ✓ `pnpm test` passes (verified in Step 1).
10. ✓ `meta_state_log_change` is filed (verified in Step 4).

All 10 items pass.

## Success Criteria

- [x] `pnpm test` passes (existing tests preserved + 29 new tests, 0 fail)
- [x] Validator returns `{ok: true}` for `claude-code` and `droid`; `{ok: false}` for `mastra-code`
- [x] `--list` mode works; `--help` mode exits 2 with usage
- [x] `meta_state_log_change` is filed with the interface-spec change
- [x] Master tracker updates the Phase E table row for Plan 2
- [x] Journal entry is written
- [x] All 10 scope-report verification items pass
- [x] Plan status flips from `pending` to `done` after merge

## Risk Assessment

- **R1 (`meta_state_log_change` MCP tool gating):** the tool may require operator role. Mitigation: if the tool returns an error, fall back to the manual change-log entry (append to `meta-state.jsonl` directly with the same schema). Plan 1 used the MCP tool; same pattern applies.
- **R2 (Master tracker merge conflicts):** if multiple plans update the master tracker concurrently, conflicts arise. Mitigation: the master tracker update is a single-line status flip; merge conflicts are unlikely.
- **R3 (Journal entry drift):** if the journal entry is written before all checks pass, it may describe a partial state. Mitigation: Step 6 is the LAST step; it summarizes the actual verified state.
- **R4 (Scope-report Q5 collision persists):** if a future operator prefers `runtime-interface/` over `interface/`, the rename is a 1-line refactor. The README.md already documents the distinction from `protocol-adapter`.

## Test Output Reference (expected final state, post-Phase 5)

```text
$ pnpm test
# ... (all test namespaces)
# tests: existing + 29 new pass, 0 fail, 1 skip
# duration: ~30s

$ node tools/learning-loop-mastra/interface/contract.js claude-code | jq '.ok, .missing, .notes'
true
[]
[
  "identity-marker-not-adopted"
]

$ node tools/learning-loop-mastra/interface/contract.js droid | jq '.ok, .missing, .notes'
true
[]
[
  "identity-marker-not-adopted"
]

$ node tools/learning-loop-mastra/interface/contract.js mastra-code | jq '.ok, .missing | length'
false
4

$ node tools/learning-loop-mastra/interface/contract.js --list
{
  "runtimes": ["claude-code", "droid", "mastra-code"],
  "requirements": [
    "hook-shim-set",
    "mcp-client-config",
    "skill-spec",
    "identity-marker",
    "settings-integration"
  ]
}
```