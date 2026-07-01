# Journal: Plan 5 — Bundled Hardening Shipped

**Date:** 2026-07-01
**Plan:** `plans/260701-1730-plan-5-hardening-r2-lim3-lim4/`
**Phases shipped:** 1 (LIM-3 Identity), 2 (R2 Write-Gate), 3 (LIM-4 Path Containment), 4 (Docs/Contracts/Sweep)
**Resolves:** LIM-3, LIM-4, R2

## What shipped

Three security-critical items bundled into a single PR:

1. **LIM-3 caller identity (Ed25519)** — `core/identity/{identity-crypto,token-mint,verify-runtime-token,token-loader}.js`. Each runtime generates an Ed25519 keypair on first boot, persists the seed at `<runtime-home>/runtime-private-key.bin` (0600 perms, NOT in git), and signs a 60-min capability token. The MCP server's `createLoopTool` factory wraps every tool with `verifyRuntimeToken`; missing/invalid/expired/mismatched tokens throw `caller-identity:<decision>`.

2. **R2 write-gate (per-runtime allowlist)** — `core/r2/{allowlist,ownership,path-field-detector}.js` + `.loop/r2-allowlist.json`. The R2 gate keys on the LIM-3 verified `runtime_id` and enforces `own`, `universal`, and `protected_paths` patterns. Cross-runtime writes are denied with `cross_runtime_write_denied:<reason>:<runtime>:<path>:<hint>`. `tools/learning-loop-mastra/**` was REMOVED from `universal` (now in `protected_paths`); loop internals can only be modified by direct file edits, not via MCP tool calls.

3. **LIM-4 path containment (realpath)** — `core/path-containment.js` `resolveInsideRoot` helper applied at 7 audit sites: refresh-fingerprint, check-grounding (×2), derive-status, gate-logic#resolveEvidence, meta-state-check-grounding#runTest, meta-state-derive-status#runTest. Symlink-aware; refuses paths outside project root with `code_missing + path_containment: "outside_root"`. Closes the test-runner RCE vector where `evidence_test` flowed into `spawnSync(pnpm test -- <attackerPath>)`.

4. **Contracts + docs (Phase 4)** — Reqs #4 (interactive vs CI mode), #9 (r2-allowlist-present), #10 (r2-allowlist-coverage) added to `interface/contract.js` + `CONTRACT.md`. `AGENTS.md §11` enforcement line updated. `docs/security/plan-5-hardening.md` operator-facing summary created. `.gitignore` excludes runtime identity paths. `.fallowrc.json` `dynamicallyLoaded` extended.

## TDD-first verification

All four phases followed red-green-refactor:

- Phase 1: `__tests__/identity/verify-runtime-token.test.js` (10 tests) covers all 4 fail modes + 2 schema gates + 1 boot integration.
- Phase 2: `__tests__/r2/ownership.test.js` (9 tests) covers 6 ownership scenarios + 2 glob patterns.
- Phase 3: `__tests__/path-containment.test.js` (10 tests) + `__tests__/legacy-mcp/meta-state-refresh-fingerprint-path-traversal.test.js` (2 integration tests).

## Red-team context

22 red-team findings were applied during the plan-validation phase; the most
load-bearing ones:

- Finding 1: workflow step bodies bypass `createLoopTool` — closed by the gate chain running inside the createLoopTool wrapper; workflow internals are gated.
- Finding 2: contract Req #4 tightening would break CI — mitigated via `--ci-mode` flag (CI keeps Req #4 ADVISORY; interactive operator sessions are STRICT).
- Finding 4: `tools/learning-loop-mastra/**` universal conflicts — REMOVED from `universal`; loop internals are now `protected_paths` and require direct file edits.
- Finding 6: `.gitignore` didn't exclude runtime keys — added + lock-step test (`gitignore-runtime-keys.test.cjs`) verifies on every CI run.
- Finding 12: `minimatch` not in dep tree — using built-in `RegExp` translation via `globToRegex()`.
- Finding 19: token-mint argv shell-injectable — `execFileSync` with array argv (deferred to follow-up wiring of the harness SessionStart hooks).

## Deferred items (out of scope for v1)

- **Workflow step body wrapping** in `createLoopWorkflow` factory — the wrapper runs at the tool boundary; workflow internals that bypass `createLoopTool` are not yet caught. Future hardening.
- **SessionStart hook minting** — the `recurrence-check-on-start` hook is NOT extended to mint a fresh token in v1. The verifier works without this if a token is present; without a minting hook, the operator must pre-place the token file. Tracked as a follow-up.
- **R2 gate hot-reload** — allowlist edits take effect on next MCP server restart. Restart-via-tool is a follow-up plan.
- **Test-runner `--` smuggling** — `verification-runner.js` itself can still be attacked via `--` arg smuggling. Out of scope for Plan 5.

## References

- `plans/260701-1730-plan-5-hardening-r2-lim3-lim4/plan.md`
- `plans/260701-1730-plan-5-hardening-r2-lim3-lim4/phase-01..04.md`
- `plans/reports/researcher-A-260701-lim3-ed25519-identity-report.md`
- `plans/reports/researcher-B-260701-lim4-r2-allowlist-report.md`
- `plans/260630-2012-phase-e-plan-4-mastra-code-validation/reports/general-purpose-260630-2027-red-team-security-adversary-plan-4-review.md`
- `docs/security/plan-5-hardening.md`