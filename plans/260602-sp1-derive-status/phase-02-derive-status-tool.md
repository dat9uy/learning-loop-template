---
phase: 2
title: "`meta_state_derive_status` Tool (TDD, 10 tool tests)"
status: completed
priority: P2
effort: "3-4h"
dependencies: [1]
---

# Phase 2: `meta_state_derive_status` Tool (TDD, 10 tool tests)

## Overview

Create the new MCP tool `meta_state_derive_status` in `tools/meta-state-derive-status-tool.js`. The tool accepts an `id` (the entry to derive status for) and an optional `run_tests` (opt-in to running the project's test runner for the entry's test file). It loads `codeContext` from `resolveRoot()` + `process.env`, reads the entry from the registry via `readRegistry`, calls the pure `deriveStatus` function, and returns the parent's locked shape. Tests-first: **10 tool tests** (8 original from the brainstorm + 2 added from the pre-plan verification report). The tool is agent-callable (no `OPERATOR_MODE` check); no auto-mutation.

## Requirements

- Functional:
  - Tool name: `meta_state_derive_status` (matches the 6 existing `meta_state_*` siblings)
  - Agent-callable: no `OPERATOR_MODE` check (matches `meta_state_report` / `meta_state_list` / `meta_state_log_change`)
  - MCP tool schema: `{ id: string, run_tests?: boolean }` (only `run_tests` is agent-controllable; `codeContext.root` is loaded from `resolveRoot()`; `test_runner` is a server-side config)
  - Loads `codeContext` from `resolveRoot()` (root) and `process.env.GATE_ROOT` (test override)
  - Computes `codeContext.test_passed` (via subprocess + cache) when `run_tests: true`
  - Calls `deriveStatus(entry, codeContext)` and returns the parent's locked shape
  - Appends a gate log line on each call (matches all sibling tools)
  - Returns structured error `{ error: "entry_not_found", id }` when the entry id is not in the registry
  - Returns structured error `{ error: "context_load_failed", reason }` when `resolveRoot()` throws
- Non-functional:
  - 10 new tool tests pass
  - 475 + 24 = 499 existing tests still pass (regression-safety floor)
  - No new dependencies (use only `node:fs`, `node:path`, `node:child_process` built-ins)

## Architecture

### Tool file (in `tools/meta-state-derive-status-tool.js`)

```js
import { z } from "zod";
import { deriveStatus } from "#mcp/core/derive-status.js";
import { readRegistry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { spawn } from "node:child_process";

/** Per-process test-runner cache (keyed by absolute file path + mtime string).
 *  Cleared on process restart. mtime changes invalidate the cache.
 *  Per H-3 mitigation: cache stores the boolean result only. */
const testRunCache = new Map();

function runTest(root, testPath) {
  const fullPath = isAbsolute(testPath) ? testPath : join(root, testPath);
  if (!existsSync(fullPath)) return null;
  const mtime = require("node:fs").statSync(fullPath).mtimeMs;
  const key = `${fullPath}:${mtime}`;
  if (testRunCache.has(key)) return testRunCache.get(key);
  try {
    const result = spawnSync("pnpm", ["test", "--", fullPath], {
      cwd: root,
      timeout: 30_000,
      encoding: "utf8",
    });
    const passed = result.status === 0;
    testRunCache.set(key, passed);
    return passed;
  } catch {
    testRunCache.set(key, null);
    return null;
  }
}

export const metaStateDeriveStatusTool = {
  name: "meta_state_derive_status",
  description: "Derive the effective status of a meta-state entry by reading its stored references + the current filesystem state. Returns the locked shape: { id, raw_status, derived_status, derivation { kind, signals, checked_at, duration_ms }, drift, recommendation }. The agent decides what to do with the answer; this tool does NOT mutate entries.",
  schema: {
    id: z.string().min(1).describe("Entry id to derive status for"),
    run_tests: z.boolean().optional().default(false)
      .describe("Opt-in: run the test runner for the entry's test file and populate signals.test_passed. Default false (file-existence check only)."),
  },
  handler: async ({ id, run_tests = false }) => {
    let root;
    try {
      root = resolveRoot();
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "context_load_failed",
          reason: err.message,
        })}],
      };
    }

    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "entry_not_found",
          id,
        })}],
      };
    }

    // Build codeContext. test_passed is computed only when run_tests is true
    // and the entry has an evidence_test field (per the H-4 mitigation: the
    // function does not auto-derive a test file path from the code_ref).
    const testPath = typeof entry.evidence_test === "string" ? entry.evidence_test : null;
    let test_passed = null;
    if (run_tests && testPath !== null) {
      test_passed = runTest(root, testPath);
    }

    const codeContext = { root, run_tests, test_passed };
    const result = deriveStatus(entry, codeContext);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_derive_status",
      id,
      run_tests,
      derived_status: result.derived_status,
      drift: result.drift,
      recommendation: result.recommendation,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
```

