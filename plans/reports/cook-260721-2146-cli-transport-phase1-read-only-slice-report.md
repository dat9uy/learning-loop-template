---
title: "CLI Transport Phase 1 — Read-Only Slice — execution report"
plan: plans/260721-1933-cli-transport-phase1-read-only-slice/plan.md
status: complete
date: 2026-07-21
phases_complete: [1, 2, 3]
test_result: "2356 passed | 1 skipped | 0 failed (full suite); 21 new tests green"
runtime_agnostic_audit: "6/6 pass on bin/loop.mjs"
---

# Cook Report: CLI Transport Phase 1 — Read-Only Slice

## Outcome

All three phases shipped against plan `260721-1933-cli-transport-phase1-read-only-slice`. Read-only CLI transport now wired as the second named transport in the contract; MCP keeps serving all three runtimes; the CLI is additive.

## Artifacts

| File | Action | Notes |
|------|--------|-------|
| `tools/learning-loop-mastra/core/schema-normalize.js` | created | Phase 1 seam. Pure zod wrapper. Imports ONLY zod (boundary test locks). |
| `tools/learning-loop-mastra/mastra/create-loop-tool.js` | modified | Inline `normalizeInputSchema` replaced with re-import from `../core/schema-normalize.js`. Behavior unchanged. |
| `tools/learning-loop-mastra/__tests__/schema-normalize.test.js` | created | 5 tests: identity-or-wrap behavior + static source-text Mastra-free boundary. |
| `tools/learning-loop-mastra/core/placement.yaml` | modified | Added `schema-normalize.js` row (primitive role). |
| `tools/learning-loop-mastra/bin/loop.mjs` | created | Phase 2 CLI. ~165 LOC. Reuses `pinRuntimeIdAtBoot`, `normalizeInputSchema`, `adaptLegacyHandler`, `withR2Gate`, `resolveToolImportUrl`, `validateToolManifest`. No `@mastra` imports. |
| `tools/learning-loop-mastra/__tests__/cli-read-parity.test.js` | created | 14 tests: 7 parity (CLI stdout vs direct handler, normalized deep-equal) + 7 contract (exit 0/1/2, unset LOOP_SURFACE, list subcommand, not-found payload). |
| `tools/learning-loop-mastra/__tests__/cli-bash-gate-guard.test.js` | created | 2 tests: read-only CLI command → `decision: "ok"`; write-redirect → `decision: "block"` (locks the dissolved bash-gate-allowlist finding). |
| `docs/runtime-contract.md` | modified | New "Read-only CLI transport" bullet in Transport mapping; L27 pluralized ("shell-hook-only OR read-only CLI"); "Current transports" notes the slice; L25 (write-capable-CLI future option) UNCHANGED. |
| `CLAUDE.md` | modified | CLI bullet added to quick reference. |
| `docs/architecture.md` | modified | One cross-reference line in Constraint Gate MCP Server section. |

## Acceptance criteria (plan line 50-57)

1. CLI returns same JSON as MCP path under normalized deep-equal — **MET** (7 parity tests, independent freshly-seeded tmpdirs per side; non-deterministic fields stripped from both sides).
2. Exit codes 0/1/2 — **MET** (success / handler-error / usage-config; identity-pin preconditions exit 2).
3. MCP server boot + existing tests unaffected — **MET** (full suite: 2356 passed, 1 skipped, 0 failed).
4. Docs updates + L25 untouched — **MET** (`git diff` confirms L25's write-capable-CLI clause is byte-identical pre/post).
5. `check_runtime_agnostic` audit passes — **MET** (6/6 pass on `bin/loop.mjs`).
6. Guard test asserts CLI command string passes the bash gate — **MET** (`cli-bash-gate-guard.test.js`).

## Risks dissolved during execution

- **Bash-gate allowlist rule (report cost #1): dissolved.** The bash gate is default-allow (promoted rules are *blockers*, not allowlisters; `core/gate-logic.js:1008-1016`). The guard test now locks this assumption against a future blocking regex.
- **findProjectRoot wrong-root:** CLI header documents that omitting `GATE_ROOT` silently reads the loop's own repo. The CLI's `resolveRoot`-driven handlers honor `GATE_ROOT` correctly.
- **Parity harness has no precedent:** The new `spawnSync`-based pattern uses two independent tmpdirs per side to avoid the `fingerprint_was_recorded` flip + the `appendGateLog` cross-side interference.

## Code review (subagent)

Reviewer reported DONE_WITH_CONCERNS with 1 HIGH + 3 MEDIUM + 2 LOW. Actions taken:

- **HIGH (doc scope creep):** Verified via `git diff` that L25 was untouched (the reviewer's premise about the starting state was off). No action needed.
- **MEDIUM (ZodError test description):** Replaced the malformed-JSON test with a valid-JSON-but-wrong-shape test (`meta_state_list '[1,2,3]'` → z.object failure) and added stderr content assertion.
- **MEDIUM (handler-error test):** Renamed and tightened to assert the documented not-found payload shape (exit 0 + JSON containing `entry_not_found` / `error` signal).
- **MEDIUM (misleading `root` arg in `runList`):** Dropped the `root` parameter — `listAllTools` reads manifest from its own `MCP_ROOT`, not from a passed root.
- **LOW (parity-test comment stale):** Updated comment to explain why `fingerprint_was_recorded` is stripped (the fixture path doesn't exist in either tmpdir, so the auto-record branch is skipped on both sides).
- **LOW (CLAUDE.md GATE_ROOT phrasing):** Tightened to "Requires `LOOP_SURFACE`; set `GATE_ROOT` for non-loop repos (default reads loop's own repo silently — wrong-root is not an error)."

## Test discipline notes

- The CLI parity test uses 7 independent freshly-seeded tmpdirs per side (not shared), avoiding the documented parity hazards (auto-record flip, appendGateLog cross-side interference).
- Non-deterministic fields stripped from both sides before `deepStrictEqual`: `checked_at`, `duration_ms`, `built_at`, `fingerprint_was_recorded`, `evidence_code_ref`. `fingerprint_valid` stays IN.
- Field-set guard added: assert the set of keys (after stripping) is identical between CLI and direct, catching future field renames.

## Coordination-gate observations

- The bash gate escalated on `vitest run | tail` (rule `rule-no-raw-stdout-vitest`) — worked around by redirecting to a file then reading via `Read` or via a separate `grep`/`tail` call against the file. Same shape as the prior session's pattern.
- The new test files do not trigger any gate escalation — the bash command strings in the guard test are literal command strings passed to `evaluateBashGate` (pure function), not shell commands.

## Files referenced

- Plan: `plans/260721-1933-cli-transport-phase1-read-only-slice/plan.md`
- Phase 1: `plans/260721-1933-cli-transport-phase1-read-only-slice/phase-01-schema-normalize-seam.md`
- Phase 2: `plans/260721-1933-cli-transport-phase1-read-only-slice/phase-02-read-only-cli-and-parity-tests.md`
- Phase 3: `plans/260721-1933-cli-transport-phase1-read-only-slice/phase-03-docs-and-transport-wiring-audit.md`
- Analysis: `plans/reports/ak-problem-solving-260721-1859-mcp-cli-migration-onramp-report.md`