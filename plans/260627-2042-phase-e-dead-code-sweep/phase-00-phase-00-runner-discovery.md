---
phase: 0
title: "phase-00-runner-discovery"
status: pending
priority: P2
dependencies: []
effort: "0.25 day"
---

# Phase 0: Test Runner Discovery

## Overview
Read `tools/scripts/run-pnpm-test-namespaced.mjs` and record what test files it discovers in `tasks.md` under "Test discovery notes". This is foundational context for the rest of the plan: Phase 5's test-count delta depends on whether sibling tests (`core/lib/*.test.js`) are picked up; Phase 3's "is this deletion safe?" check depends on whether the FCIS invariant test (`__tests__/phase-e-foundation/`) is in scope.

## Requirements
- **Functional:** the namespaced runner config is read and understood; `tasks.md` has populated answers for all 3 questions in "Test discovery notes" (sibling pattern, `core/__tests__/`, `__tests__/legacy-mcp/`); the captured-before test counts are recorded for Phase 5 delta computation.
- **Non-functional:** no file changes outside `tasks.md` and (optionally) `tools/scripts/` for inspection.

## Architecture

No code changes. Read + document.

```
Phase 0 (this phase)
  │
  ▼
Read tools/scripts/run-pnpm-test-namespaced.mjs
  │
  ▼
Answer 3 questions in tasks.md
  │
  ▼
Run pnpm test once; record total count
  │
  ▼
Gate: all 3 questions answered, total count captured
```

## Related Code Files
- Modify: `plans/260627-2042-phase-e-dead-code-sweep/tasks.md` (populate "Test discovery notes" section)

## Implementation Steps

### Step 1 — Read the namespaced runner config
```bash
cd tools/learning-loop-mastra
cat scripts/run-pnpm-test-namespaced.mjs | head -120
```

Read the entire file if it's longer. Identify:
- The file glob patterns (e.g., `core/**/*.test.js`, `__tests__/**/*.test.cjs`)
- Any explicit include/exclude lists
- Whether `core/__tests__/` is included
- Whether sibling tests (`core/lib/*.test.js`) are included
- Whether `__tests__/legacy-mcp/*.test.js` is included

### Step 2 — Run the test suite once and capture the baseline
```bash
cd /home/datguy/codingProjects/learning-loop-template
pnpm test 2>&1 | tee /tmp/pre-sweep-test-count.txt
```

Record the **total test count** (the final summary line, e.g., `# tests N`). This is the baseline for Phase 5's delta computation.

### Step 3 — Populate `tasks.md` "Test discovery notes" section

Open `plans/260627-2042-phase-e-dead-code-sweep/tasks.md`. Fill in the "Test discovery notes" section with concrete answers:

```markdown
## Test discovery notes (Phase 0)

**Runner config observations:**
- <1-3 bullet points summarizing what the runner discovers>
- Any glob patterns that affect the plan (e.g., `core/__tests__/` excluded)

**Test discovery answers:**
- Does the runner discover `core/lib/*.test.js` (sibling pattern)? **YES / NO** (means deleting `core/lib/source-ref-validator.test.js` removes **N** tests)
- Does the runner discover `core/__tests__/*.test.js`? **YES / NO**
- Does the runner discover `__tests__/legacy-mcp/*.test.js`? **YES / NO** (means deleting the list-probes test removes **N** tests)

**Captured-before test counts:**
- Total test count: **N** (run `pnpm test`, record the final summary line)
- `__tests__/legacy-mcp/list-probes.test.js` test count: **N** (verified: 3 `it()` blocks)
- `core/lib/source-ref-validator.test.js` test count: **N** (verified: 24 `test()` calls)

**Expected post-deletion delta: −27 tests (3 + 24)**
```

### Step 4 — Verify Phase 5 delta math

Sanity check: if the runner discovers both test files (expected), the post-deletion total should be `N − 27`. If it discovers only one or neither, update the expected delta accordingly.

If the runner discovers `core/__tests__/*.test.js` (3 files), those test counts ALSO matter for the FCIS invariant test verification (Phase 3 step 1.5).

## Success Criteria
- [ ] `tasks.md` "Test discovery notes" section populated with concrete answers
- [ ] Total test count recorded from `pnpm test`
- [ ] Per-file test counts for both deletion candidates recorded (3 + 24 = 27 confirmed)
- [ ] Expected post-deletion delta computed (−27 if both files are in scope; different otherwise)

## Risk Assessment
- **R1 — The runner has unusual discovery logic.** Mitigation: read the full file; the answer is deterministic.
- **R2 — `pnpm test` is slow or flaky.** Mitigation: capture count once; if timing varies, the absolute number matters less than the per-file deltas which are static.
- **R3 — Phase 0 reveals the runner doesn't discover sibling tests.** Mitigation: this is a feature, not a bug — Phase 5's "−24 tests" expectation needs to become "0 tests" in that case. The plan is robust to the answer.