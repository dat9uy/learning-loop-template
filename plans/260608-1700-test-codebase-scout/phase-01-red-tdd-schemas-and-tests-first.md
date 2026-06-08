---
phase: 1
title: "Red (TDD schemas and tests first)"
status: pending
effort: ~2h
dependencies: []
---

# Phase 1: Red (TDD schemas and tests first)

## Overview

Write the scout's output schema (JSON Schema fixture) and 24+ failing tests covering all 5 deliverables from the brainstorm. **No implementation in this phase** — every test is RED. Phase 2 turns them GREEN.

**Why this phase matters**: the criteria glossary (Layer 1 of the brainstorm report) is the source of truth for both the scout's classification and the future fixes' acceptance criteria. Locking the criteria as tests BEFORE the implementation prevents drift between the brainstorm's intent and the code that realizes it. If a test is wrong, the implementation will be wrong; if a test is missing, the implementation will miss a deliverable.

## Requirements

- **Functional:**
  - Output schema validates against AJV (already a project dependency)
  - All 5 deliverables have at least one test
  - All 5 dangling patterns (D1-D5) have at least one test
  - All 4 MCP-first buckets (A/B/C/D) have at least one test
  - All 4 anti-MCP phrases (per brainstorm C4) have at least one test
  - All 5 contract surfaces (MCP tools, schemas, gate patterns, entry kinds, error paths) have at least one test
  - Idempotency: re-running the scout on the same input produces the same output (modulo envelope `run_timestamp`)
- **Non-functional:**
  - Tests run via `node --test` (built-in, no new dependencies)
  - Tests use `mkdtempSync(join(tmpdir(), "scout-test-"))` for isolation (mirroring `meta-state-patch-tool.test.js` template)
  - No test depends on the real project test code base (uses synthetic mini-codebases in fixtures)

## Architecture

The scout is decomposed into 4 pure-function modules + 1 orchestrator. Phase 1 writes tests for the 4 pure functions + the orchestrator's JSON output validation. The pure functions are:

| Module | Signature | Responsibility |
|--------|-----------|---------------|
| `bucket-classifier.js` | `(testFilePath, sourceCode) → { bucket, reason }` | C1 — classify a test into A/B/C/D |
| `dangling-detector.js` | `(testFilePath, sourceCode, resolvedFindings) → DanglingMatch[]` | C2 — run 5 dangling pattern checks |
| `gap-analyzer.js` | `(contractSurface, testFiles) → GapReport` | C3 — compute coverage of contract surface |
| `budget-estimator.js` | `(testFilePath, promptText) → BudgetEstimate` | C5 — estimate timeout utilization |
| `run-scout.js` | `(projectRoot, options) → ScoutOutput` | Orchestrator: walks project, calls pure functions, returns JSON conforming to `scout-output.schema.json` |

