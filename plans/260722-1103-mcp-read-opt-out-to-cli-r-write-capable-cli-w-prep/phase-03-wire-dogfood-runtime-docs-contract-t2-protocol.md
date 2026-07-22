---
phase: 3
title: "Wire dogfood runtime + docs + contract + T2 protocol"
status: pending
priority: P1
effort: "1d"
dependencies: [1, 2]
---

# Phase 3: Wire dogfood runtime + docs + contract + T2 protocol

## Overview

<!-- Updated: Validation Session 1 - dogfood runtime = .claude -->

Flip the switch on the `.claude` runtime: set `LOOP_READS_VIA_CLI=1` in `.mcp.json`, confirm the SessionStart banner fires and the 7 read tools are absent from its MCP `tools/list`, and update the contract + quick reference to name the read-channel opt-out. Then define the T2 read-path evidence protocol — the gating artifact for W. R's mechanism (Phases 1-2) only realizes the context-size win once a runtime actually reads via CLI; this phase wires that runtime and records how the evidence is collected.

## Requirements

- Functional: the `.claude` runtime has `LOOP_READS_VIA_CLI=1` in `.mcp.json`'s env block. The other two runtimes' `mcp.json` files (`.factory/mcp.json`, `.mastracode/mcp.json`) are unchanged.
- Functional: a smoke check confirms the dogfood runtime's MCP surface excludes the 7 read tools and its SessionStart context carries the banner. (The parity + registration tests in Phase 1 already lock the mechanism; this is the live wiring confirmation.)
- Functional: `docs/runtime-contract.md` "Read-only CLI transport" bullet (added in `260721-1933` Phase 3) gains a sentence: a runtime may opt out of MCP for the read tools via `LOOP_READS_VIA_CLI`, routing reads through the CLI; MCP is retained for writes. L27 ("A runtime picks one transport") reflects that the pick is now **configurable per runtime** (read-channel opt-out), not a hardcoded MCP+hooks for every wired runtime.
- Functional: `CLAUDE.md` quick reference documents `LOOP_READS_VIA_CLI` alongside the existing `bin/loop.mjs` bullet.
- Non-functional: no new gate rule (the bash-gate guard from `260721-1933` Phase 3 already locks the read shape; the opt-out changes nothing about gate decisions).
- Non-functional: a short T2 evidence protocol is recorded (in the phase report and/or a finding update) so the dogfood's read-path T2 evidence has a defined collection + closure path.

## Architecture

**Wiring is one env line in `.mcp.json`.** The `mcp.json` files already set `LOOP_SURFACE` per surface (`.mcp.json:3-5`, `.factory/mcp.json:3-5`, `.mastracode/mcp.json:3-5`). Add `"LOOP_READS_VIA_CLI": "1"` to `.mcp.json`'s env block (the `.claude` runtime). The server (Phase 1) reads it at boot; the SessionStart hook (Phase 2) reads the same file via `readSurfaceMcpJson()`. No other config.

**Contract nuance.** `runtime-contract.md:27` currently says "A runtime picks one transport" — true today because every wired runtime picks MCP+hooks. R makes the pick configurable: a runtime picks *MCP+hooks* OR *MCP+hooks with reads routed to CLI*. The latter is still one transport pick (the read-only CLI is additive over MCP, per the `260721-1933` bullet). The contract sentence gains a clause: the pick is per-runtime configurable; a runtime may route reads via the CLI while keeping MCP for writes. This is the contract-side naming the onramp §"Next step" flagged ("likely a sentence in the read-only-CLI bullet added in Phase 3").

**T2 evidence protocol.** R's dogfood accrues read-path T2 evidence: can the agent reliably read via `node bin/loop.mjs <tool> '<json>'` (parse stdout JSON, react to exit 1/2) when the `mastra_<read>` tools are absent? The protocol:
- **Collect:** during normal dogfood sessions, note any read that the agent attempted via (absent) MCP and had to be redirected to CLI, any stdout-parse failure, any exit-code confusion. These are the T2 failure signals.
- **Record:** a `loop-anti-pattern` or `budget-check` finding (via `meta_state_report`) if a read-path ergonomics failure recurs; or a positive note (change-log) once the dogfood reads via CLI cleanly across N sessions.
- **Closure gate for W:** W unblocks on R's *evidence* (W report §6), not R's completion. The dogfood must show the agent reads via CLI without chronic friction before W is greenlit. This phase defines the bar; the evidence itself accrues post-plan in usage.

## Related Code Files

