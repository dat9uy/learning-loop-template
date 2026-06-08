---
phase: 2
title: "Green (scout implementation)"
status: pending
effort: ~2.5h
dependencies: [1]
---

# Phase 2: Green (scout implementation)

## Overview

Implement the 4 pure-function scout modules + 1 orchestrator to make the 24+ RED tests from Phase 1 turn GREEN. **Minimal new code, no premature optimization** — the goal is to pass the tests, not to build a production-grade tool. The scout does NOT call `meta_state_report` in this phase; that is deferred to Phase 3 (the side-effect is the only I/O discipline that matters).

## Requirements

- **Functional:**
  - All 4 pure functions implement the signatures from Phase 1
  - The orchestrator (`run-scout.js`) walks the project, calls the pure functions, and returns a `ScoutOutput` JSON object that validates against `scout-output.schema.json`
  - All 24+ tests from Phase 1 turn GREEN
  - No use of `node -e` escape-hatch patterns (per meta-260606T2102Z closure)
- **Non-functional:**
  - Pure functions are deterministic: same input → same output (no Date.now() in pure functions; timestamps are passed in)
  - Orchestrator is the only module that touches the filesystem
  - All modules are ESM (`.js`); orchestrator uses dynamic imports for testability
  - Latencies in `budget-estimator.js` are configurable via `process.env.SCOUT_BUDGET_LATENCIES` JSON (default: brainstorm C5 values)

## Architecture

The implementation follows the module decomposition from Phase 1:

| Module | ~Lines | Side effects | Pure? |
|--------|--------|--------------|-------|
| `bucket-classifier.js` | 150 | None | YES |
| `dangling-detector.js` | 200 | None | YES |
| `gap-analyzer.js` | 250 | None | YES |
| `budget-estimator.js` | 150 | None | YES |
| `run-scout.js` | 100 | File walk, JSON read/write | NO (orchestrator) |

