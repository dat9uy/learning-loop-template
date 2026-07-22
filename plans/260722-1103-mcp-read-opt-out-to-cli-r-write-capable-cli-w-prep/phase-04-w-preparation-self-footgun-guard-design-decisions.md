---
phase: 4
title: "W preparation — self-footgun guard + design decisions"
status: pending
priority: P2
effort: "0.5d"
dependencies: []   # independent of 1-3; pure-read investigation + additive test
---

# Phase 4: W preparation — self-footgun guard + design decisions

## Overview

<!-- Updated: Validation Session 1 - --schema flag DEFERRED to W; self-footgun + design-decisions record are the phase's real work -->

De-risk the follow-on write-capable CLI (W) without implementing it. W is a separate plan, drafted only after R accrues read-path T2 evidence and the operator confirms W scope (W report §1, §6). This phase lands the one investigation that **gates W's tool-set boundary** — whether `meta_state_promote_rule` can brick the CLI transport by promoting a bash-gate regex that matches `node bin/loop.mjs` itself (the self-footgun, W report §4 item 4 + §7 Q5) — and resolves W's open design questions (W report §7) into documented recommendations the W plan consumes. The `--schema` flag is **deferred to W** (Validation Session 1) — R's read args are simple; build it in W at latest, or sooner only if T2 dogfood shows the agent struggling.

## Requirements

- Functional: an investigation + test determines whether the existing rule-promotion path blocks a regex that would match `node bin/loop.mjs`. The test locks the behavior either way: if the path blocks self-referential gate rules, the test proves it; if it does not, the test documents the gap and W must add a guard or exclude `meta_state_promote_rule` from the CLI.
- Functional: W's open design questions (W report §7 Q1-Q6) are resolved or explicitly deferred-with-recommendation in this phase's report, so the W plan starts with no unanswered scope questions.
- Non-functional: the `--schema` flag is **deferred to W** (Validation Session 1). Not built in R. Recorded here as the Q6 decision so the W plan consumes it. R's read args are simple; YAGNI applies.
- Non-functional: this phase does NOT expand the CLI to mutation tools, does NOT add write-path parity, does NOT touch contract L25. Those are W. Phase 4 is investigation + a guard test + a design-decisions record.

## Architecture

**Self-footgun investigation (the gating artifact).** `meta_state_promote_rule` can promote a bash-gate regex (`pattern_type: "regex"`, `enforcement: "gate"`). If a CLI runtime promotes a regex matching `node .../bin/loop.mjs`, the bash gate would `block` the CLI's own invocations — bricking the transport. Two questions, both answerable by reading + a test:
1. Does the promotion path (`core/gate-logic.js` rule promotion + `core/evaluate-bash-gate.js` `applyPromotedRules`) reject self-referential rules? (The `260721-1933` Phase 3 guard test `cli-bash-gate-guard.test.js` already proves no *existing* rule blocks the CLI; this investigation is about *future* promoted rules.)
2. If not, what is the guard? Options: (a) block `meta_state_promote_rule` via CLI entirely (exclude it from `CLI_WRITE_TOOLS` in W); (b) add a self-referential-rule rejection in the promotion path; (c) a CLI-side guard that detects a rule matching its own command shape.

The investigation reads `core/gate-logic.js` (rule promotion) + `core/evaluate-bash-gate.js` (`applyPromotedRules`) + the `meta_state_promote_rule` handler, and writes a test that promotes a `node bin/loop.mjs`-matching regex (in a tmpdir) and asserts the outcome. The outcome determines W's tool-set boundary (W report §7 Q1: carry all mutation tools vs exclude `promote_rule`).

**Design-decisions record.** A short section in this phase's report (or a `plans/reports/` note) that resolves each W §7 question with a recommendation and a deferral note where the operator must confirm at W-plan time:

| W §7 Q | Recommendation | Rationale |
|--------|----------------|-----------|
| Q1 tool-set boundary | Carry all handler-module mutation tools | Closes the split-brain (W report §4); marginal cost is one set entry each. Subject to the self-footgun result: if `promote_rule` is unguarded, exclude it (or guard it) — this phase's output decides. |
| Q2 dispatch commit stage | Prepare via CLI, commit via MCP | The *commit* stage hits GitHub via `gh` (network/subprocess); keep it on MCP. Prepare is CLI-portable. Avoids a `gh` subprocess dependency in the CLI. |
| Q3 `update_r2_allowlist` | Leave MCP-only (operator-only surface) | Logic is inline in `mastra/server.js:70-107`, not a handler module. Extract only if a CLI runtime must self-serve allowlist edits — YAGNI. |
| Q4 write-denial exit code | Exit 1 (rejection) | A write denial / record-writer validation failure is a genuine rejection, not a caller-config error. Exit 2 stays reserved for caller-config preconditions (missing `LOOP_SURFACE`, bad JSON, ZodError). |
| Q5 self-footgun | DECIDED BY THIS PHASE | The investigation's result is the answer; the test locks it. |
| Q6 `--schema` flag | **Deferred to W** (Validation Session 1) | Pull-on-demand is the right shape (not embedding arg sketches in hints, which re-injects schema and partially undoes the win). Not built in R — YAGNI; R's read args are simple. W builds it; or R builds it sooner only if T2 dogfood shows the agent struggling to compose read args. |
| Q7 dogfood runtime | Same as R's dogfood | W dogfoods on the same runtime that accrued R's read-path T2, to extend the evidence stream. |

