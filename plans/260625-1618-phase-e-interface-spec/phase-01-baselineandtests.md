---
phase: 1
title: "BaselineAndTests"
status: completed
priority: P2
dependencies: []
effort: "1h"
---

# Phase 1: Baseline and Tests (red baseline)

## Overview

Establish the pre-plan baseline so every later phase can verify against a known starting point. Write 5 regression-guard tests that fail BEFORE the new files exist and will pass AFTER each phase completes. This is the TDD "red" step — no production code changes yet; only test code and a baseline snapshot.

**Source:** `plans/reports/plan-2-research-test-skill-onboarding-260625-1618-report.md` §A.4 (test design) + researcher 1's contract design (test stubs).

## Requirements

- **Functional:** capture a JSON snapshot of (a) the absence of `tools/learning-loop-mastra/interface/`, (b) the absence of tool references (`loop_describe`, `meta_state_list`) in both SKILL.md files, (c) the 4-hook shim set in both `.claude/coordination/hooks/` and `.factory/coordination/hooks/`, (d) the MCP config locations (`.mcp.json` for Claude Code, `.factory/mcp.json` for Droid).
- **Non-functional:** the baseline must be deterministic and reproducible; running the baseline script twice produces byte-identical output. Tests use `node:test` + `node:assert/strict` (matches existing 4 `phase-e-foundation` tests + `legacy-mcp/runtime-agnostic.test.js`).

## Architecture

The baseline is a snapshot, not a test runner. Tests are static-analysis + dynamic-validator assertions that the codebase currently VIOLATES the post-plan invariants. The tests will turn green in Phases 2-4 as the docs + validator + onboarding work completes.

**Test suite locations:**
- `tools/learning-loop-mastra/__tests__/interface/` (5 regression-guard tests; mirrors `__tests__/phase-e-foundation/` pattern from Plan 1)
- `tools/learning-loop-mastra/interface/__tests__/contract.test.js` (24-test contract suite; stub written in Phase 1, filled in Phase 4)

**Baseline manifest location:** `plans/260625-1618-phase-e-interface-spec/reports/pre-plan-baseline.json` (write-only from this phase; read-only from Phases 2-4).

## Related Code Files

- Create: `plans/260625-1618-phase-e-interface-spec/scripts/capture-baseline.cjs` (baseline snapshot script)
- Create: `plans/260625-1618-phase-e-interface-spec/reports/pre-plan-baseline.json` (the snapshot output)
- Create: `tools/learning-loop-mastra/__tests__/interface/interface-dir-exists.test.js`
- Create: `tools/learning-loop-mastra/__tests__/interface/contract-md-exists.test.js`
- Create: `tools/learning-loop-mastra/__tests__/interface/contract-js-exports-validate.test.js`
- Create: `tools/learning-loop-mastra/__tests__/interface/skill-md-references-tools.test.js`
- Create: `tools/learning-loop-mastra/__tests__/interface/runtimes-pass-contract.test.js`
- Create: `tools/learning-loop-mastra/interface/__tests__/contract.test.js` (24-test stub; structure only — fills in Phase 4)
- Modify: `tools/scripts/run-pnpm-test-namespaced.mjs` (add 2 new GLOB entries for `interface/` and `__tests__/interface/`; red-team Finding A2 — existing single-asterisk GLOBs miss new subdirs)

## Implementation Steps

### Step A: Capture the baseline (deterministic).

