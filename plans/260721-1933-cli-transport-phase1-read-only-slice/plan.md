---
title: "CLI Transport Phase 1 — Read-Only Slice"
status: in-progress
date: 2026-07-21
finding: "meta-260721T0809Z-transport-diversification-to-a-cli-is-a-deferred-decision-no"
analysis: "plans/reports/ak-problem-solving-260721-1859-mcp-cli-migration-onramp-report.md"
blockedBy: []
blocks: []
---

# Plan: CLI Transport Phase 1 — Read-Only Slice

**Status:** in progress
**Date:** 2026-07-21
**Finding:** `meta-260721T0809Z-transport-diversification-to-a-cli-is-a-deferred-decision-no` (gate satisfied via T3, patched v1)
**Analysis:** `plans/reports/ak-problem-solving-260721-1859-mcp-cli-migration-onramp-report.md`

## Target (operator decision 2026-07-21)

Wire the correct function to the correct channel: the deterministic **read** surface moves to a pull CLI so manifest bytes leave the model context (context size is the problem for non-syn profiles). The write surface stays on MCP until T2 (Bash-channel ergonomics) is evidenced by Phase 1 usage. Syn-profile delivery attestation is explicitly out of scope.

This wires the contract's second named transport (`docs/runtime-contract.md:25`). MCP keeps serving the 3 wired runtimes; the CLI is additive — nothing is re-wired, a runtime opts in when its trigger fires.

## Scope

- `bin/loop.mjs` — one-shot CLI over the same `tools/manifest.json` + handler modules. No Mastra deps, no long-lived process, stateless by construction (correctness state lives in `core/` + files).
- 7 read-only tools: `loop_describe`, `loop_get_instruction`, `meta_state_list`, `meta_state_relationships`, `meta_state_derive_status`, `meta_state_check_grounding`, `runtime_state_read` (all `pathFields: []` → R2 passthrough).
- `normalizeInputSchema` moved `mastra/create-loop-tool.js` → `core/schema-normalize.js` (transport-agnostic; CLI must not import `@mastra/core`). MCP factory re-imports it — behavior unchanged.
- Parity test: CLI stdout vs direct handler result, same `GATE_ROOT` temp root.
- Docs: `docs/runtime-contract.md` new "Read-only CLI transport" bullet in Transport mapping + pluralized L27 + "Current transports" note (L25's write-capable-CLI clause unchanged), `CLAUDE.md` quick reference, `docs/architecture.md` Constraint Gate section note.

## Non-goals (later phases / plans)

- Write tools (Phase 2, gated on T2 evidence), workflows, `workflow_storage_*`, `update_r2_allowlist` (inline in `server.js`).
- Steering/hint rendering in CLI command form (`hint-renderer.js` channel variant — confirmed separable, not blocking).
- Per-runtime MCP opt-out config that realizes the context-size win (Phase 1 is additive; both channels coexist).
- Classifier profile-tagging; syn-profile re-verification (documented-degradation stands).
- Bash-gate allowlist rule — **dissolved on inspection** (see Risks).

## Phases

| # | Phase | Status | Effort | File |
|---|-------|--------|--------|------|
| 1 | Schema-normalize seam | pending | 2h | `phase-01-schema-normalize-seam.md` |
| 2 | Read-only CLI and parity tests | pending | 1d | `phase-02-read-only-cli-and-parity-tests.md` |
| 3 | Docs and transport-wiring audit | pending | 2h | `phase-03-docs-and-transport-wiring-audit.md` |

Phase 1 blocks Phase 2 (the CLI imports `core/schema-normalize.js`). Phase 3 depends on Phase 2 (docs describe the shipped CLI; the guard test asserts the CLI command string passes the bash gate). Phases are sequential.

## Acceptance criteria

1. `node tools/learning-loop-mastra/bin/loop.mjs <tool> '<json>'` returns the same JSON as the MCP path for the 7 tools, under a **normalized** deep-equal (non-deterministic fields `checked_at`/`duration_ms`/`built_at`/`timing.*` stripped on both sides) with independent freshly-seeded tmpdirs per side (parity test green).
2. `loop.mjs list` prints the read-only slice; unknown tool / bad JSON / ZodError / unset `LOOP_SURFACE` exit 2 with stderr diagnostics; handler errors exit 1; success exit 0.
3. MCP server boot + existing tests unaffected (`create-loop-tool.js` refactor is import-only).
4. `CLAUDE.md` quick reference names the CLI; `docs/runtime-contract.md` gains a new "Read-only CLI transport" bullet in Transport mapping (Capabilities 1+4 only), L27 pluralizes read-only transports, "Current transports" notes the slice, and L25's write-capable-CLI clause is LEFT UNCHANGED; `docs/architecture.md` Constraint Gate section cross-references it.
5. `check_runtime_agnostic` audit passes for the CLI feature (shim-not-fork; CLI reuses `core/` + handler modules, does not fork them).
6. Guard test asserts `node .../bin/loop.mjs meta_state_list '{}'` is `decision: "ok"` through the bash gate (locks the "no allowlist rule needed" assumption against a future blocking regex).

## Risks / rollback

- **Report cost #1 (bash-gate allowlisting) dissolved.** Scout finding: the bash gate is default-allow; promoted rules are *blockers*, not allowlisters (`core/gate-logic.js:1008-1016`). A read-only `node bin/loop.mjs ...` invocation matches no existing blocking regex and writes no protected path, so it passes as `decision: "ok"`. No rule promotion needed. Phase 3 adds a guard test so a future blocking regex can't silently break the CLI.
- **R2 identity pinning:** CLI pins via `pinRuntimeIdAtBoot()` exactly like `server.js` — same `LOOP_SURFACE` contract. The 7 read tools all have `pathFields: []`, so `withR2Gate` short-circuits to passthrough *before* `loadAllowlist` (`mastra/with-r2-gate.js:43-47`); the CLI needs no `.loop/r2-allowlist.json` in any root.
- **Parity harness has no precedent.** Existing parity tests use the MCP SDK `StdioClientTransport`, not raw child stdout. The CLI parity test uses a new `spawnSync`-based pattern; mirror the env from `__tests__/with-mcp-server.js:67-77` (`GATE_ROOT`, `LOOP_SURFACE=.claude`).
- **`readFileIndex` is defensive.** `loop_describe` / `meta_state_check_grounding` call `readFileIndex(root)`, which returns an empty `Map` on missing `file-index.jsonl` — no seeding needed. The parity tmpdir still creates `records/meta/{index,decisions,capabilities,evidence}` (mirror `agent-parity.test.cjs:18-26`) so `check_grounding`'s post-check `upsertFileIndexEntry` write doesn't take the silent-failure branch.
- **Rollback:** delete `bin/`, restore `create-loop-tool.js` (move `normalizeInputSchema` back inline), revert the docs lines. The CLI is additive — removing it affects only the new transport, not MCP.

## Open questions

None. Option A vs B and the T3 incident-history reading were resolved by the 2026-07-21 operator decision (recorded on the finding, patched v1). The bash-gate allowlist question dissolved on inspection.