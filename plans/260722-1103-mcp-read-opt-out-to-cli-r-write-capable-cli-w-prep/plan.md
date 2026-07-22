---
title: "MCP Read Opt-Out to CLI (R) + Write-Capable CLI (W) Prep"
description: "Per-runtime MCP read-opt-out: a runtime routes the 7 read-only loop tools through bin/loop.mjs (Bash) instead of mastra_* MCP tools, so those 7 tool schemas leave the model context. MCP stays wired for writes. Plus de-risking prep for the follow-on write-capable CLI (W)."
status: completed
priority: P1
effort: "2-3d"
tags: [cli-transport, mcp, context-size, runtime-contract]
created: 2026-07-22
finding: "meta-260721T0809Z-transport-diversification-to-a-cli-is-a-deferred-decision-no"
analysis:
  - "plans/reports/ak-problem-solving-260721-1859-mcp-cli-migration-onramp-report.md"
  - "plans/reports/ak-problem-solving-260722-1040-write-capable-cli-w-approach.md"
blockedBy: []
blocks: []
---

# Plan: MCP Read Opt-Out to CLI (R) + Write-Capable CLI (W) Prep

**Status:** completed
**Date:** 2026-07-22
**Finding:** `meta-260721T0809Z-transport-diversification-to-a-cli-is-a-deferred-decision-no` (open, warning; gate satisfied via T3)
**Analysis:**
- onramp report — `plans/reports/ak-problem-solving-260721-1859-mcp-cli-migration-onramp-report.md` (§"Next step": per-runtime MCP read-opt-out → CLI = "R")
- W approach — `plans/reports/ak-problem-solving-260722-1040-write-capable-cli-w-approach.md` (W = write-capable CLI follow-on)

**Implementation reports:**
- `plans/reports/implementation-260722-1119-mcp-read-optout.md`
- `plans/reports/w-design-decisions-260722-1119-write-cli-prep.md`

## What this plan is

**R — the read-opt-out.** A runtime opts out of MCP for the 7 read-only loop tools: the MCP server registers a *subset* (excluding those 7) for that runtime, and the agent reads via `node tools/learning-loop-mastra/bin/loop.mjs <tool> '<json>'` (Bash). MCP stays wired for writes (Capability 3). The 7 read-tool schemas leave the model context — the context-size win the onramp identified (reads dominate manifest-byte cost).

**W-prep — de-risking for the follow-on write-capable CLI.** W is a *separate* plan, drafted only after R accrues read-path T2 evidence and the operator confirms W scope (W report §1, §6). This plan does NOT implement W. It lands the small, low-risk investigations and design decisions that unblock W's plan and gate its tool-set boundary — most importantly the self-footgun guard (can `meta_state_promote_rule` brick the CLI transport?).

**Not in scope.** W itself (expanding the CLI to mutation tools, write-path parity, write-hint renderer, contract L25 activation). R is read-only; it does not touch Capability 3.

## Why now

The read-only CLI slice (plan `260721-1933`) shipped complete: `bin/loop.mjs` (7 tools), parity + bash-gate guard tests, contract wiring. But it is **dormant** — no runtime points at it; no per-runtime transport config exists (W report §1, scout-verified: `mastra/server.js:45-68` registers all 33 tools unconditionally for every runtime). The context-size win is not realized until a runtime actually opts out. R is the wiring that makes the shipped CLI a used transport.

## Mechanism (scout-verified)

| Concern | Current state | R change |
|---------|---------------|----------|
| MCP tool registration | `server.js:45-68` registers all 33 tools unconditionally; no subset/exclusion mechanism | Add an env-var-driven exclude set; when the runtime opts in, skip registering the 7 read tools |
| Per-runtime config | `mcp.json` env block carries `LOOP_SURFACE` per surface; no transport-preference field | Add `LOOP_READS_VIA_CLI=1` to the opted-in runtime's `mcp.json` env |
| Shared tool set | `READ_ONLY_TOOLS` hardcoded in `bin/loop.mjs:45-53` | Extract to `core/cli-tools.js` (`CLI_READ_TOOLS`); CLI + server share one source of truth (W extends it later) |
| Steering surface | SessionStart hints use **bare** tool names (`loop_describe`, not `mastra_*`); `PULL_PATH` at `session-start-inject-discoverability.cjs:26` | Add a transport **banner** for opted-in runtimes (the bare names are already transport-ambiguous; a banner tells the agent the read channel is CLI) |
| Parity | `cli-read-parity.test.js` proves CLI == direct-handler (not CLI == MCP) | Add a CLI-vs-MCP response parity lock for the 7 tools so the opt-out is proven behavior-preserving |