Write `plans/260625-1618-phase-e-interface-spec/scripts/capture-baseline.cjs` that:
- `test -d tools/learning-loop-mastra/interface && echo present || echo absent` → returns `absent` (the directory does not exist yet)
- `grep -c "loop_describe" .claude/skills/learning-loop/SKILL.md .factory/skills/learning-loop/SKILL.md` → returns 0/0 (no tool references today)
- `grep -c "meta_state_list" .claude/skills/learning-loop/SKILL.md .factory/skills/learning-loop/SKILL.md` → returns 0/0
- `ls .claude/coordination/hooks/ .factory/coordination/hooks/` → returns the 4 shim filenames per runtime
- `jq -r '.mcpServers["learning-loop"] | .command + " " + (.args | join(" "))' .mcp.json` → returns `node tools/learning-loop-mastra/server.js`
- `jq -r '.mcpServers["learning-loop"] | .command + " " + (.args | join(" "))' .factory/mcp.json` → returns `node tools/learning-loop-mastra/server.js`
- `jq -r '.groups | keys[]' tools/learning-loop-mastra/agent-manifest.json` → returns 6 group names

Write the output to `plans/260625-1618-phase-e-interface-spec/reports/pre-plan-baseline.json` (sorted keys, no timestamps, deterministic ordering).

Exit code 0 on success; the script is idempotent (running twice produces byte-identical output).

### Step B: Write 5 regression-guard tests.

**Test #1: `interface-dir-exists.test.js`** — Asserts `tools/learning-loop-mastra/interface/` exists; lists 4 expected files (README.md, CONTRACT.md, contract.js, RUNTIME_ONBOARDING.md); asserts the `__tests__/` subdirectory exists.

**Test #2: `contract-md-exists.test.js`** — Asserts `tools/learning-loop-mastra/interface/CONTRACT.md` exists; size > 500 bytes; contains the 5 requirement IDs (`hook-shim-set`, `mcp-client-config`, `skill-spec`, `identity-marker`, `settings-integration`); contains "Verification" or "verification"; references the validator (`contract.js`).

**Test #3: `contract-js-exports-validate.test.js`** — Asserts `tools/learning-loop-mastra/interface/contract.js` exists; imports `validate` from it; `typeof validate === "function"`; imports `REQUIREMENT_IDS`; `REQUIREMENT_IDS.length === 5`.

**Test #4: `skill-md-references-tools.test.js`** — Asserts both `.claude/skills/learning-loop/SKILL.md` and `.factory/skills/learning-loop/SKILL.md` contain `loop_describe` AND `meta_state_list` (Requirement #3 of the contract). Also asserts both reference `tools/learning-loop-mastra/interface/CONTRACT.md` (so future agents reading the skill know the contract exists).

**Test #5: `runtimes-pass-contract.test.js`** — Imports `validate` from `interface/contract.js`; calls `validate("claude-code", projectRoot)`; asserts `result.ok === true && result.missing.length === 0`. Same for `validate("droid", projectRoot)`. Also asserts `validate("mastra-code", projectRoot).ok === false` (proves the validator handles future runtimes).

### Step C: Write the contract.test.js stub (Phase 4 will fill in).

