---
phase: 3
title: "FCISInvariant"
status: pending
priority: P2
dependencies: [2]
effort: "0.5h"
---

# Phase 3: FCIS Invariant — add `core/README.md` and lock the invariant with a test

## Overview

The Functional Core / Imperative Shell (FCIS) pattern is a known architectural principle: a pure functional core has zero framework imports; the imperative shell wraps it. The Mastra framework imports (`@mastra/core/*`) are the imperative side; `core/` is the functional side. This phase codifies the invariant in `core/README.md` and locks it with a static-analysis test (Test #2 from Phase 1, which currently passes vacuously — it must continue to pass with real content).

## Requirements

- Functional: `tools/learning-loop-mastra/core/README.md` exists and states the FCIS invariant: "Core has zero `@mastra/*` imports; the shell may import core."
- Non-functional: the invariant is machine-checkable. A test fails if any file under `core/` ever imports `@mastra/*`.

## Architecture

**The FCIS invariant is a one-way dependency rule:**

```
Mastra shell (server.js, create-loop-*.js, workflows/, agents/, tools/)
   ↓ imports
Core (core/*.js — pure logic; zero framework imports)
```

**Why this matters:**
- **Testability:** core is pure → can be unit-tested without spinning up Mastra.
- **Portability:** if we ever swap Mastra for another framework, only the shell changes; core is unchanged.
- **Reasoning:** a reader can answer "what does this code do?" by reading `core/` alone, ignoring the shell.

**Where the line is:**
- `core/` may import: Node stdlib (`node:fs`, `node:path`, `node:crypto`), other `core/` files, npm packages that are pure logic (e.g., `yaml`, `zod`).
- `core/` may NOT import: `@mastra/*` (the framework), `tools/learning-loop-mastra/create-loop-*.js` (shell factories), or any file under `tools/learning-loop-mastra/{workflows,agents,tools}/` (shell-defined entities).

**Verified today (2026-06-24, pre-plan):** `grep -rE "from\s+['\"]@mastra" tools/learning-loop-mastra/core/legacy/` returns 0 matches. The invariant holds before the rename; this phase locks it for the future.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/README.md` (the discipline doc; ~80 LoC)
- Modify: `tools/learning-loop-mastra/__tests__/phase-e-foundation/fcis-invariant.test.js` (Phase 1 wrote a vacuous version; this phase hardens it to a real assertion)
- No other code changes.

## Implementation Steps

1. **Write `core/README.md`.**
   - **Title:** "Core — Functional Core (FCIS invariant)"
   - **Section 1: What this directory is** — "The functional core of the learning loop. Contains pure logic: meta-state, gate decisions, schema validation, fingerprint computation, drift detection. Zero framework dependencies."
   - **Section 2: The FCIS invariant** — "**Core has zero `@mastra/*` imports; the shell may import core.** This is the load-bearing architectural rule. If you add a `from '@mastra/...'` to any file in this directory, the FCIS test (`__tests__/phase-e-foundation/fcis-invariant.test.js`) will fail."
   - **Section 3: What core may import** — Node stdlib, other `core/` files, pure npm packages (`yaml`, `zod`, `ajv`, etc.). Examples: `node:fs`, `node:path`, `node:crypto`, `yaml`, `zod`.
   - **Section 4: What core may NOT import** — `@mastra/*` (framework), `tools/learning-loop-mastra/create-loop-*.js` (shell factories), anything under `tools/learning-loop-mastra/{workflows,agents,tools}/` (shell-defined entities). The reasoning: those would couple core to the shell, breaking the one-way dependency.
   - **Section 5: How to add a new core file** — "Drop the file in this directory. Write pure logic. No Mastra imports. Add a test in `__tests__/phase-e-foundation/fcis-invariant.test.js` if the file is non-trivial."
   - **Section 6: Why this is separate from `interface/` and `mastra/`** — pointer to AGENTS.md §1 for the 3-layer explanation (cross-reference; Phase 5's work).

2. **Harden Test #2 (FCIS invariant).**
   - The Phase 1 version was vacuous (the dir was empty before the rename). Now the dir has 30+ files.
   - Walk `tools/learning-loop-mastra/core/` recursively, parse each `*.js` and `*.cjs` file with a regex for `from\s+['"]@mastra` and `require\(['"]@mastra`, collect violations, fail the test if any.
   - **Edge case:** `core/README.md` itself mentions `@mastra/*` as a string. The test only parses `*.js` / `*.cjs`, not `*.md`, so this is fine. (Verify: `README.md` files don't match the `*.js` glob.)
   - **Edge case:** the regex must match both `import` (ESM) and `require` (CJS) syntax. Both patterns listed.
   - **Edge case:** a comment that says `// from '@mastra/core'` should NOT trigger the test. The regex `from\s+['"]@mastra` requires the `from` keyword followed by whitespace, then a quote, then `@mastra`. A comment that says `// import { foo } from '@mastra/core'` DOES match the regex (the regex doesn't distinguish comments from code). Mitigation: the test reports the file + line number; a human verifies whether the match is in a comment or code. If false positives become a problem, upgrade the test to use a real parser (acorn); for now, the false-positive rate is ~0 (no comment uses the exact `from '@mastra` pattern).

3. **Run Test #2 to confirm it passes with real content.**
   - `node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/fcis-invariant.test.js`
   - Expected: passes (0 violations; verified by `grep`).
   - If violations appear (e.g., a file was modified in Phase 2 to add a `@mastra` import), the test fails loudly; the fix is to remove the import.

4. **Add a sibling test: `core/` may import from itself.**
   - File: `__tests__/phase-e-foundation/core-self-imports.test.js` (small; ~20 LoC).
   - Assert: every `import` / `require` in `core/*.js` that points to another `core/*.js` resolves to an existing file. (Catches the case where a file is moved/renamed in `core/` and a sibling still imports the old path.)
   - Implementation: walk the dir, for each `core/X.js`, find all `from './Y.js'` or `from './sub/Y.js'` imports, assert the target file exists.

5. **Run the full test suite.**
   - `pnpm test`
   - Expected: all tests pass.

6. **Commit.**
   - One commit: `docs(phase-e): add core/README.md (FCIS invariant) + lock with test`
   - Body: `Codifies the functional-core / imperative-shell boundary. Test #2 (FCIS invariant) now runs against real content. All tests green.`

## Success Criteria

- [ ] `tools/learning-loop-mastra/core/README.md` exists; contains the string "FCIS" and "zero `@mastra/*` imports" (or equivalent)
- [ ] Test #2 (FCIS invariant) passes against the real `core/` dir
- [ ] Sibling test (`core-self-imports.test.js`) passes
- [ ] All 1189+ existing tests still pass
- [ ] The 4-phase test suite (`__tests__/phase-e-foundation/`) is now 4/4 green

## Risk Assessment

- **R1 (FCIS test false positive on a comment):** a comment like `// import { foo } from '@mastra/core'` matches the regex. Mitigation: human review of any reported violation; if the false-positive rate is non-zero in practice, upgrade to acorn.
- **R2 (FCIS test false negative on dynamic import):** `await import('@mastra/...')` is not caught by the static regex. Mitigation: search for `import\(['"]@mastra` in the regex (covers the dynamic case). Add this to the test.
- **R3 (FCIS doc drifts from the test):** the doc says "no `@mastra/*` imports" but a future test relaxes to "no `@mastra/core/agent` imports." Mitigation: the test asserts the doc AND the test agree (parse the doc for the invariant string, parse the test for the regex, assert both are present in the same session).
- **R4 (someone adds a `@mastra/*` import to a file in `core/` and the test doesn't catch it):** the test runs in CI; PRs that introduce violations will fail the build. The test is the gate.

## Test Output Reference (expected green state, post-Phase 3)

```text
$ node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/fcis-invariant.test.js
# Subtest: core/ has zero @mastra/* imports
# Scanned 31 files
# Violations: 0
ok 1 - core/ has zero @mastra/* imports

# Subtest: core/ may import from itself (no broken sibling imports)
# Scanned 31 files
# Broken sibling imports: 0
ok 2 - core/ may import from itself
```