**Test isolation pattern** (mirroring `tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js`):
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function setup() {
  const tempDir = mkdtempSync(join(tmpdir(), "scout-test-"));
  return tempDir;
}
```

## Related Code Files

- **Create:**
  - `tools/learning-loop-mcp/scout/scout-output.schema.json` (~80 lines) — JSON Schema for the scout's output fixture
  - `tools/learning-loop-mcp/scout/test-fixtures/mini-codebase/__tests__/bucket-a.test.js` (synthetic test file for bucket A)
  - `tools/learning-loop-mcp/scout/test-fixtures/mini-codebase/__tests__/bucket-b.test.js` (synthetic test file for bucket B)
  - `tools/learning-loop-mcp/scout/test-fixtures/mini-codebase/__tests__/bucket-c.test.js` (synthetic test file for bucket C)
  - `tools/learning-loop-mcp/scout/test-fixtures/mini-codebase/__tests__/bucket-d.test.js` (synthetic test file for bucket D)
  - `tools/learning-loop-mcp/scout/test-fixtures/mini-codebase/__tests__/dangling-d1.test.js` (asserts on `evidence.code_ref`)
  - `tools/learning-loop-mcp/scout/test-fixtures/mini-codebase/__tests__/dangling-d3.test.js` (imports removed tool)
  - `tools/learning-loop-mcp/__tests__/scout-bucket-classifier.test.js` (~200 lines, 8 tests)
  - `tools/learning-loop-mcp/__tests__/scout-dangling-detector.test.js` (~250 lines, 8 tests)
  - `tools/learning-loop-mcp/__tests__/scout-gap-analyzer.test.js` (~250 lines, 6 tests)
  - `tools/learning-loop-mcp/__tests__/scout-budget-estimator.test.js` (~200 lines, 4 tests)
  - `tools/learning-loop-mcp/__tests__/scout-run-scout.test.js` (~150 lines, 3 integration tests + 1 idempotency test)
- **Modify:** None
- **Delete:** None

## Implementation Steps

### Step 1.1 — Write the output schema (TDD contract first)

**File**: `tools/learning-loop-mcp/scout/scout-output.schema.json`

The schema defines the shape of the scout's JSON output. It is the contract between Phase 1 (tests) and Phase 2 (implementation). Use JSON Schema draft-07 (the AJV default).

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://learning-loop-mcp.local/scout/scout-output.schema.json",
  "title": "Test Codebase Scout Output",
  "type": "object",
  "required": ["scout_version", "run_timestamp", "project_root", "inventory", "bucket_distribution", "dangling_matches", "gap_table", "budget_table"],
  "properties": {
    "scout_version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "run_timestamp": { "type": "string", "format": "date-time" },
    "project_root": { "type": "string" },
    "inventory": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["file", "last_modified", "test_count", "bucket", "dangling", "gap"],
        "properties": {
          "file": { "type": "string" },
          "last_modified": { "type": "string", "format": "date-time" },
          "test_count": { "type": "integer", "minimum": 0 },
          "bucket": { "enum": ["A", "B", "C", "D"] },
          "bucket_reason": { "type": "string" },
          "dangling": { "type": "boolean" },
          "dangling_patterns": { "type": "array", "items": { "enum": ["D1", "D2", "D3", "D4", "D5"] } },
          "gap": { "type": "boolean" }
        }
      }
    },
    "bucket_distribution": {
      "type": "object",
      "required": ["A", "B", "C", "D"],
      "properties": {
        "A": { "type": "integer", "minimum": 0 },
        "B": { "type": "integer", "minimum": 0 },
        "C": { "type": "integer", "minimum": 0 },
        "D": { "type": "integer", "minimum": 0 }
      }
    },
    "dangling_matches": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["file", "pattern", "line", "match", "suggested_fix"],
        "properties": {
          "file": { "type": "string" },
          "pattern": { "enum": ["D1", "D2", "D3", "D4", "D5"] },
          "line": { "type": "integer", "minimum": 1 },
          "match": { "type": "string" },
          "suggested_fix": { "type": "string" }
        }
      }
    },
    "gap_table": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["surface", "total", "covered", "percent", "missing"],
        "properties": {
          "surface": { "enum": ["mcp-tools", "schemas", "gate-patterns", "entry-kinds", "error-paths"] },
          "total": { "type": "integer", "minimum": 0 },
          "covered": { "type": "integer", "minimum": 0 },
          "percent": { "type": "number", "minimum": 0, "maximum": 100 },
          "missing": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "budget_table": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["file", "test", "expected_file_reads", "wall_clock_estimate", "timeout", "utilization", "risk"],
        "properties": {
          "file": { "type": "string" },
          "test": { "type": "string" },
          "expected_file_reads": { "type": "integer", "minimum": 0 },
          "wall_clock_estimate": { "type": "number", "minimum": 0 },
          "timeout": { "type": "number", "minimum": 0 },
          "utilization": { "type": "number", "minimum": 0 },
          "risk": { "enum": ["low", "medium", "high", "critical"] }
        }
      }
    }
  }
}
```

