---
phase: 4
title: "MCP connection discoverability (extend existing loop-surface-inject hook, TDD, 3 tests)"
status: completed
priority: P2
effort: "2h"
dependencies: ["phase-3"]
---

# Phase 4: MCP Connection Discoverability (Extend `loop-surface-inject.cjs`)

## Overview

This phase EXTENDS the existing Droid `SessionStart` hook at `.factory/hooks/loop-surface-inject.cjs`. That hook already does a real MCP probe (spawn the MCP server, send JSON-RPC `initialize`, call `loop_describe({ tier: 'summary' })`); the gap is the failure-reporting. On failure, the hook currently silently exits. This phase adds a catch branch that:
1. Logs a `meta_state_report` finding via `core/meta-state.js#writeEntry` (with the new `session_id` field for idempotency)
2. Surfaces an operator-friendly banner in the session-start output

The probe is unchanged — we inherit the existing spawn+initialize+call protocol. The added responsibility is error reporting.

TDD structure: 3 new tests lock the contract (hook logs finding on failure; hook no-ops on success; end-to-end failure creates a finding that surfaces in `meta_state_query_drift`). 1 file modify (`.factory/hooks/loop-surface-inject.cjs`).

## Requirements

- **Functional:**
  - When `spawnAndCall` (or any other probe step) fails or times out, the hook:
    - Logs a `meta_state_report` finding with `category: 'mcp-tool-missing'`, `subtype: 'mcp-connection'`, `description: 'MCP server probe failed at session start; SP0-SP3 tools may be unreachable in this session. ...'`, `evidence_code_ref: 'tools/learning-loop-mcp/server.js'`, and `session_id: <Droid session id>`.
    - The finding is only logged once per session (idempotent via the `session_id` field). The check reads `readRegistry(root)` and looks for an existing `active` or `reported` finding with the same `session_id` before writing.
    - Surfaces a banner in the operator's session-start output. The banner is printed to stdout (matching the existing hook's `console.log(block)` pattern). The banner content is operator-friendly.
  - When the probe succeeds, the hook no-ops (no finding, no banner) — current behavior, no regression.
  - The hook remains async; it must not block session start. The error-handling branch runs in the existing async path; `setImmediate` is used to defer the meta_state write to a non-blocking point.
- **Non-functional:**
  - The hook's existing success path (`spawnAndCall` returns a summary, `formatBlock` is invoked, `console.log(block)` is called) is unchanged.
  - The hook's existing failure path (currently `try/catch` that returns `null`) is extended, not replaced.
  - The new meta_state write uses the canonical `core/meta-state.js#writeEntry` function (atomic, CAS-safe). The hook dynamically imports the module to avoid loading costs in the no-op case.
  - The `session_id` is derived from the Droid hook input (the `session_id` field on the input JSON if present, else from `DROID_SESSION_ID` env var, else from `unknown-${Date.now()}` as a fallback). The exact source is TBD during cook; the schema accepts any string.
  - The hook respects the existing 10-second timeout from the existing implementation. The error-reporting branch fires after the timeout, not before.

## Architecture

### Existing hook (`loop-surface-inject.cjs`) — the diff

