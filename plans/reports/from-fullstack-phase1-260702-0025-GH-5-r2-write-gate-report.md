# Phase 1 Implementation Report — Plan 5-Lite R2 Write-Gate + identity pinning

## Phase
- Phase 1: R2 Write-Gate (per-runtime allowlist) + identity pinning
- Plan: `plans/260701-2250-plan-5-lite-r2-lim4/phase-01-r2-write-gate.md`
- Status: **completed**

## Files Created
- `tools/learning-loop-mastra/mastra/identity-errors.json` — error message constants
- `tools/learning-loop-mastra/core/identity-pin.js` — process-boot identity pin (frozen, immutable)
- `tools/learning-loop-mastra/core/r2/ownership.js` — checkR2Ownership + BOOTSTRAP_DENY_PATTERNS
- `tools/learning-loop-mastra/core/r2/path-field-detector.js` — detectPathFields + validateToolManifest
- `tools/learning-loop-mastra/core/r2/allowlist-cache.js` — loadAllowlist + invalidateAllowlist
- `tools/learning-loop-mastra/core/r2/denial-log.js` — appendR2DenialLog (JSON line via appendToAllSurfaces)
- `tools/learning-loop-mastra/mastra/with-r2-gate.js` — gate wrapper composing the gating chain
- `.loop/r2-allowlist.json` — schema v1 per F4 (committed to git, NOT gitignored)
- Tests: `__tests__/pin-runtime-id.test.js`, `__tests__/r2/{ownership,path-field-detector,glob-match,workflow-coverage,allowlist-cache,precommit-hook}.test.js` (78 new tests)