**`--schema` flag — DEFERRED (Validation Session 1).** Not built in R. Recorded for W: `bin/loop.mjs <tool> --schema` would read the manifest entry, run `normalizeInputSchema(legacy.schema)`, and print a JSON representation of the zod schema (field → type/required/enum). Pure, additive, no write path; reuses Phase 1's shared `CLI_READ_TOOLS` to validate `<tool>`. W builds it; R builds it sooner only if T2 dogfood shows the agent struggling to compose read args.

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/cli-self-footgun-guard.test.js` (the investigation's lock)
- Investigate (read-only): `tools/learning-loop-mastra/core/gate-logic.js` (rule promotion), `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (`applyPromotedRules`), `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js`
- Create: a design-decisions record (this phase's report section, or `plans/reports/ak-260722-w-design-decisions.md`)
- Delete: none

## Implementation Steps (TDD)

1. **Investigate (read).** Read `core/gate-logic.js` rule-promotion + `core/evaluate-bash-gate.js` `applyPromotedRules` + the `meta_state_promote_rule` handler. Determine: does promoting a regex matching `node bin/loop.mjs` get rejected, or does it go through and then block the CLI? Record the finding with file:line evidence.
2. **Test first — self-footgun.** Add `__tests__/cli-self-footgun-guard.test.js`:
   - In a freshly-seeded tmpdir, promote a regex rule whose pattern matches `node tools/learning-loop-mastra/bin/loop.mjs` (via the promotion path or by writing the rule directly into the registry the gate reads).
   - Assert the outcome the investigation found: either (a) the promotion is rejected (test passes — self-referential rules blocked at promotion), or (b) the promotion succeeds and `evaluateBashGate({ command: "node .../bin/loop.mjs meta_state_list '{}'" })` returns `block` (test documents the gap — W must guard or exclude `promote_rule`).
   - Either way, the test locks the behavior so a future change to the promotion path is caught.
   Run → green (the behavior is whatever it is today; the test pins it).
3. **Write the design-decisions record.** Fill the table in Architecture (Q1-Q7) with the self-footgun result from step 1-2 folded into Q1/Q5. Note where operator confirmation is required at W-plan time (Q1 tool-set boundary if the self-footgun forces an exclusion; Q7 dogfood runtime). Q6 is already decided: `--schema` deferred to W (Validation Session 1).
4. Run `pnpm test` (full suite) → green. Phase 4 is additive (a guard test); no behavior change to the CLI read path or MCP.

## Success Criteria

- [ ] Self-footgun investigation recorded with file:line evidence; `cli-self-footgun-guard.test.js` locks the behavior (promotion rejected, OR documented gap + W guard noted).
- [ ] W design-decisions record resolves/defers W report §7 Q1-Q7 with recommendations; Q1/Q5 reflect the self-footgun result; Q6 records the `--schema` deferral.
- [ ] `pnpm test` full suite green; no CLI read-path or MCP behavior change.

## Risk Assessment

- **Investigation finds the gap (self-referential rules NOT blocked).** This is the most likely outcome (the `260721-1933` guard test only covers *existing* rules, not future promoted ones). Mitigation: the test documents the gap; the design-decisions record routes it to W (exclude `meta_state_promote_rule` from `CLI_WRITE_TOOLS`, or add a promotion-path guard). R is unaffected — R is read-only and carries no mutation tools, so the self-footgun cannot fire in R. This is exactly why the investigation is W-prep, not R-work.
- **`--schema` flag — DEFERRED (Validation Session 1).** Not built in R, so no scope-creep risk in this phase. When W builds it, it must be pull-on-demand (only on `--schema`), not pushed into hints — pushing schema re-injects the context cost the CLI transport removes.
- **Design decisions reversed at W-plan time.** The recommendations are advisory; the operator may reverse them when W is greenlit. Mitigation: each decision cites its rationale; reversals are expected and cheap (the W plan re-decides). This phase's value is making the *current* best recommendation explicit so W starts from a resolved baseline, not a blank slate.
- **Rollback:** delete the guard test + the design-decisions record. Phase 4 changes no production behavior (`--schema` is deferred, nothing to roll back there).