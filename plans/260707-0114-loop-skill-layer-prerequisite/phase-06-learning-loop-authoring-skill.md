---
phase: 6
title: "L1 recursion-bound statement + authoring subsection"
status: pending
effort: "low"
priority: P2
dependencies: [2, 4, 5]
---

# Phase 6: L1 recursion-bound statement + authoring subsection in `docs/loop-engine.md`

## Overview

Land the L1 statements that must ship AFTER the gate (phase 5) so they are true on disk when written: the self-maintaining recursion-bound statement + the "Authoring loop-maintained skills" subsection, both into `docs/loop-engine.md` (the L1 invariant doc — NOT the `learning-loop` SKILL.md, which is a prompt-authoring skill for a different audience; red-team finding). The `learning-loop` SKILL.md's `maturity:` frontmatter + `loop-engine.md` cross-ref were folded into phase 4's materialization (validation decision 2026-07-07), so this phase does NOT edit the SKILL.md — the gated-path proof is phase 5's tests, not a phase-6 SKILL.md edit. This phase is docs-only (loop-engine.md is ungated per the Rec 12 scope boundary) + a `meta_state_log_change` call.

## Requirements

- Functional: `docs/loop-engine.md` carries the recursion-bound statement (a skill edit is a bound-artifact edit → triggers a change-log; the change-log is a record write, not a bound-artifact edit → recursion stops) + a short "Authoring loop-maintained skills" subsection (maturity levels, mirror requirement, change-log step). `meta_state_log_change` records the change. The contract validator + parity test still pass (no SKILL.md or mirror change this phase).
- Non-functional: `loop-engine.md` vocabulary counts (`deterministic-step`, `agentic-step`, `record`, `rule`, `promotion`) unchanged from the phase-1 baseline; the 13 escape-hatch items not renumbered; file < 800 lines; recursion-bound wording is honest (intended invariant; enforcement deferred to broadened Rec 12's change-log gap detection, decision 8). `learning-loop` SKILL.md NOT edited this phase (validation decision).

## Architecture

The recursion-bound statement is a mechanism invariant (skill files are bound artifacts only because the phase-5 gate makes them so). Per the red-team finding, it lands after the gate ships — phase 6, not phase 1. The authoring standard (maturity levels, mirror steps, change-log step) is maintainer-facing content; per the red-team finding it belongs in the L1 invariant doc (`loop-engine.md`), not the prompt-authoring `learning-loop` SKILL.md. Phase 4 already added the SKILL.md `maturity:` frontmatter + cross-ref to this subsection, so the SKILL.md is settled before this phase names the subsection it points at.

## Related Code Files

- Modify: `docs/loop-engine.md` (add the recursion-bound statement + the "Authoring loop-maintained skills" subsection near the escape-hatch section — placement by reading the doc, not line number).
- Call: `meta_state_log_change` MCP tool (manual change-log recording the L1 doc change).
- Verify: `node contract.js claude-code|droid|mastra-code` (all exit 0 — unchanged from phase 4, since this phase touches no skill or mirror); `skills-mirror-parity.test.js` green; `pnpm test` on the contract + parity suites.
- NOT modified: any `<surface>/skills/**` file (phase 4 settled the SKILL.md; this phase is `docs/`-only, which is ungated).

## Implementation Steps

1. **Tests-first (grep invariants as the test):**
   - `docs/loop-engine.md` carries the recursion-bound statement (`grep -c "recursion"` ≥ 1, or the agreed phrase) + the "Authoring loop-maintained skills" subsection heading.
   - `docs/loop-engine.md` vocabulary counts (`deterministic-step`, `agentic-step`, `record`, `rule`, `promotion`) unchanged from the phase-1 baseline.
   - No `<surface>/skills/**` file changed this phase (`git diff --name-only` shows no skills path).
   - `node contract.js claude-code|droid|mastra-code` all exit 0; `skills-mirror-parity.test.js` green (regression — this phase must not break phase 2/4/5 state).
2. Edit `docs/loop-engine.md` (ungated — `docs/**` is out of the gate's scope per Rec 12 boundary):
   - Add the recursion-bound statement: a skill file is a bound artifact (per the L2 contract); editing it triggers a change-log; the change-log is a record write (MCP tool, already logged in `meta-state.jsonl`), not a bound-artifact edit → the recursion is bounded. Frame honestly: this is the *intended* invariant; its enforcement (auto-detecting a skill edit that did not emit a change-log) is deferred to the broadened Rec 12's change-log gap detection + session-start gap surfacing (decision 8). The phase-5 gate makes the bound-artifact claim true on disk; the change-log step is operator-triggered until the Rec 12 hook ships.
   - Add a short "Authoring loop-maintained skills" subsection: maturity levels (state-1/2/3 per `docs/philosophy.md`), the mirror requirement (skills mirror across `.claude`/`.factory`/`.mastracode` via the phase-4 fan-out), and the change-log step (every skill edit → `meta_state_log_change` → `meta-state.jsonl`). This is the maintainer standard.
   - Place by reading the doc (section anchors, not line numbers); do not renumber the 13 escape-hatch items. File < 800 lines.
3. Call `meta_state_log_change` with `change_target: "docs/loop-engine.md"`, `change_dimension: "semantic"` (the L1 invariant + the authoring standard), a short `reason` naming this plan. This is the change-log half of self-maintenance.
4. Run the post-state checks (step 1). Run `pnpm test` on `interface/__tests__/contract.test.js` + `interface/skill-md-references-tools.test.js` + `legacy-mcp/skills-mirror-parity.test.js`. Run `node contract.js claude-code`, `droid`, `mastra-code` — all exit 0.

## Success Criteria

- [ ] `docs/loop-engine.md` carries the recursion-bound statement (honest: intended invariant; enforcement deferred to broadened Rec 12) + the "Authoring loop-maintained skills" subsection; vocabulary counts unchanged.
- [ ] No `<surface>/skills/**` file modified this phase (`git diff --name-only` confirms; maturity + cross-ref came from phase 4).
- [ ] `meta_state_log_change` recorded for the `loop-engine.md` change.
- [ ] `node contract.js claude-code|droid|mastra-code` all exit 0; `skills-mirror-parity.test.js` green (regression intact).
- [ ] `docs/loop-engine.md` < 800 lines; 13 escape-hatch items not renumbered.

## Risk Assessment

Low. Docs-only (`docs/**` ungated); no skill, no mirror, no gate change. The only risk is shifting L1 framing every future session inherits — but the statement is now true on disk (the phase-5 gate shipped) and honestly framed (enforcement deferred), so it reduces the contradiction the red-team flagged (an invariant stated before its mechanism). Rollback: `git checkout docs/loop-engine.md`.