```js
// BEFORE (existing main function, simplified):
async function main(inputArg, envArg, spawnImpl) {
  // ... input parsing and guards ...
  const serverCfg = mcpCfg.mcpServers && mcpCfg.mcpServers["learning-loop-mcp"];
  if (!serverCfg) return null;

  const spawnFn = spawnImpl || spawnAndCall;
  try {
    const summary = await spawnFn(serverCfg, cwd);
    if (summary) {
      return formatBlock(summary);
    }
    return null;
  } catch {
    return null;  // <-- Silent failure. This is the gap.
  }
}

// AFTER (Phase 4 change):
async function main(inputArg, envArg, spawnImpl) {
  // ... input parsing and guards ...
  const serverCfg = mcpCfg.mcpServers && mcpCfg.mcpServers["learning-loop-mcp"];
  if (!serverCfg) return null;

  const spawnFn = spawnImpl || spawnAndCall;
  try {
    const summary = await spawnFn(serverCfg, cwd);
    if (summary) {
      return formatBlock(summary);
    }
    // spawnAndCall returned null (e.g., child exited without responding).
    // This is also a failure — report it.
    await reportMcpConnectionFailure(input, env, cwd, "probe_returned_null");
    return null;
  } catch (err) {
    await reportMcpConnectionFailure(input, env, cwd, err.message ?? "probe_threw");
    return null;
  }
}

async function reportMcpConnectionFailure(input, env, cwd, reason) {
  const { writeEntry, generateId, readRegistry } = await import(
    path.join(cwd, "tools/learning-loop-mcp/core/meta-state.js")
  );
  const sessionId = input?.session_id ?? env?.DROID_SESSION_ID ?? `unknown-${Date.now()}`;

  // Idempotency: skip if a finding for this session is already active or reported.
  const existing = readRegistry(cwd).find(e =>
    e.entry_kind === "finding" &&
    e.session_id === sessionId &&
    (e.status === "active" || e.status === "reported")
  );
  if (existing) return;

  const id = generateId("mcp-connection-missing");
  await writeEntry(cwd, {
    id,
    entry_kind: "finding",
    category: "mcp-tool-missing",
    severity: "warning",
    affected_system: "mcp-tools",
    subtype: "mcp-connection",
    description: `MCP server probe failed at session start (reason=${reason}, session_id=${sessionId}). The 5 SP0-SP3 tools (meta_state_log_change, meta_state_derive_status, meta_state_check_grounding, meta_state_refresh_fingerprint, meta_state_query_drift) may be unreachable in this session. Workarounds: (1) use mcp__learning_loop_mcp__* tools directly if the MCP client is connected but the probe failed transiently; (2) reconnect via session config (.mcp.json or Droid hook init); (3) fall back to direct file I/O via Node scripts that import core/meta-state.js (loses appendGateLog audit trail).`,
    evidence_code_ref: "tools/learning-loop-mcp/server.js",
    session_id: sessionId,
    status: "reported",
    auto_resolve: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    acked_at: null,
    resolved_at: null,
    resolved_by: null,
    version: 0,
  });

  // Surface banner (printed to stdout to match the existing hook's console.log pattern).
  console.log(formatMcpFailureBanner(sessionId, reason));
}

function formatMcpFailureBanner(sessionId, reason) {
  return [
    "=== MCP connection probe failed (loop-surface-inject) ===",
    `reason: ${reason}`,
    `session_id: ${sessionId}`,
    "",
    "The 5 SP0-SP3 tools (meta_state_log_change, meta_state_derive_status, meta_state_check_grounding,",
    "meta_state_refresh_fingerprint, meta_state_query_drift) may be unreachable in this session.",
    "",
    "Workarounds:",
    "  1. Try mcp__learning_loop_mcp__* tools directly (the MCP client may be connected; the probe failed transiently).",
    "  2. Reconnect via session config (.mcp.json or Droid hook init).",
    "  3. Fall back to direct file I/O via Node scripts that import core/meta-state.js (loses appendGateLog audit trail).",
    "",
    "A meta_state_report finding has been logged for this session.",
    "========================================================",
  ].join("\n");
}
```

### Key design choices (locked from validation session)

- **Probe unchanged.** The existing `spawnAndCall` function does the real MCP probe (spawn + JSON-RPC `initialize` + `loop_describe` call). We do not add a new probe mechanism.
- **Inline call.** The meta_state write is inlined in the hook, not delegated to a helper in `core/`. The hook remains the single source of truth for "MCP probe → meta_state reporting".
- **Idempotency via `session_id` field.** Phase 1's schema addition of `session_id: z.string().optional()` is consumed by this hook to avoid duplicate findings across multiple SessionStart invocations (e.g., session resume, session clear/restart).

## Related Code Files

- Modify: `.factory/hooks/loop-surface-inject.cjs` (add `reportMcpConnectionFailure` and `formatMcpFailureBanner` functions; update the existing `try/catch` in `main` to call the new function on both `catch` and `spawnAndCall` returning `null`).
- Test fixture: `.factory/hooks/__tests__/loop-surface-inject-mcp-failure.test.cjs` (3 new tests, TDD; co-located with the existing `.factory/hooks/__tests__/loop-surface-inject.test.cjs`).

## Implementation Steps

