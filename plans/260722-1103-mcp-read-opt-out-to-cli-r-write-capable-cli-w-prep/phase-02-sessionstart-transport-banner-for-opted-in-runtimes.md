---
phase: 2
title: "SessionStart transport banner for opted-in runtimes"
status: pending
priority: P1
effort: "0.5d"
dependencies: [1]
---

# Phase 2: SessionStart transport banner for opted-in runtimes

## Overview

When a runtime opts into CLI reads (`LOOP_READS_VIA_CLI=1`), its SessionStart context must tell the agent that the 7 read tools are NOT registered as `mastra_*` MCP tools and must be invoked as `node .../bin/loop.mjs <tool> '<json>'` (Bash). Without this, the opt-out runtime is broken: the existing hints reference bare read-tool names that the agent would map to (now-absent) MCP tools. The mechanism is a **transport banner**, not a full hint projection — the onramp's feared steering cost dissolves because hints already use bare, transport-ambiguous names.

## Requirements

- Functional: the opted-in runtime's SessionStart injection carries a banner stating (a) the 7 read tools are routed via CLI (`node tools/learning-loop-mastra/bin/loop.mjs <tool> '<json>'`), (b) the `mastra_<read>` MCP tools are not registered for this runtime, (c) writes still use `mastra_<write>` MCP tools. The banner names the CLI path and the `LOOP_SURFACE`/`GATE_ROOT` contract already documented in `loop.mjs`.
- Functional: a non-opted runtime's SessionStart injection is byte-identical to today (no banner; no hint text change).
- Functional: the banner is emitted only when the runtime is opted in — the hook reads the same signal the server uses (the `mcp.json` env `LOOP_READS_VIA_CLI`, or a per-surface config — see Open question / Architecture).
- Non-functional: no rewrite of `hint-registry.js` inline call-forms (`meta_state_list({...})` etc.). The bare names are transport-ambiguous; the banner disambiguates. This is the KISS resolution of onramp §5 "steering surface."
- Non-functional: `hint-renderer.js` is NOT promoted onto the injection path (it stays inspection-only, per its own header comment). The banner is added in the production injection path (`session-start-inject-discoverability.cjs` and/or `loop-introspect.js` builders), not the renderer.

## Architecture

<!-- Updated: Validation Session 1 - config surface = mcp.json env + hook reads it (Option A); dogfood = .claude -->

**Where the signal lives (decided: `mcp.json` env, hook reads the same file).** The dogfood runtime's `.mcp.json` env block sets `LOOP_READS_VIA_CLI=1` (Phase 3 wires it). Both the MCP server and the SessionStart hook read that one file — single source of truth. The hook reads **no config today** (verified: `session-start-inject-discoverability.cjs:179` is `.claude`-hardcoded; no `mcp.json`/`LOOP_SURFACE` read), so it gains a small `readSurfaceMcpJson()` helper that reads `<surface>/mcp.json` and returns its env block. The hook already knows its surface (`.claude`) by construction.

**Where the banner is injected.** The Claude Code SessionStart hook `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs` writes `.claude/session-context.json` and emits `additionalContext` (the `PULL_PATH` line at its :26). The banner is appended to that `additionalContext` when `readSurfaceMcpJson()` returns `LOOP_READS_VIA_CLI=1`. The `PULL_PATH` line itself uses bare names (`loop_describe({tier:'warm'})`) — it stays as-is; the banner clarifies that these are CLI invocations, not MCP tool calls.

**Banner shape (illustrative):**
```
Loop read transport: this runtime reads the loop's 7 read tools via CLI, not MCP.
  Read:  node tools/learning-loop-mastra/bin/loop.mjs <tool> '<json-args>'
         (tools: loop_describe, loop_get_instruction, meta_state_list,
          meta_state_relationships, meta_state_derive_status,
          meta_state_check_grounding, runtime_state_read; `loop.mjs list` prints them)
  The mastra_<read> MCP tools are NOT registered for this runtime.
  Writes still use mastra_<write> MCP tools (meta_state_report, meta_state_resolve, …).
  Set LOOP_SURFACE before invoking; set GATE_ROOT if the CLI reads a different repo.
```
The agent maps the bare names in the existing hints to CLI invocations using this banner.

