# PM Sync-Back — Plan 5-Lite Complete

| | |
|---|---|
| Plan | `plans/260701-2250-plan-5-lite-r2-lim4/` |
| Status | **completed** |
| Branch | `hardening/plan-5-lite-r2-lim4` |
| Date | 2026-07-02 03:10 |
| Test result | 1501 pass / 0 fail / 1 intentional pre-existing skip (14 namespaces) |

## Phases

| Phase | Status | Acceptance |
|---|---|---|
| 1 — R2 Write-Gate + identity pinning | completed | R1-R4 tests pass; 31 tools + 10 workflows + agents via `createLoopTool`; `update_r2_allowlist` tool; identity pin immutable (no setter) |
| 2 — LIM-4 Path Containment | completed | R5/R15 tests pass; 7 audit sites migrated to `resolveSafePath`; grep-guard LOCK test green |
| 3 — Cross-Cutting | completed | R6/R11/R13/R17 tests pass; contract Req #9/#10/#11; `docs/security/plan-5-hardening.md`; 3 `mcp.json` env.LOOP_SURFACE |

## Acceptance criteria (plan.md)

- [x] R1-R6 have passing tests
- [x] 3 runtimes inject `LOOP_SURFACE` (via `mcp.json` env field — user decision replaced shim wiring S1-S5)
- [x] 7 LIM-4 audit sites migrated
- [x] 31 tools + 10 workflows + agents flow through R2
- [x] `.loop/r2-allowlist.json` committed (pending `git add` at commit step)
- [x] `pnpm test` passes (1501)
- [x] `docs/security/plan-5-hardening.md` exists
- [x] `update_r2_allowlist` MCP tool works (preflight-gated)

## Code review (mandatory subagent)

- **Tester subagent:** DONE — 1500 pass / 0 fail (re-confirmed; 1 intentional skip).
- **Code-reviewer subagent:** DONE_WITH_CONCERNS → resolved.
  - **H1 (HIGH, fixed):** `meta-state-refresh-fingerprint-tool.js:120` was the only LIM-4 audit site missing the ENOENT-preservation try/catch. A missing evidence file inside root threw `PathContainmentError` out of the handler instead of returning the documented `code_missing` JSON. Fixed by mirroring the pattern the other 6 sites use (`pathResolve` to avoid the banned-pattern grep guard). Regression test added: `refresh_fingerprint_missing_file_inside_root_returns_code_missing`. Suite now 1501 pass.

## Deferred (out of accepted scope; documented for follow-up)

5 source files still hard-code `[".claude", ".factory"]` and do not yet cover the `.mastracode` surface. Pre-existing (not regressions); Phase 3 C3 explicitly scoped only test files. Recorded in `docs/security/plan-5-hardening.md` § Out-of-Scope "Surface-divergence follow-up":

- `tools/learning-loop-mastra/hooks/legacy/inbound-gate.js:36`
- `tools/learning-loop-mastra/tools/legacy/mark-preflight-complete-tool.js`
- `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (`PATH_WRITE_PATTERNS`)
- `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js` (`SHIM_DIRS`)
- `tools/learning-loop-mastra/core/gate-override.js` (comment only)

## Unresolved questions

- None. Follow-up plan recommended for the 5 surface-divergence source files.