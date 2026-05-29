---
phase: 1
title: "Tests-First"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Tests-First

## Overview

Create a dedicated test file that documents the false-positive behavior and the expected fix. The tests must cover both the false-positive cases (message flags) and the wrapper-command cases (executable quoted strings) to ensure no regression.

## Requirements

- **Functional:** All test cases must pass after the implementation.
- **Non-functional:** Tests should be self-contained and use only `node:test` + `assert` (no external test libraries).

## Related Code Files

- **Create:** `tools/learning-loop-mcp/__tests__/gate-logic-quoted-strings.test.js`
- **Modify:** `tools/learning-loop-mcp/core/gate-logic.js` (add `MESSAGE_FLAGS` and `stripMessageFlags` — stubbed in this phase, then implemented in Phase 2)

## Implementation Steps

1. **Create `__tests__/gate-logic-quoted-strings.test.js`**
   - Import `matchConstraintPattern` from `core/gate-logic.js`
   - Add false-positive test cases:
     - `git commit -m "fix pnpm add issue"` → `null`
     - `git commit -m "test docker setup"` → `null`
     - `git commit -m "fix sudo permission"` → `null`
     - `gh pr create --title "npm install fix"` → `null`
   - Add wrapper-command test cases (must still match):
     - `bash -c "docker run ubuntu"` → `"docker"`
     - `python -c "import docker"` → `"docker"`
     - `bash -c "npm install"` → `"package-manager"`
   - Add `-t` collision test case (red team finding):
     - `ssh -t user@host "npm install"` → `"package-manager"` (skipNext is consumed by `user@host`, so `"npm install"` is still checked)
   - Add normal constraint test cases (must still match):
     - `docker run ubuntu` → `"docker"`
     - `sudo apt update` → `"sudo"`
     - `npm install react` → `"package-manager"`
   - Add unquoted multi-word message edge case (red team finding — documents behavior):
     - `git commit -m fix pnpm add issue` → `"package-manager"` (unquoted multi-word values only skip one token; this is expected behavior because `git` requires quoting for multi-word messages)

2. **Run the new tests** — they will fail because `stripMessageFlags` is not yet implemented. This is the expected "red" state in TDD.

3. **Verify existing test suite still passes** — run all tests to establish baseline.

## Success Criteria

- [ ] New test file `__tests__/gate-logic-quoted-strings.test.js` created with comprehensive test coverage
- [ ] False-positive cases exist and fail (red state)
- [ ] Wrapper-command cases exist and pass (baseline)
- [ ] Normal constraint cases exist and pass (baseline)
- [ ] All existing tests pass before any changes to `gate-logic.js`