## Files Modified
- `tools/learning-loop-mastra/mastra/server.js` — pinRuntimeIdAtBoot() first; validateToolManifest(MANIFEST); swap createTool→createLoopTool in convertWorkflowsToTools; add `mastra_update_r2_allowlist` MCP tool (operator-only preflight + atomic temp+rename + cache invalidation); import z
- `tools/learning-loop-mastra/mastra/create-loop-tool.js` — wrap execute with withR2Gate({ id, execute, pathFields })
- `tools/learning-loop-mastra/tools/manifest.json` — add `pathFields: []` to every entry (R3/F12)
- `tools/learning-loop-mastra/agent-manifest.json` — add `mastra_update_r2_allowlist` to gate group (45 tools)
- `tools/learning-loop-mastra/core/placement.yaml` — register 5 new core files (identity-pin.js, r2/*.js)
- Test-harness fixes (caused by the new LOOP_SURFACE boot requirement):
  - `tools/learning-loop-mastra/__tests__/with-mcp-server.js` — pass `LOOP_SURFACE: ".claude"` by default
  - `tools/scripts/run-pnpm-test-namespaced.mjs` — backstop `LOOP_SURFACE` env for child test processes
  - `__tests__/{cold-session-enumerate-mastra,mcp-protocol-e2e,legacy-mcp/mcp-protocol-e2e}.test.cjs` — pass full env to StdioClientTransport (SDK default env inheritance omits LOOP_SURFACE)
  - `__tests__/{cold-session-enumerate-mastra,workflow-parity,manifest-arithmetic,legacy-mcp/cold-session-discoverability}.test.cjs` — tool-count assertions 44→45 / 31→32 / 41→42 (added 1 tool)
- `meta-state.jsonl` — refreshed code_fingerprint for 2 grounded findings pointing at `create-loop-tool.js` and `tools/manifest.json` (hashes drifted due to legitimate edits; refreshed via the `meta_state_refresh_fingerprint` tool handler)

## Tasks Completed
- [x] F1 .loop/r2-allowlist.json schema v1 committed
- [x] F2 R2 gate is the only gate in createLoopTool (withR2Gate)
- [x] F3 default deny
- [x] F4 per-surface own/deny + universal
- [x] F5 structured cross_runtime_write_denied error
- [x] F6 denial logged (JSON single line, no raw \n)
- [x] F8 BOOTSTRAP_DENY_PATTERNS (self-bootstrap hard-deny, lists both bare + nested forms because globMatch `**/X` requires a slash before X — locked by glob-match.test.js)
- [x] F9 update_r2_allowlist MCP tool (preflight marker + atomic write + cache invalidation)
- [x] F10 pinned runtime id immutable (Object.freeze + no setter + closure-immutability test)
- [x] F11 path-field detector with default-deny + depth-3 limit
- [x] F12 every manifest entry has pathFields (validateToolManifest throws at boot)
- [x] F13 workflow tools flow through createLoopTool (R4 swap)
- [x] F14 path normalization (resolve + normalize) before globMatch
- [x] NF1 allowlist cached per root; invalidation via tool
- [x] NF3 fail-closed denials
- [x] NF4 synchronous pinRuntimeIdAtBoot() as first executable statement
- [x] R1 self-write denied (bootstrap_deny with update_r2_allowlist hint)
- [x] R2 closure immutability (mid-process env change does NOT flip pin; Object.isFrozen; strict-mode assignment throws)
- [x] R3 path-field detector default-deny
- [x] R4 workflow + agent tools flow through R2 (source-text guard + functional test)

## Tests Status
- New test files: 78/78 pass (pin 13, path-field-detector 14, glob-match 13, ownership 17, allowlist-cache 9, workflow-coverage 7, precommit-hook 5)
- `node --test` on each new file: all green
- Regression check on existing server-spawning tests (server-runid, mutex-scope, mcp-tools-list-parity, create-loop-workflow, cold-session-enumerate, mcp-protocol-e2e, workflow-parity): all green
- `pnpm test` full suite: **14 globs, 1456 tests, all pass** (24.36s)

## Issues Encountered / Deviations
1. **Identity pin in separate module (deviation #1):** `core/identity-pin.js` instead of inline in server.js — server.js ends with `await server.startStdio()` so importing it in tests hangs on stdio. Pin module is independently testable.
2. **`ALLOWED_SURFACES` local constant** in identity-pin.js = `[".claude",".factory",".mastracode"]` (full set), NOT the imported `SURFACES` (which Phase 3 extends). Keeps Phase 1 self-consistent.
3. **`appendGateLog` → `appendDecisionLog`/`appendR2DenialLog` (deviation #2):** used a dedicated `core/r2/denial-log.js` writing JSON-single-line via `appendToAllSurfaces(root, ".gate-decision.log", line)`.
4. **`pathFields` semantics (deviation #3):** empty `[]` = passthrough allow. All 31 legacy tools + workflow tools + update_r2_allowlist declare `[]` (they write fixed internal paths resolved from non-path args). The gate enforces ownership ONLY on values of declared write-path args. BOOTSTRAP_DENY_PATTERNS catches any future tool that smuggles a critical file as a write-path arg.
5. **globMatch `**/X` semantics:** `**` → `.*` and the following `/` is literal, so `**/X` does NOT match the bare `X`. BOOTSTRAP_DENY_PATTERNS lists BOTH forms (`X` and `**/X`) for each critical file. Locked by glob-match.test.js.
6. **withR2Gate path containment:** calls `resolveSafePath` with a parent-dir fallback for new files (ENOENT) so legitimate new-file writes are not blocked by the gate's pre-flight. Phase 2's actual write-site defense remains the primary containment check.
7. **SDK StdioClientTransport env inheritance:** when `env` is not passed, the SDK inherits only a safe subset (`HOME`, `LOGNAME`, `PATH`, `SHELL`, `TERM`, `USER`) — NOT `LOOP_SURFACE`/`GATE_ROOT`. Fixed .cjs spawn helpers to pass `{ ...process.env, LOOP_SURFACE }` explicitly.
8. **Meta-state fingerprint drift:** editing `create-loop-tool.js` and `tools/manifest.json` drifted 2 grounded findings. Refreshed via `meta_state_refresh_fingerprint` tool handler (legitimate code change).
9. **No `setPinnedRuntimeId` export anywhere** — verified by source-text guard reading server.js, create-loop-tool.js, identity-pin.js.

## Next Steps
- Phase 3 can reconcile `core/surfaces.js` SURFACES with the local `ALLOWED_SURFACES` constant when it extends SURFACES to add `.mastracode`.
- Phase 3's R6 audit-log hardening (newline assertion, realpath pre-resolve) builds on `denial-log.js`.
- Operator runbook should document `.loop/.r2-operator-preflight` marker + `update_r2_allowlist` tool as the legitimate allowlist edit path.

Status: DONE
Summary: Phase 1 R2 write-gate + identity pinning shipped TDD-first; 78 new tests pass; full `pnpm test` suite passes (14 globs, 1456 tests, 0 failures).
Concerns/Blockers: None. Deviations documented above; behavior changes (LOOP_SURFACE boot requirement, +1 tool) propagated to all affected test harnesses and count assertions.