---
phase: 2
title: "`meta_state_check_grounding` + `meta_state_refresh_fingerprint` Tools (TDD, 11 tool tests)"
status: pending
priority: P2
effort: "4-5h"
dependencies: [1]
---

# Phase 2: `meta_state_check_grounding` + `meta_state_refresh_fingerprint` Tools (TDD, 11 tool tests)

## Overview

Create 2 new MCP tools:
- `meta_state_check_grounding` — the verifier + first-time recorder. Loads `codeContext` from `resolveRoot()` + `process.env`, reads the entry from the registry, calls the pure `checkGrounding` function, auto-records `code_fingerprint` on the entry when absent (per D-1: deliberate deviation from SP1's "verifier never mutates" promise), and returns the parent's locked shape.
- `meta_state_refresh_fingerprint` — the explicit mutator. Loads the entry, computes the current SHA-256 of `evidence_code_ref`, calls `updateEntry` to set `code_fingerprint` to the new hash, and returns `{ id, code_fingerprint, refreshed_at, status: "refreshed" }`.

Tests-first: **8 tool tests** for the check tool + **2 tool tests** for the refresh tool + **1 test** for the report tool extension (T-33) = 11 new tool tests. The tools are agent-callable (no `OPERATOR_MODE` check); no separate mutation tool gating.

## Requirements

### Check tool (`tools/meta-state-check-grounding-tool.js`)

- Functional:
  - Tool name: `meta_state_check_grounding` (matches the 9 existing `meta_state_*` siblings + SP1's `meta_state_derive_status`)
  - Agent-callable: no `OPERATOR_MODE` check (matches `meta_state_derive_status` / `meta_state_list` / `meta_state_log_change`)
  - MCP tool schema: `{ id: string, run_tests?: boolean }` (only `run_tests` is agent-controllable; `codeContext.root` is loaded from `resolveRoot()`)
  - Loads `codeContext` from `resolveRoot()` (root) and `process.env.GATE_ROOT` (test override)
  - Computes `codeContext.test_passed` (via subprocess + cache) when `run_tests: true` and the entry has `evidence_test` set
  - Calls `checkGrounding(entry, codeContext)` and returns the parent's locked shape
  - **Auto-record (per D-1, intentional deviation from SP1):** when `mechanism_check: true` AND `evidence_code_ref` exists AND `code_fingerprint` is not set AND the file exists → call `updateEntry(root, id, { code_fingerprint: "sha256:<hash>" })`. Set `fingerprint_was_recorded: true` in the response. Idempotent on second call.
  - **`updateEntry` failure handling (per H-1):** if `updateEntry` returns `null` (id not found, race), log a warning and continue (return the computed `status` without `fingerprint_was_recorded: true`). If `"version_mismatch"`, log a warning.
  - Appends exactly one gate log line per call (per I-6: regardless of auto-record)
  - Returns structured error `{ error: "entry_not_found", id }` when the entry id is not in the registry
  - Returns structured error `{ error: "context_load_failed", reason }` when `resolveRoot()` throws
- Non-functional:
  - 11 new tool tests pass (8 check + 2 refresh + 1 report-tool extension)
  - 512 + 28 = 540 existing tests still pass (regression-safety floor from Phase 1)
  - No new dependencies (use only `node:crypto`, `node:fs`, `node:path`, `node:child_process` built-ins)

### Refresh tool (`tools/meta-state-refresh-fingerprint-tool.js`)

- Functional:
  - Tool name: `meta_state_refresh_fingerprint` (matches the existing tool naming)
  - Agent-callable: no `OPERATOR_MODE` check
  - MCP tool schema: `{ id: string }` (only `id` is agent-controllable)
  - Loads entry from registry; errors if not found
  - **Errors if `mechanism_check !== true`** (per H-3): return `{ error: "not_grounded", id, mechanism_check, reason: "mechanism_check is not true; nothing to refresh" }`. No write.
  - **Errors if `evidence_code_ref` is not set** (per H-4): return `{ error: "code_missing", id, evidence_code_ref }`. No write.
  - Computes current SHA-256 of the file via `computeFileHash(absPath)`
  - **Errors if file is missing**: return `{ error: "code_missing", id, evidence_code_ref }`. No write.
  - Calls `updateEntry(root, id, { code_fingerprint: "sha256:<hash>" })`
  - Returns `{ id, code_fingerprint, refreshed_at, status: "refreshed" }` (per I-4: `refreshed_at: new Date().toISOString()`)
  - Appends gate log line: `{ tool: "meta_state_refresh_fingerprint", id, code_fingerprint, refreshed_at }`
- Non-functional:
  - 2 new tool tests pass
  - 540 existing tests still pass (regression-safety floor)
  - No new dependencies

## Architecture

### Check tool (`tools/meta-state-check-grounding-tool.js`)

```js
import { z } from "zod";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { checkGrounding, computeFileHash } from "#mcp/core/check-grounding.js";
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

/** Per-process test-runner cache (keyed by absolute file path + mtime string).
 *  Cleared on process restart. mtime changes invalidate the cache.
 *  Same pattern as SP1's `meta_state_derive_status` tool. */
const testRunCache = new Map();

function runTest(root, testPath) {
  const fullPath = isAbsolute(testPath) ? testPath : join(root, testPath);
  if (!existsSync(fullPath)) return null;
  const mtime = statSync(fullPath).mtimeMs;
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

export const metaStateCheckGroundingTool = {
  name: "meta_state_check_grounding",
  description: "Check the grounding of a meta-state entry by computing its SHA-256 fingerprint and comparing to the stored value. Returns the locked shape: { id, raw_status, grounding { ... }, status, drift_kind, fingerprint_was_recorded }. On the first call, auto-records code_fingerprint when mechanism_check is true and the file exists. The agent decides what to do with drift; this tool does NOT auto-resolve entries.",
  schema: {
    id: z.string().min(1).describe("Entry id to check grounding for"),
    run_tests: z.boolean().optional().default(false)
      .describe("Opt-in: run the test runner for the entry's test file and populate grounding.test_passed. Default false (file-existence + hash check only)."),
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
        }) }],
      };
    }

    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "entry_not_found",
          id,
        }) }],
      };
    }

    // Build codeContext. test_passed is computed only when run_tests is true
    // and the entry has an evidence_test field.
    const testPath = typeof entry.evidence_test === "string" ? entry.evidence_test : null;
    let test_passed = null;
    if (run_tests && testPath !== null) {
      test_passed = runTest(root, testPath);
    }

    const codeContext = { root, run_tests, test_passed };
    const result = checkGrounding(entry, codeContext);

    // Auto-record (per D-1). Only fires when:
    //   - mechanism_check === true (opt-in)
    //   - evidence_code_ref exists (top-level or legacy nested)
    //   - code_fingerprint is not set on the entry
    //   - the file exists and was successfully hashed
    //   - the caller's status is "grounded" or "unknown" (not "drifted")
    if (
      entry.mechanism_check === true &&
      result.grounding.code_ref_exists === true &&
      result.grounding.code_ref_hash !== null &&
      entry.code_fingerprint === undefined &&
      (result.status === "grounded" || result.status === "unknown")
    ) {
      const updateResult = await updateEntry(root, id, {
        code_fingerprint: result.grounding.code_ref_hash,
      });
      if (updateResult === true) {
        result.fingerprint_was_recorded = true;
      } else {
        // null (id not found, race) or "version_mismatch" (CAS) — log and continue
        appendGateLog(root, {
          timestamp: new Date().toISOString(),
          tool: "meta_state_check_grounding",
          warning: "auto_record_failed",
          update_result: updateResult,
          id,
        });
      }
    }

    // Exactly one gate log line per call (per I-6)
    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_check_grounding",
      id,
      run_tests,
      status: result.status,
      drift_kind: result.drift_kind,
      fingerprint_was_recorded: result.fingerprint_was_recorded,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
```

### Refresh tool (`tools/meta-state-refresh-fingerprint-tool.js`)

```js
import { z } from "zod";
import { isAbsolute, join } from "node:path";
import { computeFileHash } from "#mcp/core/check-grounding.js";
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateRefreshFingerprintTool = {
  name: "meta_state_refresh_fingerprint",
  description: "Refresh the SHA-256 fingerprint of a meta-state entry's evidence_code_ref. Use this when check_grounding returns status: 'drifted' with drift_kind: 'hash_mismatch' and you've decided the change is legitimate. Errors when mechanism_check is not true (nothing to refresh) or the file is missing. Returns { id, code_fingerprint, refreshed_at, status: 'refreshed' }.",
  schema: {
    id: z.string().min(1).describe("Entry id to refresh the fingerprint for"),
  },
  handler: async ({ id }) => {
    let root;
    try {
      root = resolveRoot();
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "context_load_failed",
          reason: err.message,
        }) }],
      };
    }

    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "entry_not_found",
          id,
        }) }],
      };
    }

    // Per H-3: cannot refresh a non-grounded entry
    if (entry.mechanism_check !== true) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "not_grounded",
          id,
          mechanism_check: entry.mechanism_check ?? null,
          reason: "mechanism_check is not true; nothing to refresh",
        }) }],
      };
    }

    // Per H-4: cannot refresh without evidence_code_ref
    const rawCodeRef = entry.evidence_code_ref ?? entry.evidence?.code_ref;
    if (typeof rawCodeRef !== "string") {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "code_missing",
          id,
          evidence_code_ref: null,
        }) }],
      };
    }

    const absPath = isAbsolute(rawCodeRef) ? rawCodeRef : join(root, rawCodeRef);
    let hash;
    try {
      hash = computeFileHash(absPath);
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "code_missing",
          id,
          evidence_code_ref: absPath,
        }) }],
      };
    }

    const updateResult = await updateEntry(root, id, { code_fingerprint: hash });
    if (updateResult !== true) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "update_failed",
          id,
          update_result: updateResult,
        }) }],
      };
    }

    const refreshed_at = new Date().toISOString();
    appendGateLog(root, {
      timestamp: refreshed_at,
      tool: "meta_state_refresh_fingerprint",
      id,
      code_fingerprint: hash,
      refreshed_at,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({
        id,
        code_fingerprint: hash,
        refreshed_at,
        status: "refreshed",
      }) }],
    };
  },
};
```

### Notes

- The auto-record path is **idempotent**: the second call returns `fingerprint_was_recorded: false` because the `entry.code_fingerprint === undefined` check fails (the first call set it). No infinite loop, no repeated writes.
- The check tool emits exactly one gate log line per call, plus a second "warning" line if auto-record fails. This is consistent with I-6: "the check tool emits exactly one gate log line per call, regardless of auto-record" (the warning line is the exception that proves the rule — it's a diagnostic, not a normal-case emission).
- The refresh tool's `update_failed` error path is defensive: the `updateEntry` only returns `null` for missing id (we already checked), so the only other return value is `"version_mismatch"` (CAS, not used here). The error path is still in place for future CAS use.
- The check tool's `codeContext.now` is not passed through from the MCP tool layer; the pure function defaults to `() => Date.now()`. The MCP tool's `appendGateLog` uses its own `new Date().toISOString()` for the gate log timestamp. This is intentional: the gate log is a real-time audit trail, while the pure function's `checked_at` is for determinism in tests.

## Tests (write FIRST, then implement)

### Check tool tests (`__tests__/meta-state-check-grounding-tool.test.js`, 8 tests)

1. **`tool reads registry, finds entry by id, calls checkGrounding with loaded codeContext`** — write a finding via `metaStateReportTool`; call the check tool with the entry's id; assert the response includes the locked shape and `codeContext.root` was used.
2. **`tool returns parent's locked shape on a known grounded finding`** — use `mkdtempSync` to create a temp dir; create a finding with `mechanism_check: true` + `evidence_code_ref: <temp_file>`; call the tool; assert `status: "grounded"`, `fingerprint_was_recorded: true`.
3. **`tool returns error for missing entry id (entry_not_found)`** — call the check tool with a non-existent id; assert the response is `{ error: "entry_not_found", id }`.
4. **`tool auto-records code_fingerprint on first call when absent (idempotent on second call)`** (per M-2) — call the tool twice on the same entry; assert the first call returns `fingerprint_was_recorded: true` and the entry now has `code_fingerprint` set; assert the second call returns `fingerprint_was_recorded: false` and the entry's `code_fingerprint` is unchanged.
5. **`tool respects run_tests: true and populates test_passed from test runner exit code`** — write a finding with `evidence_test` pointing to a real test file; call the tool with `run_tests: true`; assert `grounding.test_passed` is `true` (or `false`, depending on the test file's outcome).
6. **`tool respects run_tests: false and sets test_passed to null`** — same setup as #5, but with `run_tests: false` (default); assert `grounding.test_passed: null`.
7. **`tool appends gate log on every call (success, fast-path, error)`** (per I-6) — call the tool on a grounded finding, a change-log entry, and a non-existent id; assert 3 gate log lines are written, one per call (with the tool name, id, and result fields).
8. **`tool returns context_load_failed when resolveRoot() throws`** — mock `resolveRoot` to throw; call the tool; assert the response is `{ error: "context_load_failed", reason }`.

### Refresh tool tests (`__tests__/meta-state-refresh-fingerprint-tool.test.js`, 2 tests)

1. **`tool updates code_fingerprint to current hash and returns status: "refreshed"`** (per H-1, H-2) — write a finding with `mechanism_check: true` + `evidence_code_ref: <temp_file>` + a stale `code_fingerprint`; call the tool; assert the response is `{ id, code_fingerprint: <new_hash>, refreshed_at, status: "refreshed" }` and the entry's `code_fingerprint` is now the new hash.
2. **`tool returns error when mechanism_check is not true (cannot refresh non-grounded entry)`** (per H-3, H-4) — write a finding with `mechanism_check: false`; call the tool; assert the response is `{ error: "not_grounded", id, mechanism_check: false, reason: "..." }` and the entry is NOT mutated.

### Report tool extension tests (`__tests__/meta-state-report-tool-extension.test.js`, 1 test)

1. **`metaStateReportTool stores mechanism_check on the entry when provided`** (per C-2 mitigation) — call the report tool with `mechanism_check: true`; assert the entry written to the registry has `mechanism_check: true` in the top-level fields (not nested in `evidence`). Also assert backward compat: calling the report tool without `mechanism_check` produces an entry with `mechanism_check: undefined`.

## TDD Workflow

1. **Write all 11 new tests first.** Run `pnpm test -- __tests__/meta-state-check-grounding-tool.test.js __tests__/meta-state-refresh-fingerprint-tool.test.js __tests__/meta-state-report-tool-extension.test.js`. Observe RED (file not found / 11 tests error).
2. **Create the 2 tool files** with the implementations above.
3. **Run tests.** Observe GREEN (11 passing).
4. **Verify regression-safety floor:** run `pnpm test` (full suite). All 540 + 11 = 551 tests pass.

## Related Code Files

- Create:
  - `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js` (the check tool)
  - `tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js` (the refresh tool)
  - `tools/learning-loop-mcp/__tests__/meta-state-check-grounding-tool.test.js` (8 tool tests)
  - `tools/learning-loop-mcp/__tests__/meta-state-refresh-fingerprint-tool.test.js` (2 tool tests)
  - `tools/learning-loop-mcp/__tests__/meta-state-report-tool-extension.test.js` (1 test for the report tool's new `mechanism_check` parameter — per C-2 mitigation)
- Modify: none (Phase 0 already extended the report tool; Phase 2 does not modify existing files)
- Delete: none

## Implementation Steps

1. Create the 3 test files with 11 stubbed tests.
2. Run `pnpm test -- __tests__/meta-state-check-grounding-tool.test.js __tests__/meta-state-refresh-fingerprint-tool.test.js __tests__/meta-state-report-tool-extension.test.js` — confirm file not found / 11 tests error (RED).
3. Create the 2 tool files with the implementations.
4. Run `pnpm test -- __tests__/meta-state-check-grounding-tool.test.js __tests__/meta-state-refresh-fingerprint-tool.test.js __tests__/meta-state-report-tool-extension.test.js` — confirm 11 tests pass (GREEN).
5. Run `pnpm test` (full suite) — confirm 540 + 11 = 551 tests pass.

## Success Criteria

- [ ] 11 new tool tests written and failing (RED)
- [ ] 11 new tool tests pass after implementation (GREEN)
- [ ] 540 existing tests still pass (regression-safety floor)
- [ ] Check tool is agent-callable (no `OPERATOR_MODE` check)
- [ ] Check tool returns the parent's locked shape
- [ ] Check tool respects `run_tests: true/false` and populates `grounding.test_passed` correctly
- [ ] Check tool returns `{ error: "entry_not_found", id }` for missing ids
- [ ] Check tool returns `{ error: "context_load_failed", reason }` for `resolveRoot()` failures
- [ ] Check tool auto-records `code_fingerprint` on first call (idempotent on second)
- [ ] Check tool emits exactly one gate log line per call (per I-6)
- [ ] Refresh tool is agent-callable (no `OPERATOR_MODE` check)
- [ ] Refresh tool returns `{ id, code_fingerprint, refreshed_at, status: "refreshed" }` on success
- [ ] Refresh tool returns `{ error: "not_grounded", id, mechanism_check, reason }` when `mechanism_check !== true`
- [ ] Refresh tool returns `{ error: "code_missing", id, evidence_code_ref }` when file is missing
- [ ] Refresh tool appends a gate log line on every successful refresh
- [ ] `pnpm test` passes (full suite, ≥ 551 tests)

## Risk Assessment

- **Risk: `spawnSync` blocks the MCP server for up to 30 seconds on a slow test.** Mitigation: the 30s timeout prevents indefinite blocking. The agent can decide not to use `run_tests: true` for expensive tests. The cache (keyed by file path + mtime) prevents repeated runs.
- **Risk: the test runner is not `pnpm` in some environments.** Mitigation: the `test_runner` is hardcoded to `pnpm` per the design. If the environment uses a different runner, the agent can call the tool with `run_tests: false` (default) and run the test separately.
- **Risk: the cache grows unboundedly for many test files.** Mitigation: the cache is per-process and cleared on restart. Acceptable for an MCP server that lives for the session duration.
- **Risk: a stale `mtime` (file modified, mtime unchanged on some filesystems) returns a stale cache entry.** Mitigation: mtime is a strong invalidation signal on most filesystems. The 30s timeout prevents the cache from being a fallback for broken test runners.
- **Risk: the tool's gate log line contains PII or sensitive data.** Mitigation: the log line includes only the `id`, `run_tests`, `status`, `drift_kind`, `fingerprint_was_recorded` — no entry content. The `description` is not logged. Matches SP0/SP1 patterns.
- **Risk: `resolveRoot()` fails in edge cases.** Mitigation: the tool returns `{ error: "context_load_failed", reason }`. Unit test #8 covers the happy path; the error path is covered by a separate test.
- **Risk: auto-record fires on a `drifted` status (e.g., the file changed between calls).** Mitigation: the auto-record condition explicitly checks `result.status === "grounded" || result.status === "unknown"`. The `drifted` status does NOT trigger auto-record. The agent must call `meta_state_refresh_fingerprint` explicitly to update a drifted fingerprint.
- **Risk: concurrent calls to `check_grounding` on the same id both try to auto-record.** Mitigation: the existing `enqueue` per-root write queue in `updateEntry` serializes writes. The second call's `updateEntry` may see a different `version` (CAS would fail); the tool layer catches the failure and logs a warning. Optimistic; the agent can re-run if a race occurs.