### Step 1.2 — Synthetic mini-codebase fixtures

**Files**: `tools/learning-loop-mcp/scout/test-fixtures/mini-codebase/__tests__/bucket-{a,b,c,d}.test.js`, `dangling-d{1,3}.test.js`

These are 6 tiny synthetic test files that exercise the bucket classifier and dangling detector. The mini-codebase is a real directory on disk so the scout can walk it in Step 1.7 integration tests.

**bucket-a.test.js** (5 lines) — pure MCP calls, no I/O:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
// (no file I/O; mock setup in beforeEach would be a bucket-A still)
// ...
```

**bucket-b.test.js** (10 lines) — MCP calls + I/O in beforeEach only:
```js
import { test, beforeEach } from "node:test";
import { mkdtempSync } from "node:fs";
// ...
```

**bucket-c.test.js** (15 lines) — direct `writeEntry` import (anti-pattern):
```js
import { test } from "node:test";
import { writeEntry } from "../../core/meta-state.js"; // BUG: should use meta_state_report
// ...
```

**bucket-d.test.js** (20 lines) — spawns `droid exec`:
```js
import { test } from "node:test";
import { spawn } from "node:child_process";
// spawn("droid", ["exec", "--auto", "low", prompt], ...)
```

**dangling-d1.test.js** — asserts on removed schema field:
```js
assert.equal(finding.evidence.code_ref, "x"); // BUG: removed in meta-260607T0008Z
```

**dangling-d3.test.js** — imports a removed tool:
```js
import { removedTool } from "../tools/removed-tool-that-no-longer-exists.js"; // BUG
```

### Step 1.3 — Bucket classifier tests (8 tests)

**File**: `tools/learning-loop-mcp/__tests__/scout-bucket-classifier.test.js`

All 8 tests are RED initially. They will fail with `Cannot find module '../scout/bucket-classifier.js'`.

| # | Test name | Input | Expected bucket | Expected reason |
|---|-----------|-------|-----------------|-----------------|
| 1 | `bucket A: test with only MCP calls` | Synthetic A file | "A" | "no file I/O; MCP-only logic" |
| 2 | `bucket B: test with I/O in beforeEach only` | Synthetic B file | "B" | "I/O in setup/teardown blocks only" |
| 3 | `bucket C: test with direct writeEntry import` | Synthetic C file | "C" | "writes via core/meta-state.js#writeEntry in test logic" |
| 4 | `bucket D: test that spawns droid exec` | Synthetic D file | "D" | "spawns child_process with droid binary" |
| 5 | `bucket A: real meta-state-patch-tool.test.js` | The real file | "A" | Verify the classifier agrees on a real bucket-A file |
| 6 | `bucket D: real cold-session-discoverability.test.cjs` | The real file | "D" | Verify the classifier agrees on the reference bucket-D file |
| 7 | `classifier returns bucket_reason with line citation` | Synthetic C file | "C" with `bucket_reason` containing `:LINE` | Per brainstorm § Implementation Considerations |
| 8 | `classifier handles empty source` | Empty string | `{ bucket: "error", reason: "empty source" }` | Per F8 red team finding — empty source is not a valid test, must NOT be classified as bucket A |
| 9 | `classifier handles nested describe blocks` | Synthetic file with `describe("outer", () => { describe("inner", () => { test("...", () => {...}) }) })` | "A" with `bucket_reason` referencing the outer describe | Per F3 red team finding — regex is 1-level deep, counts outermost test |

### Step 1.4 — Dangling detector tests (8 tests)

**File**: `tools/learning-loop-mcp/__tests__/scout-dangling-detector.test.js`

All 8 tests are RED initially. They fail with `Cannot find module '../scout/dangling-detector.js'`.

| # | Test name | Input | Expected match |
|---|-----------|-------|----------------|
| 1 | `D1: detects evidence.code_ref in assertion` | Synthetic D1 file | 1 match with pattern: D1, line: <N> |
| 2 | `D2: detects assertion on resolved finding status` | Mock resolved findings + test that asserts `status === 'active'` | 1 match with pattern: D2 |
| 3 | `D3: detects import of removed tool` | Synthetic D3 file | 1 match with pattern: D3, suggested_fix: "remove import" |
| 4 | `D4: detects stale fixture (file not modified in 30+ days, no current test refs)` | Synthetic fixture file with old mtime | 1 match with pattern: D4, requires_runtime_check: true |
| 5 | `D5: detects hardcoded TOLERANCES array` | Test with `const TOLERANCES = [10, 20, 30];` | 1 match with pattern: D5 |
| 6 | `no false positives: clean test file produces 0 matches` | Real meta-state-patch-tool.test.js | 0 matches |
| 7 | `multiple patterns on same file: combines D1 + D3 matches` | Synthetic file with both patterns | 2 matches |
| 8 | `D5: skips TOLERANCES with explanatory comment containing intentional/expected/computed/derived keyword` | Test with `const TOLERANCES = [10, 20, 30]; // expected drift` | 0 matches (comment contains "expected") |
| 8a | `D5: flags TOLERANCES with vague comment` | Test with `const TOLERANCES = [10, 20, 30]; // drift tolerance` | 1 match (per F7 red team — vague "tolerance" comment does NOT suppress) |