**Cost dissolution (consistent with the `260721-1933` deltas):** the onramp §5 feared the steering surface as a real cost ("hint renderer variant"). It dissolves: hints already use bare names, so a SessionStart transport banner suffices — no full hint projection, no `hint-renderer.js` promotion (it is inspection-only, off the injection path). The bash-gate cost stays dissolved (default-allow; the existing `cli-bash-gate-guard.test.js` already locks the read shape).

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | MCP subset registration + shared CLI tool set | completed | `phase-01-mcp-subset-registration-shared-cli-tool-set.md` |
| 2 | SessionStart transport banner for opted-in runtimes | completed | `phase-02-sessionstart-transport-banner-for-opted-in-runtimes.md` |
| 3 | Wire dogfood runtime + docs + contract + T2 protocol | completed | `phase-03-wire-dogfood-runtime-docs-contract-t2-protocol.md` |
| 4 | W preparation — self-footgun guard + design decisions | completed | `phase-04-w-preparation-self-footgun-guard-design-decisions.md` |

**Dependencies:** 1 → 2 → 3 (linear; the banner needs the exclude mechanism, the dogfood needs both). 4 is **independent** — the self-footgun investigation is pure-read and can land in parallel with 1-3 (it gates W's tool-set boundary, not R's).

## Acceptance criteria

- [x] A runtime with `LOOP_READS_VIA_CLI=1` has the 7 read tools absent from its MCP `tools/list`; the other runtimes are unchanged (all 33).
- [x] `bin/loop.mjs` and `mastra/server.js` share one `CLI_READ_TOOLS` constant (no drift).
- [x] CLI-vs-MCP response parity holds for the 7 read tools (normalized deep-equal, mirroring `cli-read-parity.test.js`).
- [x] An opted-in runtime's SessionStart context carries a transport banner naming the CLI read channel; a non-opted runtime is unchanged.
- [x] The `.claude` runtime is wired to opt out (`LOOP_READS_VIA_CLI=1` in `.mcp.json`); `docs/runtime-contract.md` and `CLAUDE.md` name `LOOP_READS_VIA_CLI` and the read-channel opt-out; L27's "a runtime picks one transport" reflects that the pick is now configurable per runtime.
- [x] Self-footgun guard test lands (Phase 4); W's open design questions (W report §7) are resolved or explicitly deferred with a recommendation.
- [x] `pnpm test` full suite green; `check_runtime_agnostic` audit passes for the new/changed files.

## Open questions (resolved in Validation Session 1)

1. **Dogfood runtime — RESOLVED: `.claude`.** The active runtime; accrues read-path T2 evidence fastest. Phase 2 edits `session-start-inject-discoverability.cjs` (the `.claude`-hardcoded hook); the Factory/Mastracode hooks stay untouched in R.
2. **Config surface — RESOLVED: `mcp.json` env, hook reads the same file.** `LOOP_READS_VIA_CLI=1` in `.mcp.json` env; both the MCP server and the SessionStart hook read that one file (single source of truth). The hook gains a small `readSurfaceMcpJson()` helper — it reads no config today (verified: `session-start-inject-discoverability.cjs:179` is `.claude`-hardcoded, no `mcp.json`/`LOOP_SURFACE` read).
3. **Steering shape — RESOLVED: transport banner.** Hints already use bare, transport-ambiguous names; a SessionStart banner disambiguates. No `hint-registry.js` rewrite, no `hint-renderer.js` promotion.
4. **`--schema` flag — RESOLVED: defer to W.** YAGNI for R (read args are simple). Build in W at latest, or sooner only if T2 dogfood shows the agent struggling to compose read args.
5. **W design decisions (W report §7 Q1-Q5) — deferred to W-plan time.** Phase 4 records recommendations (tool-set boundary, dispatch commit stage, `update_r2_allowlist`, write-denial exit code, self-footgun); the operator confirms when W is greenlit. Not a decision R blocks on.

## Rollback

R is additive + config-gated. Rollback per phase: revert `server.js` exclude + `core/cli-tools.js` + `loop.mjs` import; revert the SessionStart banner; unset `LOOP_READS_VIA_CLI` in the dogfood `mcp.json`; revert doc edits. No records are mutated by R; no migration. Phase 4's guard test is additive.

## Validation Log

### Session 1 — 2026-07-22
**Trigger:** `/ak:plan validate` after plan authoring; resolve the 5 open questions before cook.
**Questions asked:** 4 (Q5 W design decisions deferred to W-plan time, not a user decision for R)

#### Verification Results (Standard tier — 4 phases)
- Claims checked: 12 (file paths / symbols cited from the onramp + W reports + scout)
- Verified: 11 — `mcp-tools-list-parity.test.js` exists; test dir `__tests__/`; `server.js:42,56,77-107`; `loop.mjs:45-53`; manifest 32 entries all `pathFields: []`; `surfaces.js:16`; `hint-renderer.js` inspection-only; `loop-describe-tool.js:53,70-76` summary tier; `cli-read-parity.test.js` scope (CLI == direct, not MCP); `cli-bash-gate-guard.test.js`; per-surface `mcp.json` `LOOP_SURFACE`; `PULL_PATH` at `session-start-inject-discoverability.cjs:26`
- Failed: 0
- Unverified → resolved into a finding: 1 — the SessionStart hook reads **no config** today (`session-start-inject-discoverability.cjs:179` is `.claude`-hardcoded; no `mcp.json` / `LOOP_SURFACE` read). So Phase 2's "signal visibility" risk is real, not dissolved: getting the opt-out signal to the hook requires new config-read code. This sharpened Q2 and is resolved by the chosen config surface (hook reads `mcp.json`).