The pure functions take strings/objects and return strings/objects. The orchestrator is responsible for:
1. Walking the project for `__tests__/` directories
2. Reading each test file's source + mtime
3. Loading the contract surface (tools/manifest.json, schemas/*.schema.json, etc.)
4. Calling the pure functions with the loaded data
5. Assembling the result into a `ScoutOutput` JSON object
6. Writing the JSON output to `tools/learning-loop-mcp/scout/fixtures/scout-output.json` (only on `run-scout --write`)

## Related Code Files

- **Create:**
  - `tools/learning-loop-mcp/scout/bucket-classifier.js` (~150 lines)
  - `tools/learning-loop-mcp/scout/dangling-detector.js` (~200 lines)
  - `tools/learning-loop-mcp/scout/gap-analyzer.js` (~250 lines)
  - `tools/learning-loop-mcp/scout/budget-estimator.js` (~150 lines)
  - `tools/learning-loop-mcp/scout/run-scout.js` (~100 lines)
  - `tools/learning-loop-mcp/scout/index.js` (~30 lines) — barrel export for tests
  - `tools/learning-loop-mcp/scout/lib/ast-utils.js` (~50 lines) — minimal AST helpers (e.g., extract `test`/`it`/`beforeEach`/`afterEach` block ranges) using regex (NO new dependency; reuse `acorn` only if already in deps)
- **Modify:** None
- **Delete:** None

## Implementation Steps

### Step 2.1 — Implement `bucket-classifier.js`

The classifier decides A/B/C/D for a test file based on its source code. Per the brainstorm C1:

- **A (MCP-only)**: No `fs.readFileSync` / `fs.writeFileSync` / `writeEntry` / `readRegistry` calls in test logic.
- **B (MCP + setup/teardown I/O)**: I/O calls only inside `beforeEach` / `afterEach` / `before` / `after` blocks.
- **C (Bypass-MCP)**: Direct `writeEntry` / `readRegistry` / `appendGateLog` / `updateEntry` imports from `core/meta-state.js` OR direct `fs.writeFileSync` calls in test logic (when an MCP tool exists for the same operation).
- **D (Droid exec)**: `spawn` / `exec` / `execFile` calls with `"droid"` as the first argument.

Algorithm (deterministic):
1. Read source as string.
2. Tokenize into lines (1-indexed).
3. Find block boundaries: `test(`, `it(`, `beforeEach(`, `afterEach(`, `before(`, `after(`, `describe(`.
4. For each line, classify as "logic" (inside `test`/`it`) or "setup" (inside `before*`/`after*`).
5. Scan for the 4 bucket signatures in priority order D → C → B → A:
   - **D** if any `spawn`/`exec`/`execFile` call has `"droid"` as the first arg.
   - **C** if any `writeEntry`/`readRegistry`/`appendGateLog`/`updateEntry` import OR any `fs.writeFileSync` call appears in a "logic" line.
   - **B** if any `fs.readFileSync`/`fs.writeFileSync` call appears in a "setup" line AND no C triggers.
   - **A** otherwise.
6. Return `{ bucket, reason }`. The `reason` includes the line citation (e.g., `"writes via core/meta-state.js#writeEntry at line 5"`).

Edge cases:
- Empty source → returns `{ bucket: "error", reason: "empty source" }` (per F8 red team finding — empty source is NOT bucket A, it is an error; orchestrator skips the file with a warning).
- Source with only `describe` blocks (no `test`/`it`) → bucket A (the test is a no-op).
- Source with nested `describe` blocks → counts the OUTERMOST `test`/`it` call only (per F3 red team finding — regex is 1-level deep, no AST traversal).
- Source with mixed C + D → bucket D (D is the most "real runtime" classification; C is anti-pattern but D is the primary mode).

**Implementation sketch** (no code generation, just the structure):
```js
// bucket-classifier.js
export function classifyBucket(testFilePath, sourceCode) {
  const lines = sourceCode.split("\n");
  const blockRanges = parseBlockRanges(lines); // [{ kind: "test"|"setup", start, end }]
  // ... apply the 4-bucket algorithm ...
  return { bucket, reason };
}

function parseBlockRanges(lines) { /* ... */ }
```

### Step 2.2 — Implement `dangling-detector.js`

The detector runs 5 pattern checks per the brainstorm C2:

- **D1 (schema-drift)**: Regex `\.evidence\.code_ref` or `\.evidence\["code_ref"\]` in the source (catches `finding.evidence.code_ref` and bracket access).
- **D2 (resolved-finding dependency)**: Regex `status\s*[:=]==?\s*['"]active['"]` + a `resolvedFindings` set param. If the assertion references a known-resolved finding id, flag it.
- **D3 (removed-tool reference)**: Walk the import statements; if any imported symbol is not in the current `tools/manifest.json` (the caller passes the manifest), flag it.
- **D4 (stale fixture)**: Walk the `fixtures/` directory; for each file, check (a) mtime > 30 days, (b) no test file imports it. Flag matches with `requires_runtime_check: true`.
- **D5 (stale TOLERANCES)**: Regex `const\s+TOLERANCES\s*=\s*\[[^\]]+\]` followed by a line that does NOT have `// ` comment explaining the value.

Algorithm:
1. For each pattern D1-D5, run a pure-function check that returns `DanglingMatch[]`.
2. Combine and sort by (file, line).

### Step 2.3 — Implement `gap-analyzer.js`

The analyzer computes coverage of the contract surface. Per the brainstorm C3:

For each of the 5 contract surfaces (`mcp-tools`, `schemas`, `gate-patterns`, `entry-kinds`, `error-paths`):
1. Enumerate the surface items (e.g., 52 tool names from `tools/manifest.json`).
2. Grep the test files for references to each item (string match, case-sensitive).
3. Compute `covered = items_with_at_least_1_reference / total`.
4. Return a `GapTableEntry` with the missing items.

**Surface enumeration**:
- `mcp-tools`: parse `tools/learning-loop-mcp/tools/manifest.json` (the JSON file from Phase 1.1's reference; the field is `file` and the export is derived from filename). Actually, the canonical tool name is the file basename without `.js` converted to `snake_case` (e.g., `meta-state-patch-tool.js` → `meta_state_patch_tool`). Or just use the file basename without `.js` as the search key. Per the existing manifest, the format is mixed. **Decision:** search for the export name (e.g., `metaStatePatchTool`) AND the file basename (e.g., `meta-state-patch-tool`) — either counts as a reference.
- `schemas`: list `schemas/*.schema.json` filenames.
- `gate-patterns`: parse `tools/learning-loop-mcp/core/gate-logic.js` for exported pattern constants. Use regex: `export const \w+_(PATTERN|REGEX)\s*=\s*`.
- `entry-kinds`: the 4 known kinds (`finding`, `change-log`, `rule`, `loop-design`).
- `error-paths`: enumerate from each MCP tool's Zod schema — look for `z.enum([...])` and `.refine()` calls that produce error branches. This is the hardest surface; for Phase 2, enumerate a known list (e.g., `invalid-severity-rejection`, `invalid-affected-system-rejection`, `invalid-evidence-code-ref-rejection`) and grep for tests that exercise these specific error paths. Future plans can refine this enumeration.

### Step 2.4 — Implement `budget-estimator.js`

The estimator computes `timeout_utilization` per the brainstorm C5:

```
wall_clock_estimate = (expected_file_reads * 12s)
                    + (expected_mcp_calls * 8s)
                    + (expected_reasoning_blocks * 6s)
                    + (toolsearch_overhead * 5s)
                    + (other_io * 3s)
```

Where:
- `expected_file_reads` = count of "Read", "cat", "open" keywords + file paths in the prompt (stripped of comments first, per F4 red team).
- `expected_mcp_calls` = count of `mcp__learning_loop_mcp__` strings in the prompt (stripped of comments first, per F4 red team — counting strings in comments inflates the estimate).
- `expected_reasoning_blocks` = number of `## Findings`-style sections or paragraph breaks in the prompt.
- `toolsearch_overhead` = 1 (always pay the 5s ToolSearch cost for deferred tools).
- `other_io` = heuristic: 0 if prompt is <500 chars, 1 if 500-2000 chars, 2 if >2000 chars.

**Comment stripping helper** (`stripComments(sourceText)`):
- Strip line comments: `//.*$` (only outside of strings and regex literals).
- Strip block comments: `/\*[\s\S]*?\*/` (only outside of strings and regex literals).
- Use a simple state machine: track `'string'`, `"string"`, `` `template` ``, `/regex/` modes. Comments inside strings are NOT stripped.

Risk thresholds:
- `utilization < 0.5` → `low`
- `0.5 <= utilization < 0.7` → `medium`
- `0.7 <= utilization < 1.0` → `high`
- `utilization >= 1.0` → `critical`

Latencies are configurable via `process.env.SCOUT_BUDGET_LATENCIES` (JSON object, e.g., `{"fileRead":12,"mcpCall":8,...}`). Defaults from brainstorm C5.

### Step 2.5 — Implement `run-scout.js` (orchestrator)

The orchestrator:
1. Accepts `(projectRoot, options)` where `options = { writeJson: boolean, writeMarkdown: boolean }`.
2. Walks `projectRoot` for `__tests__/` directories (using `node:fs` `readdirSync` recursive).
3. For each test file:
   a. Reads the source + mtime.
   b. Counts tests via regex `^(test|it)\(`.
   c. Calls `classifyBucket` to get `{ bucket, reason }`.
   d. Calls `detectDangling` to get `DanglingMatch[]`.
   e. If bucket is D, calls `estimateBudget` to get `BudgetEstimate`.
4. Loads the contract surface (manifests, schemas, gate patterns) and calls `analyzeGaps`.
5. Assembles the `ScoutOutput` JSON object.
6. Validates the output against `scout-output.schema.json` using AJV.
7. If `options.writeJson`, writes to `tools/learning-loop-mcp/scout/fixtures/scout-output.json` (committed; regenerated on each scout run; per F5 red team — the fixture is NOT a source of truth, it's a snapshot).
8. If `options.writeMarkdown`, projects the JSON to markdown and writes to `docs/journals/<DATE>-test-scout-report.md`. The markdown includes a "Prompt Budget Audit (per-test)" heading for Deliverable 5 (per F10 red team).
9. Returns the `ScoutOutput` object.

**`excludeGlobs` option** (per F12 red team): the orchestrator's `walkProject` accepts an `excludeGlobs` option to skip the scout's own tests and fixtures (preventing recursive self-reference). Defaults:
- `**/tools/learning-loop-mcp/scout/test-fixtures/**` (the mini-codebase)
- `**/tools/learning-loop-mcp/scout/__tests__/**` (the scout's own tests, future-proofing)

The orchestrator is the ONLY module that reads/writes files. Pure functions are pure. This boundary is the scout's "no test file modifications" guarantee — the orchestrator's `writeMarkdown` path writes to `docs/journals/` and `scout/fixtures/`, never to `__tests__/`.

### Step 2.6 — Implement `index.js` (barrel export)

```js
// index.js
export { classifyBucket } from "./bucket-classifier.js";
export { detectDangling } from "./dangling-detector.js";
export { analyzeGaps } from "./gap-analyzer.js";
export { estimateBudget } from "./budget-estimator.js";
export { runScout } from "./run-scout.js";
```

Tests import from the barrel; the orchestrator is called via `node tools/learning-loop-mcp/scout/run-scout.js --write`.

### Step 2.7 — Verify all Phase 1 tests turn GREEN

Run `pnpm test` and assert:
- 24+ new tests pass
- 0 new tests fail
- 0 existing tests regress

If any test fails:
- **Test was wrong in Phase 1**: fix the test, document the fix, re-run.
- **Implementation is wrong**: fix the implementation, re-run.

The TDD loop is: red → green → refactor. Phase 2 is the green step.

### Step 2.8 — Run scout against the real test code base (smoke test)

Run `node tools/learning-loop-mcp/scout/run-scout.js --write` to produce the real `scout-output.json` fixture. Inspect:
- `inventory.length >= 50` (we have 77 test files in `tools/learning-loop-mcp/__tests__/`, per F1 red team finding)
- `bucket_distribution.C` is 0 or near-0
- `budget_table` has an entry for `cold-session-discoverability.test.cjs#test 1` with `risk: "critical"`
- `gap_table` has at least 1 entry (we expect gaps per brainstorm's "Estimated findings count")

This is a smoke test for Phase 3 — the closeout phase will use the same JSON to file findings.

## Success Criteria

- [ ] All 4 pure-function modules exist at `tools/learning-loop-mcp/scout/<name>.js`
- [ ] `run-scout.js` orchestrator exists and produces a valid `ScoutOutput`
- [ ] `index.js` barrel export exists
- [ ] `pnpm test` reports 24+ new passing tests, 0 failing
- [ ] `pnpm test` reports 0 regressions in existing 852+ tests
- [ ] `node tools/learning-loop-mcp/scout/run-scout.js --write` produces a valid `scout-output.json`
- [ ] The smoke test assertions pass: `inventory.length >= 50`, `bucket_distribution.C == 0`, `budget_table` contains the cold-session test 1 critical entry
- [ ] No `node -e` escape-hatch usage in the implementation (per F3 of the 260608-1015 plan's red team findings)
- [ ] `package.json` `test` script glob includes `tools/learning-loop-mcp/__tests__/scout-*.test.js` (verify the existing glob catches it; the default is `tools/**/*.test.js` which should match)
- [ ] The fixture `scout-output.json` is regenerable (per F5 — the fixture is a snapshot, not a source of truth)
- [ ] The orchestrator's `walkProject` accepts `excludeGlobs` and defaults exclude the scout's own tests and fixtures (per F12)

## Risk Assessment

- **Risk: Pure functions accidentally read files** — A bug in `parseBlockRanges` could mistakenly read a fixture file. **Mitigation:** the pure functions take strings/objects only; the orchestrator is the only file reader. The test suite asserts the pure functions are pure (no mocking needed because they can't have side effects).
- **Risk: Orchestrator writes to wrong directory** — A bug in the markdown output path could write to `__tests__/`. **Mitigation:** the orchestrator's `writeMarkdown` path is a constant: `docs/journals/<DATE>-test-scout-report.md`. The Phase 3 closeout script asserts `git status --porcelain` shows no modifications under `__tests__/`.
- **Risk: `acorn` is not a dependency** — The implementation may need AST parsing for `parseBlockRanges`. **Mitigation:** use regex (not AST) for block detection. Regex is sufficient for the 6 patterns we care about (test, it, beforeEach, afterEach, before, after). If a future pattern needs AST, the dependency can be added in a separate plan.
- **Risk: `meta_state_report` is called accidentally** — A bug in the orchestrator could wire `meta_state_report` into the wrong path. **Mitigation:** the orchestrator returns a `ScoutOutput` JSON object; it does NOT call any MCP tool. The `meta_state_report` call is in Phase 3's closeout script, not in `run-scout.js`.
- **Risk: Latency constants drift** — The default latencies in `budget-estimator.js` are from the brainstorm C5 (one trace). Future re-measurement may update them. **Mitigation:** the latencies are configurable via `process.env.SCOUT_BUDGET_LATENCIES`; the closeout script in Phase 3 uses the default values (per the brainstorm's "Open questions" decision: the scout does not re-measure).