### Step 1.5 — Gap analyzer tests (6 tests)

**File**: `tools/learning-loop-mcp/__tests__/scout-gap-analyzer.test.js`

All 6 tests are RED initially.

| # | Test name | Input | Expected gap |
|---|-----------|-------|--------------|
| 1 | `MCP tool surface: detects uncovered tool` | Contract surface with 3 tools, test files referencing 2 of them | gap_table entry: surface=mcp-tools, total=3, covered=2, percent=66.67, missing=["<uncovered-tool>"] |
| 2 | `Schema surface: detects uncovered schema` | 4 schema filenames, 0 test files reference one of them | gap_table entry: surface=schemas, total=4, covered=3, percent=75, missing=["<uncovered-schema>.schema.json"] |
| 3 | `Gate pattern surface: detects uncovered pattern` | 5 gate patterns, 0 tests reference one of them | gap_table entry: surface=gate-patterns, total=5, covered=4, percent=80, missing=["<uncovered-pattern>"] |
| 4 | `Entry kind surface: detects uncovered entry kind` | 4 entry kinds, 0 tests reference `loop-design` | gap_table entry: surface=entry-kinds, total=4, covered=3, percent=75, missing=["loop-design"] |
| 5 | `Error path surface: detects uncovered error path` | 2 error paths (invalid severity), 0 tests cover it | gap_table entry: surface=error-paths, total=2, covered=1, percent=50, missing=["invalid-severity-rejection"] |
| 6 | `integration: real test code base produces non-empty gap_table` | Run against `tools/learning-loop-mcp/__tests__/` | gap_table has at least 3 entries (per F2 red team — `>= 1` passes vacuously if analyzer is broken; `>= 3` is a stronger signal) |

### Step 1.6 — Budget estimator tests (4 tests)

**File**: `tools/learning-loop-mcp/__tests__/scout-budget-estimator.test.js`

All 4 tests are RED initially.

| # | Test name | Input | Expected utilization |
|---|-----------|-------|----------------------|
| 1 | `low risk: prompt with 0 file reads, 2 MCP calls` | Static prompt string | utilization < 30%, risk: "low" |
| 2 | `medium risk: prompt with 3 file reads, 4 MCP calls` | Static prompt string | utilization 50-70%, risk: "medium" |
| 3 | `high risk: prompt with 6 file reads, 0 MCP calls` | Static prompt string matching the cold-session test 1 pattern | utilization > 100%, risk: "critical" |
| 4 | `cold-session test 1 prompt reproduces the 1522Z hang estimate` | The real cold-session test 1 prompt | utilization > 100% (per meta-260608T1522Z trace); the test LOCKS the criterion so future regressions are caught |