#### Questions & Answers

1. **[Scope/Architecture]** Which runtime should be the R dogfood (the one that opts out of MCP reads and reads via CLI)?
   - Options: `.claude` (active) | a non-syn runtime (`.factory`/`.mastracode`) | defer to cook time
   - **Answer:** `.claude` (active runtime)
   - **Rationale:** Accrues read-path T2 evidence fastest; fixes which `mcp.json` (`.mcp.json`) and which hook (`session-start-inject-discoverability.cjs`) Phases 2-3 edit.

2. **[Architecture/Assumption]** Where should the `LOOP_READS_VIA_CLI` opt-out signal live, given the SessionStart hook reads no config today?
   - Options: `mcp.json` env + hook reads it | per-surface marker file | hook env via `settings.json`
   - **Answer:** `mcp.json` env + hook reads it
   - **Rationale:** Single source of truth — both the MCP server and the hook consume the same `.mcp.json`. The hook gains a small `readSurfaceMcpJson()` helper. Removes the drift risk of two config locations.

3. **[Architecture/Tradeoff]** How should the opted-in runtime tell the agent to read via CLI instead of MCP?
   - Options: transport banner at SessionStart | full hint projection
   - **Answer:** Transport banner at SessionStart
   - **Rationale:** Hints already use bare, transport-ambiguous names; a banner disambiguates without rewriting `hint-registry.js` or promoting `hint-renderer.js`. Cheapest; full projection reserved as a fallback if T2 dogfood shows the banner insufficient.

4. **[Scope]** Build the `--schema` flag now (dual-purpose) or defer to W?
   - Options: defer to W | build now
   - **Answer:** Defer to W
   - **Rationale:** YAGNI — R's read args are simple. `--schema` is W-prep for rich write schemas; build in W at latest, or sooner only if T2 dogfood shows the agent struggling to compose read args.

#### Confirmed Decisions
- Dogfood runtime: `.claude` — Phase 2 edits `session-start-inject-discoverability.cjs`; Phase 3 edits `.mcp.json`.
- Config surface: `LOOP_READS_VIA_CLI=1` in `.mcp.json` env; hook reads the same file via a new `readSurfaceMcpJson()` helper. Single source of truth.
- Steering: SessionStart transport banner; no hint-registry rewrite, no renderer promotion.
- `--schema`: deferred to W (Phase 4 records the deferral, not the build).

#### Action Items
- [x] Phase 2: commit to Option A (hook reads `mcp.json`); add `readSurfaceMcpJson()` helper; remove the Option B alternative and the "Factory parallel" branch (Factory is not the dogfood).
- [x] Phase 3: nail the dogfood to `.claude` / `.mcp.json`; remove "operator-selected" hedging; the wiring test asserts `.mcp.json` carries the flag and the other two do not.
- [x] Phase 4: mark `--schema` as DEFERRED (not optional-build); record the deferral as the Q6 decision; keep the self-footgun investigation + design-decisions record as the phase's real work.

#### Impact on Phases
- Phase 1: no change (mechanism is config-source-agnostic; `LOOP_READS_VIA_CLI` in mcp.json env is what it reads).
- Phase 2: config-surface decision resolves the signal-visibility risk; scope narrows to the `.claude` hook.
- Phase 3: dogfood fixed to `.claude` / `.mcp.json`; wiring test invariants nailed.
- Phase 4: `--schema` deferred; self-footgun + design-decisions record remain.

### Whole-Plan Consistency Sweep
- Re-read `plan.md` + all 4 `phase-*.md` after propagation.
- Stale terms found & fixed: `plan.md` acceptance criterion "operator-selected" → `.claude`; Phase 4 rollback line "(+ the `--schema` flag if built)" → removed (deferred). Action Items marked complete.
- Verified consistent: dogfood = `.claude` everywhere (Phase 2 hook, Phase 3 `.mcp.json`, Phase 4 Q7 "same as R's dogfood"); config surface = `mcp.json` env + `readSurfaceMcpJson()` (Phase 2 Architecture, Requirements, Steps, Success Criteria, Risk); `--schema` = deferred (Phase 4 Overview, Requirements, Architecture Q6, Steps, Success Criteria, Risk, Rollback); no `Option B` / `Factory parallel` / `operator-selected` hedging remains in phase bodies.
- Unresolved contradictions: **0**. Plan is internally consistent and eligible for implementation.