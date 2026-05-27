---
phase: 1
title: "Tests-First MCP Validation + CLI Shim"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Tests-First MCP Validation + CLI Shim

## Overview

Write tests that define the contract BEFORE moving any files. Tests lock in the exact behavior of `index_validate` with negative fixtures and the CLI shim. They will initially fail or reference non-existent paths — that is expected. They become the acceptance criteria for Phases 2-4.

## Requirements

- Functional: MCP `index_validate` with `include_negative_fixtures: true` returns same result as current CLI `runNegativeFixtures`.
- Functional: CLI shim spawns MCP server, calls `index_validate`, and exits with matching code.
- Non-functional: Tests run with Node native test runner. No new dependencies.

## Architecture

### Test File: `tools/learning-loop-mcp/__tests__/validation-centralization.test.js`

Three test suites:

1. **Negative fixture parity** — compares MCP `index_validate` output against direct `runNegativeFixtures` call.
2. **CLI shim spawn** — spawns `node tools/validate-records-cli.js`, checks exit code and stdout.
3. **Core module import** — verifies all moved validation modules are importable from new paths.

## Implementation Steps

1. Read current `validate-records.js` to capture exact `runNegativeFixtures` fixture cases and expected substrings.
2. Read `tools/learning-loop-mcp/tools/validate-records-tool.js` to understand current `index_validate` schema.
3. Create `tools/learning-loop-mcp/__tests__/validation-centralization.test.js`:
   - Test A: Call `runValidateRecords` directly with `includeNegativeFixtures: true`. Assert 0 errors (baseline — existing real records are valid).
   - Test B: Call a helper `runNegativeFixtures(root)` directly. Assert each of the 26 cases produces its expected substring. Use the exact case list from `validate-records.js:runNegativeFixtures`.
   - Test C: Spawn `node tools/validate-records-cli.js --dry-run`. Assert exit code 0 and JSON output contains `record_count`.
   - Test D: Import each validation module from its new path (e.g., `#mcp/core/record-loader.js`). Currently these imports will fail because files do not yet exist. Wrap in `test.skip` or assert `throws` with the expected path — then flip to real import once Phase 2 lands.
4. Run `pnpm test` — confirm new tests are discovered and (intentionally) fail or skip.
5. Commit: `git add -A && git commit -m "test(validation): add TDD contract for MCP centralization"`.

## Code Snippet: Test Contract

```js
import { test } from "node:test";
import assert from "node:assert";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

test("negative fixture cases match CLI contract", async () => {
  // Will be implemented once modules are moved
  const { runNegativeFixtures } = await import("#mcp/core/negative-fixture-runner.js");
  const errors = runNegativeFixtures(ROOT, false);
  assert.deepStrictEqual(errors, []);
});

test("CLI shim spawns MCP server and returns JSON", async () => {
  const result = spawnSync("node", [join(ROOT, "tools/validate-records-cli.js"), "--dry-run"], {
    encoding: "utf8",
    timeout: 10000,
  });
  const parsed = JSON.parse(result.stdout.trim());
  assert.ok(parsed.record_count >= 0);
  assert.strictEqual(result.status, 0);
});
```

## Success Criteria

- [ ] `tools/learning-loop-mcp/__tests__/validation-centralization.test.js` created with 4+ test cases.
- [ ] Tests are committed before any Phase 2 file moves.
- [ ] `pnpm test` discovers new test file (failures are expected at this stage).
- [ ] Exact fixture case list and expected substrings match `validate-records.js` current state.