**Factory is out of scope for R.** The dogfood is `.claude` (Validation Session 1). `.factory/hooks/loop-surface-inject.cjs:266` (which hardcodes the `mcp__learning_loop_mastra__*` MCP form) is untouched in R — it is not the dogfood. When/if Factory opts in later, its hook gets the same `readSurfaceMcpJson()` + banner treatment; that is a follow-on, not R work.

## Related Code Files

- Modify: `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs` (add `readSurfaceMcpJson()`; read opt-out signal; append banner to `additionalContext`)
- Create: `tools/learning-loop-mastra/__tests__/cli-sessionstart-banner.test.js`
- Possibly modify: `tools/learning-loop-mastra/core/loop-introspect.js` (only if the banner is better built alongside `buildDiscoverabilityHints` — see Implementation Steps)
- Delete: none

## Implementation Steps (TDD)

1. **Test first — `readSurfaceMcpJson()` + banner builder.** Add `__tests__/cli-sessionstart-banner.test.js`:
   - Assert `readSurfaceMcpJson(<tmpdir with a fixture mcp.json>)` returns the env block; a missing `mcp.json` returns `{}` (no throw).
   - Assert `buildTransportBanner({ readsViaCli: true })` returns a banner naming the CLI path, the 7 read tools, the "mastra_<read> not registered" clause, and the "writes still use mastra_<write>" clause.
   - Assert `buildTransportBanner({ readsViaCli: false })` returns `""`.
   Run → fails (neither function exists).
2. **Implement `readSurfaceMcpJson()` + the banner builder** (both pure, easy to test). Wire them into `session-start-inject-discoverability.cjs`'s `additionalContext` assembly: `const env = readSurfaceMcpJson(<surface dir>); const banner = buildTransportBanner({ readsViaCli: isTruthy(env.LOOP_READS_VIA_CLI) });` append `banner` when non-empty. Run the test → green.
3. **Test first — non-opted runtime unchanged.** Add an assertion that the full SessionStart `additionalContext` for a non-opted surface (no `LOOP_READS_VIA_CLI` in its `mcp.json`) equals the pre-change output (snapshot or structural). Run → green (banner is `""`).
4. Run `pnpm test` (full suite) → green. The banner is additive context; no hint text is rewritten.
5. Smoke (Phase 3 does the live wiring): confirm the banner builder output reads correctly and references the real CLI path.

## Success Criteria

- [ ] `readSurfaceMcpJson(<dir>)` returns the `mcp.json` env block (or `{}` when absent); `buildTransportBanner({ readsViaCli: true })` returns a banner naming the CLI path, the 7 read tools, the MCP-not-registered clause, and the writes-still-MCP clause; `readsViaCli: false` returns `""`.
- [ ] The opted-in runtime's SessionStart `additionalContext` includes the banner; a non-opted runtime's is unchanged.
- [ ] No `hint-registry.js` inline call-form is rewritten; `hint-renderer.js` stays off the injection path.
- [ ] `pnpm test` full suite green.

## Risk Assessment

- **Signal visibility — RESOLVED (Validation Session 1).** The hook reads no config today, so it gains `readSurfaceMcpJson()` which reads `.mcp.json` directly (the file is the source of truth, not process env). Single source of truth with the server. Residual risk: the hook must locate the correct `mcp.json` (the `.claude` surface's). Mitigation: the hook is `.claude`-hardcoded (`session-start-inject-discoverability.cjs:179`), so it resolves the surface dir the same way it already resolves `.claude/session-context.json` — no new path-resolution logic.
- **Banner re-injects schema, partially undoing the win.** The banner must NOT embed the full read-tool schemas (that would re-add the context cost R removes). Mitigation: the banner names the 7 tools and the command shape only — no arg schemas. The `--schema` flag (deferred to W) is the pull-on-demand escape hatch if the agent needs arg shapes.
- **Agent still tries `mastra_<read>`.** Even with the banner, the agent may pattern-match to MCP. This is the T2 read-path question — R's dogfood (Phase 3) exists to surface it. The banner is the best-effort steering; T2 evidence decides whether a fuller hint projection is needed later.
- **Rollback:** revert the hook change + delete the test. The banner is additive; removing it restores the prior SessionStart context exactly.