---
title: "MCP read opt-out (R) shipped on .claude; W stays evidence-blocked"
date: 2026-07-22 11:19
branch: plan-260722-1103-mcp-read-opt-out-to-cli-r-write-capable-cli-w-prep
plan: plans/260722-1103-mcp-read-opt-out-to-cli-r-write-capable-cli-w-prep/plan.md
reports:
  - plans/reports/implementation-260722-1119-mcp-read-optout.md
  - plans/reports/pm-260722-1119-mcp-read-optout-complete.md
status: completed
tags: [cli-transport, mcp, context-size, runtime-contract, w-prep]
---

# MCP read opt-out (R) shipped; W stays evidence-blocked

## Context

The 7-tool read-only CLI (`bin/loop.mjs`) shipped in plan `260721-1933` but was
 dormant — no runtime pointed at it, and `mastra/server.js:45-68` registered all
33 tools unconditionally for every runtime. The onramp and W-approach reports
identified the read-path as the dominant manifest-byte cost and called for a
per-runtime MCP read opt-out. Plan `260722-1103` covered two things: (R)
deliver that opt-out, and (W-prep) de-risk the follow-on write-capable CLI via
a self-footgun investigation and design decisions. W itself is explicitly out
of scope.

## What happened (chronological)

1. **Shared truth.** Phase 1 extracted `READ_ONLY_TOOLS` from
   `bin/loop.mjs:45-53` into `core/cli-tools.js` as `CLI_READ_TOOLS` — one
   source of truth used by both the CLI allowlist and the server-side MCP
   exclude. Closes the drift risk flagged in the onramp report.
2. **Env-gated MCP subset.** `server.js` reads `LOOP_READS_VIA_CLI` from the
   process env (which the per-runtime `mcp.json` carries); when set, it skips
   registering the 7 read tools. Default unchanged → 33 tools; opted → 26.
   `mastra_update_r2_allowlist` and every write tool stay registered.
3. **Dogfood wired.** `.mcp.json` (the `.claude` runtime) carries
   `LOOP_READS_VIA_CLI=1`. `.factory/mcp.json` and `.mastracode/mcp.json`
   untouched. This is the per-runtime pick L27 promises.
4. **SessionStart banner.** `session-start-inject-discoverability.cjs` gained
   a small `readSurfaceMcpJson()` helper (the hook read no config before — a
   real signal-visibility risk the Validation Session surfaced). Opted
   runtimes now get a CLI transport banner on the normal **and** fatal /
   degraded paths. Non-opted helper path is byte-identical to pre-change.
5. **W self-footgun probe.** Phase 4 demonstrated that a promoted gate regex
   can currently intercept `node .../bin/loop.mjs` invocations — the CLI
   transport is not yet protected by the gate system itself. Locked in a
   regression test that codifies this behavior; recommendations recorded in
   `w-design-decisions-260722-1119-write-cli-prep.md`.
6. **Tests + review.** Added focused parity / wiring / exclusion tests, ran
   the full suite, opened code review.

## Decisions

- **Config surface — `mcp.json` env, hook reads same file.** Single source of
  truth; removes the drift risk of two config locations. Chosen via
  Validation Session Q2.
- **Steering — SessionStart banner, not full hint projection.** Hints
  already use bare transport-ambiguous names, so a banner disambiguates
  cheaply. Full projection reserved as a fallback if T2 dogfood shows the
  banner insufficient.
- **`--schema` flag — defer to W.** YAGNI: read args are simple. Build in W
  at latest, or sooner only if T2 dogfood shows the agent struggling to
  compose read args.
- **Dogfood — `.claude`.** Active runtime; accrues read-path T2 evidence
  fastest. Pinning `.claude` removes the "operator-selected" hedging the
  Validation Session flagged.
- **W tool-set boundary, dispatch commit stage, `update_r2_allowlist`,
  write-denial exit code — all deferred to W-plan time.** Recorded as
  recommendations in the W design-decisions report; operator confirms when W
  is greenlit.

## Verification

- MCP registration: `33` default, `26` opted; exclusions == `CLI_READ_TOOLS`;
  write tools + `mastra_update_r2_allowlist` stay registered.
- CLI-vs-MCP parity: all 7 read tools normalized deep-equal to their MCP
  response with a field-set guard.
- SessionStart: opted normal + fatal paths emit the banner; non-opted helper
  path is byte-identical to pre-change.
- Wiring: only `.mcp.json` carries the flag; the other two `mcp.json` files
  untouched.
- Live smoke: `LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs loop_describe '{"tier":"summary"}'` returned a real non-degraded summary
  (`tool_count: 32`, `record_type_count: 2`, `rule_count: 12`).
- Full suite: **2375 tests / 479 suites — 2374 passed, 1 pending, 0 failed.**
- Review: **9.5/10**, 0 critical/high/medium findings.
- `git diff --check` clean.
- Runtime-agnostic audit (`check_runtime_agnostic`): `core/cli-tools.js` 6/6,
  `bin/loop.mjs` 6/6. Adapter-level failures on `server.js` and the
  Claude-only SessionStart hook reproduce the same as `HEAD` — no new
  regression; independent diagnosis recommended against gaming the checker.
- Acceptance criteria: 7/7.

## Reflection

The shipped shape is genuinely additive + config-gated: rolling back any one
phase is a small, scope-bounded revert. The SessionStart signal-visibility
risk was the one Validation Session finding that materially shaped
implementation — Q2 (hook reads no config today) forced the
`readSurfaceMcpJson()` helper, and that helper is now the single point that
decides whether the banner fires. Worth remembering: the onramp's "cost
dissolution" section assumed signal reachability; the validation proved it
did not exist yet.

The self-footgun probe is the most uncomfortable finding. R delivered cleanly
because read tools do not promote rules; the moment W lands
`meta_state_promote_rule` on the CLI transport, a promoted regex could brick
`bin/loop.mjs` itself. The regression test now locks that risk into the
suite, but mitigation (promotion-path self-match guard, or keep promotion
MCP-only) is a W plan decision, not an R decision — and it sits in
`w-design-decisions-...` waiting for the operator.

## Next steps

- **T2 evidence.** Accrue during normal `.claude` sessions per the protocol
  in `implementation-260722-1119-mcp-read-optout.md`. Watch for: attempts to
  call an absent `mastra_<read>` tool, malformed CLI JSON arguments, exit-1
  vs exit-2 confusion, missing SessionStart routing guidance. File a
  `loop-anti-pattern` finding on recurring ergonomic failures; record a
  positive change-log note after multiple clean sessions.
- **W gate.** W remains blocked on T2 evidence + operator confirmation of W
  scope, not on R's completion. Resolve the self-footgun (promotion-path
  guard vs MCP-only promotion), confirm tool-set boundary, then draft the W
  plan.
- **No follow-up commits in this journal turn.** Reporting, decision, and
  evidence work only; no source / plan / docs churn.

## Publishing

AgentWiki publish skipped — neither `agentwiki` CLI nor AgentWiki MCP tools
are exposed in this session. Local journal file is the source of truth.
