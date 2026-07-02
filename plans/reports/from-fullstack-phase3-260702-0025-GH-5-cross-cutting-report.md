# Phase 3 Implementation Report — Plan 5-Lite Cross-Cutting

## Executed Phase
- Phase: 3 — Cross-Cutting (contracts, docs, audit-log hardening, LOOP_SURFACE wiring)
- Plan: `plans/260701-2250-plan-5-lite-r2-lim4/`
- Status: completed

## Summary
Implemented the env-field LOOP_SURFACE wiring (replacing the shim wiring S1–S5), extended the contract validator with Req #9/#10/#11, hardened the audit log against JSONL injection (R6), and added the operator runbook doc. Suite: 1500 tests pass / 0 fail (was 1456 after Phase 1+2; +44 new tests).

## Files Modified
- `tools/learning-loop-mastra/core/surfaces.js` — extended `SURFACES` to `[".claude", ".factory", ".mastracode"]`.
- `tools/learning-loop-mastra/core/identity-pin.js` — reconciled to import `SURFACES` from `core/surfaces.js`; removed local `ALLOWED_SURFACES` constant and the "Phase 3 reconciles later" note.
- `tools/learning-loop-mastra/core/gate-decision-log.js` — R6.1 newline assertion guard before `appendToAllSurfaces`.
- `tools/learning-loop-mastra/core/r2/denial-log.js` — R6.2 realpath pre-resolve of `path` field + newline-replace + assertion guard.
- `tools/learning-loop-mastra/interface/contract.js` — added Req #9 (`.mastracode-config-presence`), #10 (`mastracode-session-start-pins-loop-surface`), #11 (`tools-manifest-has-path-fields`) + check functions + pushed into `checks[]`; `REQUIREMENT_IDS` 7 → 10.
- `tools/learning-loop-mastra/interface/CONTRACT.md` — added sections 9/10/11; header "7 → 10 requirements".
- `tools/learning-loop-mastra/interface/__tests__/contract.test.js` — tests for Req #9/#10/#11 (16 new tests); updated `REQUIREMENT_IDS.length` 7 → 10; updated CONTRACT.md set-equality regex to allow leading-dot IDs; updated `fakeRoot`/`fakeMastraCodeRoot` to write a valid manifest; empty-dir golden test missing count 4 → 5.
- `tools/learning-loop-mastra/__tests__/interface/contract-js-exports-validate.test.js` — `REQUIREMENT_IDS.length` 7 → 10.
- `tools/learning-loop-mastra/__tests__/mcp-config.test.js` — expects `env.LOOP_SURFACE` on each entry; covers all 3 mcp.json files.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/surfaces.test.js` — 2-entry arrays → 3-entry / `SURFACES.length`.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/surfaces-rmw.test.js` — `results.length === 2` → `SURFACES.length`.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js` — `SURFACES` deep-equal 2 → 3.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-override.test.js` — hard-coded `[".claude", ".factory"]` loops → `SURFACES`.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-decision-log.test.js` — hard-coded surface loop → `SURFACES`.
- `.mcp.json` — added `"env": { "LOOP_SURFACE": ".claude" }`.
- `.factory/mcp.json` — added `"env": { "LOOP_SURFACE": ".factory" }`.
- `.mastracode/mcp.json` — added `"env": { "LOOP_SURFACE": ".mastracode" }`.
- `AGENTS.md` §11 — pointer to `docs/security/plan-5-hardening.md`.

## Files Created
- `docs/security/plan-5-hardening.md` — gating chain, identity pinning, env-field wiring, R2 allowlist schema v1 + worked example + per-surface table, audit-log entry shape (R6), operator runbook (`cross_runtime_write_denied` + override + `update_r2_allowlist`), out-of-scope residual threats, troubleshooting, cross-platform notes.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/audit-log-hardening.test.js` — 21 tests (R6.1, R6.2, R17, C5b).
- `tools/learning-loop-mastra/__tests__/legacy-mcp/identity-errors-canonical.test.js` — 5 tests (R11 boot error canonicalization).