### Notes

- The tool uses `spawnSync` (not `spawn`) so the result is available before the function returns. This is appropriate for an MCP tool that returns the full result synchronously to the agent.
- The cache key is `absolute_path:mtimeMs`. Two cache entries can exist for the same path if the file is modified between calls; the older entry is effectively shadowed.
- `run_tests: true` is a no-op when the entry has no `evidence_test` field (per the H-4 mitigation: the function does not auto-derive). The agent gets `signals.test_passed: null` and can decide to look for a test file manually.

## Tests (write FIRST, then implement)

Create `__tests__/meta-state-derive-status-tool.test.js` with 10 tests (8 original from the brainstorm + 2 added from the pre-plan verification report).

### Original 8 tests (from the brainstorm)

1. **`tool reads registry, finds entry by id, calls deriveStatus with loaded codeContext`** — write a finding via `metaStateReportTool` (or directly via `writeEntry`); call the derive tool with the entry's id; assert the response includes the locked shape and `codeContext.root` was used (i.e., the derivation reflects the temp directory).
2. **`tool returns parent's locked shape on a known derivable finding (acceptance test: meta-260601T1339Z...)`** — use `mkdtempSync` to create a temp dir; copy the acceptance-test entry into a registry in the temp dir; copy the actual `tools/learning-loop-mcp/lib/source-ref-validator.js` and `tools/learning-loop-mcp/__tests__/source-ref-validator.test.js` files into the temp dir (so `existsSync` returns true); call the tool with the entry's id; assert `derived_status: "resolved-by-mechanism"`, `kind: "mechanism-shipped"`, `recommendation: "resolve"`, `drift: true` (note: `drift: true`, correcting the brainstorm example's typo).
3. **`tool returns kind: "no-signals" fast path for change-log entries`** — write a change-log entry via `metaStateLogChangeTool`; call the derive tool with its id; assert `kind: "no-signals"`, `derived_status: "active-no-signal"`, `drift: false`, `recommendation: "no_action"`.
4. **`tool returns error for missing entry id (not_found)`** — call the derive tool with a non-existent id; assert the response is `{ error: "entry_not_found", id }`.
5. **`tool respects run_tests: true and populates signals.test_passed from test runner exit code`** — write a finding with `evidence_test` pointing to a real test file; call the tool with `run_tests: true`; assert `signals.test_passed` is `true` (or `false`, depending on the test file's outcome). The test uses a deliberately-failing test file to assert the cache and exit code parsing.
6. **`tool respects run_tests: false and sets signals.test_passed to null`** — same setup as #5, but with `run_tests: false` (default); assert `signals.test_passed: null`.
7. **`tool appends a gate log line on each call`** — call the tool; check the gate log file in the temp dir; assert the log line includes `tool: "meta_state_derive_status"`, `id`, `derived_status`, `drift`, `recommendation`.
8. **`tool handles malformed codeContext gracefully (falling back to resolveRoot() default)`** — set `process.env.GATE_ROOT` to a valid temp dir; unset other env vars; call the tool; assert it works (no throw, response is the locked shape).

### Added 2 tests (from the verification report)

9. **`tool uses description-substring lookup is NOT used (id is the only lookup key)`** (per C-2 mitigation documentation) — write a finding with a long description; call the tool with a non-existent id; assert `error: "entry_not_found"`. This locks in that the tool uses `id` (not description substring) — the description-substring lookup is for the acceptance test's helper, not the tool itself.
10. **`tool writes a gate-log line on the change-log fast path`** — write a change-log entry; call the tool; assert the gate log includes the line with the fast-path derived_status.

## TDD Workflow

1. **Write all 10 new tests first.** Run `pnpm test -- __tests__/meta-state-derive-status-tool.test.js`. Observe RED.
2. **Create the tool file** with the implementation above.
3. **Run tests.** Observe GREEN (10 passing).
4. **Verify regression-safety floor:** run `pnpm test` (full suite).

## Related Code Files

- Create:
  - `tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js` (the tool)
  - `tools/learning-loop-mcp/__tests__/meta-state-derive-status-tool.test.js` (the 10 tool tests)
- Modify: none
- Delete: none

## Implementation Steps

1. Create the test file `__tests__/meta-state-derive-status-tool.test.js` with 10 stubbed tests.
2. Run `pnpm test -- __tests__/meta-state-derive-status-tool.test.js` — confirm file not found / 10 tests error (RED).
3. Create the tool file `tools/meta-state-derive-status-tool.js` with the implementation.
4. Run `pnpm test -- __tests__/meta-state-derive-status-tool.test.js` — confirm 10 tests pass (GREEN).
5. Run `pnpm test` (full suite) — confirm 499 + 10 = 509 tests pass in the relevant surface.

## Success Criteria

- [ ] 10 new tool tests written and failing (RED)
- [ ] 10 new tool tests pass after implementation (GREEN)
- [ ] 499 existing tests still pass (regression-safety floor)
- [ ] Tool is agent-callable (no `OPERATOR_MODE` check)
- [ ] Tool returns the parent's locked shape
- [ ] Tool respects `run_tests: true/false` and populates `signals.test_passed` correctly
- [ ] Tool returns `{ error: "entry_not_found", id }` for missing ids
- [ ] Tool returns `{ error: "context_load_failed", reason }` for `resolveRoot()` failures
- [ ] Gate log line written on every call (success, fast-path, error)
- [ ] `pnpm test` passes (full suite, ≥ 509 tests)

## Risk Assessment

- **Risk: `spawnSync` blocks the MCP server for up to 30 seconds on a slow test.** Mitigation: the 30s timeout prevents indefinite blocking. The agent can decide not to use `run_tests: true` for expensive tests. The cache (keyed by file path + mtime) prevents repeated runs.
- **Risk: the test runner is not `pnpm` in some environments.** Mitigation: the `test_runner` is hardcoded to `pnpm` per the design. If the environment uses a different runner, the agent can call the tool with `run_tests: false` (default) and run the test separately. SP2 (grounding) is the place to handle runner-detection.
- **Risk: the cache grows unboundedly for many test files.** Mitigation: the cache is per-process and cleared on restart. For an MCP server that lives for the session duration, the cache is bounded by the number of distinct test files queried in the session. Acceptable.
- **Risk: a stale `mtime` (file modified, mtime unchanged on some filesystems) returns a stale cache entry.** Mitigation: mtime is a strong invalidation signal on most filesystems. The 30s timeout prevents the cache from being a fallback for broken test runners. SP2 may switch to a content-hash cache.
- **Risk: the `entry_not_found` error path is hit for valid entries that have a different id format.** Mitigation: the tool uses the `id` field as-is; the registry stores the id verbatim. The agent is responsible for using the correct id.
- **Risk: the tool's gate log line contains PII or sensitive data.** Mitigation: the log line includes only the `id`, `run_tests`, `derived_status`, `drift`, `recommendation` — no entry content. The `description` is not logged. This matches the SP0 `meta_state_log_change` pattern.
- **Risk: the tool's `codeContext` loading fails when `GATE_ROOT` is set in the env but the path is invalid.** Mitigation: `resolveRoot()` throws a structured error; the tool returns `{ error: "context_load_failed", reason }`. The unit test #8 covers the happy path; the error path is covered by a separate test.