Create `tools/learning-loop-mastra/interface/__tests__/contract.test.js` with the structural tests only (per researcher 2 A.4 Group 1):
- `test("contract.js exports validate as named export", ...)` — fails red (file doesn't exist)
- `test("contract.js exposes REQUIREMENT_IDS constant", ...)` — fails red
- `test("contract.js runs as CLI (--list)", ...)` — fails red
- `test("contract.js runs as CLI with a runtime id", ...)` — fails red

The 20 remaining tests (per researcher 2 A.4 Groups 2-5) are written in Phase 4 after the validator is implemented. Keeping them in Phase 1 would mean rewriting tests after Phase 3 changes the validator's shape.

### Step D: Verify the tests are red.

Run `node --test tools/learning-loop-mastra/__tests__/interface/*.test.js`. Expected: all 5 fail (the interface/ dir doesn't exist; SKILL.md files lack tool references). Run `node --test tools/learning-loop-mastra/interface/__tests__/contract.test.js`. Expected: 4 structural tests fail.

Document the red state in the baseline manifest: `phase_1_red_state: { test_1: 'fail', test_2: 'fail', test_3: 'fail', test_4: 'fail', test_5: 'fail', contract_test_group_1: 'fail-4-of-4' }`.

### Step E: Add new GLOBs to `run-pnpm-test-namespaced.mjs`.

**Red-team Finding A2 (2026-06-25):** the test runner at `tools/scripts/run-pnpm-test-namespaced.mjs` lines 26-34 uses single-asterisk globs. `__tests__/interface/*.test.js` is a subdir (single-asterisk misses it); `interface/__tests__/contract.test.js` is in a new tree not covered by any glob. Phase 5's `pnpm test` would report "all tests pass" but the new tests would not actually run.

Add 2 new entries to the `GLOBS` array in `tools/scripts/run-pnpm-test-namespaced.mjs`:

```javascript
{ ns: "interface-regression-guards", pattern: "tools/learning-loop-mastra/__tests__/interface/*.test.js" },
{ ns: "interface-contract-tests",     pattern: "tools/learning-loop-mastra/interface/__tests__/contract.test.js" },
```

Verify the GLOB picks up the new directories by running `pnpm test` and confirming both namespaces appear in the output (the tests will still fail in Phase 1 — the regression-guard tests fail because the source files don't exist; that's the red baseline).

## Success Criteria

- [x] `pre-plan-baseline.json` is captured and committed
- [x] 5 regression-guard tests exist in `__tests__/interface/`
- [x] 4 structural tests exist in `interface/__tests__/contract.test.js` (Phase 4 will add 20 more)
- [x] All 9 tests fail before any production code change
- [x] 2 new GLOB entries added to `tools/scripts/run-pnpm-test-namespaced.mjs`
- [x] `pnpm test` lists the new namespaces (even if tests fail; the point is they're discovered)
- [x] Baseline manifest is reproducible: running `capture-baseline.cjs` twice produces byte-identical output
- [x] No production code is changed in this phase (only test code + manifest)

## Risk Assessment

- **R1 (Test #4 false positive on historical references):** the SKILL.md files have references like `tools/learning-loop-mastra/tools/legacy/references/...` (broken since Plan 1's rename). The test asserts presence of `loop_describe` and `meta_state_list` (specific tool names), not the broken legacy paths. Mitigation: assert on specific tool-name strings, not on legacy paths.
- **R2 (Test #5 false positive on missing surface):** `validate("claude-code", projectRoot)` calls the validator against the real `.claude/` dir. If the validator's path resolution is buggy, the test will fail in unexpected ways. Mitigation: the test asserts only the top-level shape (`ok`, `missing.length`); deeper assertions are in `contract.test.js`.
- **R3 (Baseline script nondeterminism):** if `find` returns different ordering across runs, the manifest will diff. Mitigation: `sort` every output; exclude timestamps; use `git ls-files` or `jq -S` for stable JSON.
- **R4 (Pre-existing SKILL.md content drift):** the SKILL.md "References" section points to broken legacy paths (`tools/learning-loop-mastra/tools/legacy/references/*`). These are broken since Plan 1's rename but are not asserted by Test #4 (which only checks for tool-name presence). Mitigation: Phase 2's SKILL.md update replaces the References section with current paths.

## Test Output Reference (expected red state, 2026-06-25)

```text
$ node --test tools/learning-loop-mastra/__tests__/interface/interface-dir-exists.test.js
# Subtest: interface directory exists
not ok 1 - interface directory exists
  ---
    error: 'ENOENT: no such file or directory, scandir .../tools/learning-loop-mastra/interface'
  ...
```

```text
$ node --test tools/learning-loop-mastra/__tests__/interface/skill-md-references-tools.test.js
# Subtest: both SKILL.md files reference loop_describe
not ok 1 - .claude/skills/learning-loop/SKILL.md references loop_describe
  ---
    error: 'expected to contain "loop_describe"; got 0 matches'
  ...
```

(All 5 tests fail before Phase 2-4 changes; they turn green as Phases 2-4 land.)