## Tasks Completed
- [x] R6 audit-log hardening (gate-decision-log newline guard + denial-log realpath pre-resolve + newline guard)
- [x] R11 boot error canonicalization test
- [x] R13 pre-commit hook (Phase 1 precommit-hook.test.js still passes — verified)
- [x] R17 override audit gap (BOOTSTRAP_DENY_PATTERNS covers runtime-state.jsonl + .gate-override — verified by audit-log-hardening tests)
- [x] C1 contract Req #9/#10/#11 added with check functions
- [x] C2 contract tests for Req #9/#10/#11 (applicable/pass per runtime, `applicable:false` for non-applicable)
- [x] C3 SURFACES hard-coded test arrays updated (5 files: surfaces, surfaces-rmw, runtime-agnostic, gate-override, gate-decision-log)
- [x] C3a SURFACES extended to 3 entries
- [x] C4 docs/security/plan-5-hardening.md created with all sections
- [x] C5 audit-log hardening + C5b regression cases
- [x] LOOP_SURFACE wiring via mcp.json `env` field (replaced S1–S5 shim wiring per operator decision)
- [x] identity-pin.js reconciled to imported SURFACES
- [x] AGENTS.md §11 pointer
- [x] NF2 `applicable:false` for non-applicable runtimes

## Tests Status
- Type check: n/a (no typecheck script; JS).
- Unit/focused: `pin-runtime-id` 13/13 pass; `contract.test.js` 53/53 pass; `audit-log-hardening` 21/21 pass; `identity-errors-canonical` 5/5 pass; `mcp-config` 6/6 pass; `surfaces` 12/12 pass; `surfaces-rmw` 3/3 pass; `gate-override` 14/14 pass; `gate-decision-log` 7/7 pass; `runtime-agnostic` 6/6 pass; `precommit-hook` 5/5 pass; `placement-manifest` 6/6 pass.
- Full suite (`pnpm test`): **1500 pass / 0 fail** (14 globs, 24.18s).

## Issues / Deviations
- **R6 test approach**: `JSON.stringify` escapes control chars in string values, so a raw newline in a field never reaches the serialized line — the primary JSONL-injection defense is `JSON.stringify` itself. The phase-file-specified assertion (`throw "gate_log entry contains unescaped newline"`) is a defense-in-depth guard that never fires for normal string fields. Tests verify the real security property (malicious newline → single-line entry, no forged second line) plus source-presence of the guard. The assertion is retained in both loggers per the phase file.
- **Req #10 scoped to mastra-code only**: per the phase file, Req #10 reports `applicable:false` for claude-code and droid. The env-field wiring for all three runtimes is locked by `__tests__/mcp-config.test.js`; Req #10 locks the third-runtime (mastra-code) regression in the contract. Documented in CONTRACT.md §10.
- **NF1 deferred**: `.loop/r2-allowlist.json` is NOT git-tracked (`git status` shows `?? .loop/`). Per the phase-file guidance, this is a finalize/commit concern, not a Phase 3 implementation concern. The precommit-hook test (R13) verifies the file exists and is not gitignored — that passes. If the phase-file NF1 wants fallow to audit the allowlist, that is out of scope for the env-field approach (fallow:gate is rooted at `tools/learning-loop-mastra/`; the allowlist is at repo root).
- **No shim wiring performed** (S1–S5) — per the operator decision, replaced by the mcp.json `env` field. `.factory/hooks/loop-surface-inject.cjs`, the recurrence-check shims, and `.mastracode/hooks.json` were NOT modified. `LL_DISABLE_LOOP_SURFACE_INJECTION` escape hatch is moot; the operator kill-switch is "remove the `env` field from the relevant mcp.json" (documented).
- `inbound-gate.js:36` hard-codes `[".claude", ".factory"]` — left unchanged (Phase 2 file, not in ownership; extending SURFACES does not break it — it just iterates 2 of 3 surfaces, which is acceptable behavior for that hook).

## Next Steps
- Finalize/commit: `git add .loop/r2-allowlist.json` so the allowlist is tracked (NF1).
- Phase 3 unblocks Task #4 (test validation + code review) and Task #5 (finalize: PM sync + docs + journal).