### Step 1.7 — Run-scout integration tests (3 + 1 idempotency)

**File**: `tools/learning-loop-mcp/__tests__/scout-run-scout.test.js`

All 4 tests are RED initially.

| # | Test name | What it asserts |
|---|-----------|-----------------|
| 1 | `run-scout walks a mini-codebase and produces a valid ScoutOutput` | Run scout on `scout/test-fixtures/mini-codebase/`; assert the output is valid JSON conforming to `scout-output.schema.json` |
| 2 | `run-scout against the real test code base produces a non-empty inventory` | Run scout on `tools/learning-loop-mcp/__tests__/`; assert `inventory.length >= 50` (we have 77 test files per the LS) |
| 3 | `run-scout against the real test code base surfaces the cold-session test 1 hang` | Run scout on `tools/learning-loop-mcp/__tests__/`; assert `budget_table` has an entry for `cold-session-discoverability.test.cjs#test 1` with `risk: "critical"` |
| 4 | `idempotency: re-running run-scout produces the same output (modulo run_timestamp and inventory[].last_modified)` | Run scout twice on the mini-codebase; assert the JSON output is byte-identical after masking `run_timestamp` AND `inventory[].last_modified` (per F9 red team — both are outside the content hash) |

### Step 1.8 — Verify all tests are RED

Run `pnpm test` (or `node --test 'tools/learning-loop-mcp/__tests__/scout-*.test.js'`). All 24+ new tests should fail with `Cannot find module '../scout/<module>.js'`. This is the **RED** state — every test fails because the implementation does not exist yet.

If any test passes in Phase 1, the test is wrong (testing the absence of a module) — fix the test before proceeding to Phase 2.

## Success Criteria

- [ ] `scout-output.schema.json` exists at `tools/learning-loop-mcp/scout/scout-output.schema.json`
- [ ] `scout/test-fixtures/mini-codebase/__tests__/` has 6 synthetic test files (bucket-a, bucket-b, bucket-c, bucket-d, dangling-d1, dangling-d3)
- [ ] 5 new test files exist at `tools/learning-loop-mcp/__tests__/scout-*.test.js` (bucket-classifier, dangling-detector, gap-analyzer, budget-estimator, run-scout)
- [ ] `pnpm test` reports 24+ new failing tests, 0 new passing tests
- [ ] Each failing test reports a `Cannot find module '../scout/<name>.js'` error (or similar import-resolution error)
- [ ] No test passes in Phase 1 (all are RED by design)
- [ ] All existing 852+ tests still pass (no regressions from adding test files to the project)

## Risk Assessment

- **Risk: Tests depend on the real project test code base** — Tests 5-8 in the bucket classifier, test 6 in the dangling detector, and tests 2-3 in run-scout use real project files. If those files change between Phase 1 and Phase 2, tests may pass/fail inconsistently. **Mitigation:** Tests 2-3 in run-scout are the "integration" tests; they are expected to be slow and are the LAST tests to turn GREEN in Phase 2. Tests 5-6 in the bucket classifier are also slow (they read the real file); tag them with `node:test`'s `skip` for CI environments where the real file is not available. (Default: run them; they are fast enough.)
- **Risk: Synthetic mini-codebase drift** — If a future refactor changes the bucket classifier's behavior, the mini-codebase may no longer match. **Mitigation:** the mini-codebase is committed; its content is the test contract. If a future change wants to redefine a bucket, it must update the mini-codebase AND the tests in the same commit.
- **Risk: Schema is over-specified** — A schema that is too strict may reject valid scout output (e.g., a new field added in Phase 2 that the schema doesn't allow). **Mitigation:** the schema uses `additionalProperties: true` in the top-level object (not shown in the snippet above; add it explicitly); only the `required` arrays are strict.

