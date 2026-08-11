# Continuation Handoff: Hermes Runtime Onboarding — Step 1 of the Hermes-Participation Arc

## Mission and current status

Onboard **Hermes Agent as a first-class runtime surface** of the learning loop (`.hermes/`), replicating the Claude Code MCP+hooks setup, so Hermes sessions participate in the loop under its gates with `LOOP_SURFACE=.hermes` identity — the first step of a longer arc (see "The arc" below).

**Status:** ✅ **Step 1 COMPLETE** — shipped, verified, merged (2026-08-11).

Shipped:

- **PR #144** `feat(loop): onboard Hermes Agent as 4th runtime surface` (merge `2ac049fe`, 4 commits: feat/test/docs/chore)
  - `.hermes/` surface: `mcp.json` (`LOOP_SURFACE=.hermes`), `hooks.json` (wiring record), 5 gate shims + a session-start inject adapter, `README.md`, skill mirrors (`learning-loop`, `coordination-gate`)
  - Core: `SURFACES` += `.hermes`; identity-pin `.hermes → hermes`; `contract.js` gains the `hermes` runtime; skill-mirror check now SURFACES-driven; `skills-lock.json` + `hooks-lock.json` extended (`.hermes` wired as `kind:"adapter"`)
  - Bug fixed en route: `@mastra/mcp` SDK wrote its startup banner to stdout, corrupting the stdio protocol for strict MCP clients — now routed to stderr (protocol-correct for all runtimes)
  - R2 allowlist `hermes` entry + `.hermes` gitignore patterns
- **PR #145** `docs(loop): correct AGENTS.md gate flow — CI-authoritative, no pre-push hook` (merge `9de41bd3`)
  - AGENTS.md §3/§4b aligned with the PR #124 migration: no local pre-push hook; CI (`test.yml`) is the sole authoritative full-suite + fallow gate; R13 regression guard locks it

Verification evidence (all green):

- `node tools/learning-loop-mastra/interface/contract.js hermes` → `{ok:true, missing:[]}`
- Full `pnpm test`: 3429 passed / 4 skipped (gated npx round-trip), 0 failures
- `pnpm gate:self-verify`: all steps passed (fallow: 0 dead code, 0 introduced findings)
- CI on both PRs: `test` / `fallow` / `refs-check` / `registry-deltas` / `union-safety` all pass

Change-logs recorded (the audit trail for this work):

- `meta-260811T1617Z-hermes-runtime-surface-hermes-agent-onboarding`
- `meta-260811T1628Z-hermes-surface-completion-test-fixtures-r2-allowlist-docs`
- `meta-260811T1653Z-agents-md-gate-flow-section-pre-push-hook-removal`

## Environment state (machine-local, NOT committed)

`~/.hermes/config.yaml`:

- `mcp_servers.learning-loop` — `node <abs path>/tools/learning-loop-mastra/mastra/server.js`, `env: {LOOP_SURFACE: ".hermes"}`, enabled, 8/8 tools
- `hooks:` — `pre_tool_call` (`terminal` → bash-gate; `write_file|patch` → write-gate), `pre_llm_call` (inbound-gate; loop-surface-inject), `on_session_start` (recurrence-check), `post_tool_call` (toolchain-capture, matcher `terminal`, fires on non-success)
- `hooks_auto_accept: true` (the consent allowlist populates at the next session start)
- **The gates are cwd-scoped**: every shim carries a project-scope guard pinned to `/home/datguy/learning-loop-template` — sessions outside the repo are ungated by design (Hermes shell hooks are global; this restores Claude-Code-like project scoping)

Git per-clone: `merge.union.driver` canonical (`git merge-file --union %A %O %B`); push mode `https-gh` (helper + `gh auth` ok). No pre-push hook (CI-authoritative, per PR #145).

## The arc — why this is step 1

The loop's telos: **grow the deterministic surface; shrink the agentic surface.** The onboarding wired the transport; the arc is what Hermes *participation* unlocks. Candidates, in rough priority:

1. **Adopt the identity marker (`RUNTIME_ID=hermes`)** — CONTRACT.md Req #4 is PROPOSED/advisory today; the bundled hardening plan (LIM-3 caller identity, `docs/security/plan-5-hardening.md`) will make it mandatory. Cheap to adopt now: set `RUNTIME_ID` on the `.hermes` MCP env + document.
2. **Wire the git preflights for `.hermes`** — `hooks-lock.json` declares `.hermes: kind:"none"` for `session-start-git-push-preflight` + `session-start-git-merge-driver-preflight` (same deferral as `.factory`/`.mastracode`). Hermes can host them via the `pre_llm_call` first-turn adapter — closes the coverage gap for the surface.
3. **Pilot the change-log half of the recurrence→promotion bridge** — open design question #1 in `docs/loop-engine.md`: which agentic-deferral change-logs recur and are ready to promote is not yet detected mechanically; promotion stays operator-triggered. Hermes (with `loop_get_instruction` / the `meta_state` CLI surface) is positioned to be the first runtime to pilot a change-log recurrence query → operator promotion-review surface.
4. **Provenance (agentic vs deterministic) in the registry** — open design question #2 (schema change, deferred; would make the loss function measurable).
5. **Real loop work from Hermes** — the point of the onboarding: run findings / plans / promotion-review sessions under `LOOP_SURFACE=.hermes` with the gates live. First candidate: a Hermes-role plan (what the runtime does week to week: report findings with `evidence_code_ref`, review deferrals, keep the surface healthy).

## Open questions for the operator

- What is the intended Hermes role cadence (per-session, scheduled, on-demand)?
- Priority ordering of the arc: identity marker → preflight wiring → promotion-bridge pilot → role plan?
- Should `.hermes` mirror the git-preflight hooks or stay pull-based (`kind:"none"`)?
- Worth filing the pre-push-flow drift finding retroactively? (Resolved by PR #145; a `meta_state_report` would preserve the decision trail beyond the change-log.)

## Resume recipe (next session)

1. Read this handoff; `git log --oneline -6` to confirm state; `git status` clean on `main`.
2. Re-verify surface health: `node tools/learning-loop-mastra/interface/contract.js hermes` → `ok`; `hermes mcp list` / `hermes hooks list` (allowlist populates on first session start).
3. Survey open findings: `LOOP_SURFACE=.hermes node tools/learning-loop-mastra/bin/loop.mjs meta_state_list '{"status":"open"}'`.
4. Pick the next step from the arc (operator decision — promotion stays human).
5. Remember the gates are live: bash/write tool calls inside this repo are evaluated by the loop; blocked calls return `{"decision":"block","reason":...}`. Out-of-repo sessions are ungated by the scope guard.