1. **Test 1 (red):** hook logs finding on failure — invoke `main()` with a `spawnImpl` that throws (simulating probe failure); expect exactly 1 entry in the registry with `category: 'mcp-tool-missing'`, `subtype: 'mcp-connection'`, and a `session_id` matching the test input. (Initial: fails because the catch block returns `null` without reporting.)
2. **Test 2 (red):** hook no-ops on success — invoke `main()` with a `spawnImpl` that returns a valid summary; expect NO entry in the registry with `subtype: 'mcp-connection'`. (Initial: passes — existing behavior; but the test locks the contract against future regressions.)
3. **Test 3 (red):** end-to-end failure creates a finding that surfaces in `meta_state_query_drift` — full integration test: invoke `main()` with a failing `spawnImpl`, then invoke `meta_state_query_drift({})` (the SP3 MCP tool); expect the failure finding to NOT appear in drift events (because the finding is `reported` with `expires_at` in the future, and `queryDrift` would compute `drift: true` if the mechanism is shipped — but in this case the evidence_code_ref points to `tools/learning-loop-mcp/server.js` which exists, so the finding IS drift; expect `drift_count: 1`). (Initial: fails because no finding exists.)
4. **Implementation:**
   a. Add `reportMcpConnectionFailure(input, env, cwd, reason)` and `formatMcpFailureBanner(sessionId, reason)` functions to `.factory/hooks/loop-surface-inject.cjs`.
   b. Update the `try/catch` in `main()` to call `reportMcpConnectionFailure` on both the catch path AND the `summary === null` (returned-but-no-summary) path.
   c. Use the `LL_DISABLE_LOOP_SURFACE_INJECTION` env var as a kill switch for the error-reporting branch (e.g., `LL_DISABLE_MCP_FAILURE_REPORTING=1`); default to enabled.
5. **Verify all 3 tests pass; verify Phase 1 + 2 + 3 tests still pass; verify the 557 existing tests still pass; verify the existing `loop-surface-inject.test.cjs` tests still pass.**

## Success Criteria

- [ ] The Droid SessionStart hook at `.factory/hooks/loop-surface-inject.cjs` logs a `meta_state_report` finding on probe failure.
- [ ] The hook surfaces a banner in the session-start output (printed via `console.log`).
- [ ] The hook remains async and non-blocking.
- [ ] The finding is idempotent: a second SessionStart invocation in the same session (with the same `session_id`) does NOT log a duplicate finding.
- [ ] The hook's existing success path (probe returns a summary → formatBlock → console.log) is unchanged.
- [ ] All Phase 1 + 2 + 3 tests still pass.
- [ ] All 557 existing tests still pass.
- [ ] The 3 new tests for Phase 4 pass.
- [ ] The existing `.factory/hooks/__tests__/loop-surface-inject.test.cjs` tests still pass.

## Risk Assessment

- **Risk:** the dynamic `import()` of `core/meta-state.js` may fail if the module path is wrong or the module has a side effect that crashes. **Mitigation:** the import is wrapped in a `try/catch` in the existing pattern; if the import fails, the hook logs the error to stderr and continues. The meta_state write failure is non-fatal (the hook's primary responsibility is loop surface injection; error reporting is best-effort).
- **Risk:** the `readRegistry` call inside `reportMcpConnectionFailure` is an I/O on the hot path of session start. If the registry is large, this could add latency. **Mitigation:** the registry is small (currently 23 entries; bounded growth with compaction). A `find` on 23 entries is sub-millisecond. If the registry grows large in the future, a per-session index could be added (out of scope for this plan).
- **Risk:** the `session_id` field on the Droid hook input may not be present in all Droid versions. **Mitigation:** the fallback chain (input → env var → `unknown-${Date.now()}`) ensures the hook always has a session id. If the fallback is used, the idempotency check is weaker (each fallback id is unique per process), but the hook still doesn't spam the operator with repeated findings (the SessionStart fires once per session start).
- **Risk:** the banner output (`console.log`) may interleave with the existing `formatBlock` output (both are stdout). **Mitigation:** the banner is only printed on failure; the success path doesn't print the banner. The two paths are mutually exclusive in a single session. If the probe succeeds, the success block is printed; if it fails, the failure banner is printed.