- Modify: `.mcp.json` (the `.claude` runtime's env block — add `LOOP_READS_VIA_CLI=1`)
- Modify: `docs/runtime-contract.md` (read-only-CLI bullet + L27 clause)
- Modify: `CLAUDE.md` (quick reference, `LOOP_READS_VIA_CLI` under the `bin/loop.mjs` bullet)
- Create: `tools/learning-loop-mastra/__tests__/cli-optout-wiring.test.js` (smoke: the dogfood `mcp.json` carries the flag; the others do not — locks the "exactly one" invariant)
- Run: `check_runtime_agnostic` audit against the changed hook/server files (Phase 2 + Phase 1 changes)
- Delete: none

## Implementation Steps (TDD)

1. **Test first — `.claude` opted in, others not.** Add `__tests__/cli-optout-wiring.test.js`: read the three `mcp.json` files; assert `.mcp.json` has `LOOP_READS_VIA_CLI=1` and `.factory/mcp.json` + `.mastracode/mcp.json` do not carry the key. (This locks the dogfood scope to `.claude` against accidental fan-out.) Run → fails (no flag set yet).
2. **Wire the `.claude` runtime.** Add `"LOOP_READS_VIA_CLI": "1"` to `.mcp.json`'s env block. Run the wiring test → green.
3. **Live smoke (manual, recorded in phase report):** with the `.claude` runtime, confirm (a) MCP `tools/list` excludes the 7 read tools, (b) the SessionStart context carries the banner, (c) `node tools/learning-loop-mastra/bin/loop.mjs loop_describe '{"tier":"summary"}'` returns a real summary against the live repo. Record the result.
4. **Edit `docs/runtime-contract.md`:**
   - **Read-only CLI transport bullet:** add a sentence — a runtime may opt out of MCP for the read tools via `LOOP_READS_VIA_CLI` (set in its `mcp.json` env), routing reads through `bin/loop.mjs`; MCP is retained for writes. The 7 read-tool schemas leave that runtime's model context.
   - **L27 ("A runtime picks one transport"):** add a clause — the pick is configurable per runtime; a runtime may route reads via the read-only CLI while keeping MCP for writes (a read-channel opt-out, not a full transport swap).
   - **Current transports (L39-42):** note that one runtime is dogfooding the read-channel opt-out.
5. **Edit `CLAUDE.md` quick reference:** under the existing `bin/loop.mjs` bullet, document `LOOP_READS_VIA_CLI` (set in a runtime's `mcp.json` to drop the 7 read tools from its MCP surface and route them via the CLI).
6. Run `check_runtime_agnostic` against the Phase 1 + Phase 2 changed files; record the result. Run `pnpm test` (full suite) → green.
7. **Record the T2 evidence protocol** in the phase report (Collect / Record / Closure-gate-for-W per Architecture). Optionally `meta_state_patch` the finding `meta-260721T0809Z` description to note R is wired and T2 read-path evidence is now accruing (operator decision — see Open question on whether to patch the finding in this plan).

## Success Criteria

- [ ] `.mcp.json` carries `LOOP_READS_VIA_CLI=1`; `.factory/mcp.json` and `.mastracode/mcp.json` do not. Wiring test green.
- [ ] Live smoke confirms: dogfood MCP `tools/list` excludes the 7 read tools; SessionStart banner present; CLI read returns a real result.
- [ ] `docs/runtime-contract.md` names `LOOP_READS_VIA_CLI` (read-only-CLI bullet + L27 clause); `CLAUDE.md` quick reference documents it.
- [ ] `check_runtime_agnostic` audit passes for the changed files; `pnpm test` full suite green.
- [ ] T2 read-path evidence protocol recorded (Collect / Record / Closure-gate-for-W).

## Risk Assessment

- **Dogfood runtime — RESOLVED (Validation Session 1): `.claude`.** The active runtime accrues T2 fastest; Phase 2 edits the `.claude` hook, Phase 3 edits `.mcp.json`. Residual risk: if the agent cannot adapt to CLI reads, the `.claude` runtime degrades. Mitigation: the banner (Phase 2) is the steering; the dogfood is reversible (unset the flag) with no records mutated. T2 evidence is exactly the signal that decides whether to keep or roll back.
- **Opt-out breaks the dogfood's normal loop usage.** If the agent cannot adapt to CLI reads, the dogfood runtime degrades. Mitigation: the banner (Phase 2) is the steering; the dogfood is reversible (unset the flag) with no records mutated. T2 evidence is exactly the signal that decides whether to keep or roll back.
- **Contract over-claims a full transport swap.** R is a read-channel opt-out, not "the runtime dropped MCP." Mitigation: the contract edits are scoped to the read-only-CLI bullet + an L27 clause; L25 (write-capable CLI, Capability 3) stays UNCHANGED — R does not exercise Capability 3.
- **Rollback:** unset `LOOP_READS_VIA_CLI` in the dogfood `mcp.json`; revert the two doc files + the wiring test. The runtime returns to full MCP with no record-side effect.