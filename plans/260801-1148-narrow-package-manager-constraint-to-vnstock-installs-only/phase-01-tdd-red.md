---
phase: 1
title: "TDD red — encode new contract in tests"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: TDD red — encode new contract in tests

## Overview

Write/flip the gate tests so they assert the **target** contract before any production regex changes. The suite goes red on the narrowed assertions; Phase 2 turns it green by changing the regex. Non-vnstock installs flip to `null`; vnstock installs keep matching `"package-manager"`.

## Requirements

- Functional: tests encode "non-vnstock install → no match" and "vnstock install → `package-manager`" before the regex is touched.
- Non-functional: no production code changes in this phase — only tests. Red is expected and committed.

## Architecture

`matchConstraintPattern(command)` (`core/gate-logic.js:411`) iterates `CONSTRAINT_PATTERNS` and returns the first matching type. Tests call it directly with literal command strings. The narrowing is a regex change in `patterns.json`; tests pin the behavior on both sides of the boundary so the regex is the only moving part in Phase 2.

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-quoted-strings.test.js` — flip 4 assertions; add non-vnstock null cases.
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-promoted-rules.test.js` — flip `pip install numpy` assertion.
- Modify (add cases only): `tools/learning-loop-mastra/core/evaluate-bash-gate.test.js` — add the fallow-scenario regression guard.
- No production code changes.

## Implementation Steps

1. `gate-logic-quoted-strings.test.js:55` — change `bash -c "npm install"` expected from `"package-manager"` → preserve the **"bash -c body IS checked"** intent by switching the example to a vnstock command: `bash -c "pip install vnstock"` → `"package-manager"`. (Don't just assert null — that would erase the asymmetry guard this test exists for.)
2. `gate-logic-quoted-strings.test.js:104` — same treatment for `ssh -t user@host "npm install"` → switch to `ssh -t user@host "pip install vnstock"` → `"package-manager"`.
3. `gate-logic-quoted-strings.test.js:121` — `npm install react` → flip to `null` (this is the new-behavior guard).
4. `gate-logic-quoted-strings.test.js:126` — `pnpm add react` → flip to `null`.
5. `gate-promoted-rules.test.js:18` — `pip install numpy` → flip from `"package-manager"` to `null`. Rename the test from "existing constraint pattern still matches" to "non-vnstock install no longer matches package-manager".
6. Add new regression cases to `gate-logic-quoted-strings.test.js` (or `evaluate-bash-gate.test.js`):
   - `pnpm add -D fallow@3.10.0` → `null` (the actual blocked scenario).
   - `pip install vnstock` → `"package-manager"` (positive guard).
   - `uv pip install vnstock` → `"package-manager"` (uv verb form).
   - `pip install vnstock_data` → `"package-manager"` (prefix match — sponsor/data package still gated).
   - `pip install notvnstock` → `null` (word-boundary guard: substring inside another package name must not match).
7. Run the gate test files; confirm the new/flip cases are **red** and the vnstock-positive cases are already green (the regex is still broad, so vnstock commands still match).

## Success Criteria

- [ ] Non-vnstock install assertions (`npm install react`, `pnpm add react`, `pip install numpy`, `pnpm add -D fallow@3.10.0`) fail with `expected null, got "package-manager"` (red).
- [ ] vnstock-positive assertions (`pip install vnstock`, `uv pip install vnstock`, `pip install vnstock_data`, `bash -c "pip install vnstock"`) pass (green).
- [ ] No production file (`patterns.json`, `gate-logic.js`, `file-readers.js`) modified in this phase.

## Risk Assessment

**Removing the broad "stop-and-think" guard for non-vnstock installs.** Per user decision, non-vnstock installs no longer require an observation. This is the intended scope but it does reduce the gate's coverage of arbitrary installs. Mitigation: the vnstock device-slot budget (the actual scarce resource) is still guarded for vnstock installs, and `vendor-api`/`side-effect-import` still guard the vendor API surface independently. No new bypass for vnstock itself is introduced.