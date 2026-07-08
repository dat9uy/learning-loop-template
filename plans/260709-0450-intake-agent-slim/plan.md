# Plan: intake_agent slim (Rec 4 UQ1)

**Status:** ready
**Date:** 2026-07-09
**Finding:** `meta-260709T0159Z` (Rec 4 UQ1, filed by the deprecate-intake-chain plan #42)
**Report:** `plans/reports/from-problem-solving-to-operator-260709-0450-rec456-shipped-next-move-findings-triage-report.md`

## Context

PR #42 deprecated the *deterministic* intake chain (`workflow_intake_orient` + `workflow_intake_plan`) as redundant with `loop_describe`. Its UQ1 flagged the *agentic* surface `intake_agent` as the same redundancy class — **partially**: `intake-agent.js:9` step 1 is literally `Call mastra_loop_describe({ tier: "warm" })`, so the orient half duplicates `loop_describe`; the plan-synthesis half (rank drift, ordered verification steps, hand-off note) adds value `loop_describe` alone does not. Decision: **slim** (drop redundant orient framing, keep plan-synthesis), not delete.

## Goal

Reframe `intake_agent`'s job from "orient an operator into the current meta-state and produce a plan" to "produce an ordered verification plan." Remove the orient framing/preamble that duplicates `loop_describe`'s bound-surface-orient role. Keep the plan-synthesis role and its read sequence as *planning inputs*.

## Decision (plan-level)

- **Slim, not delete.** `intake_agent` stays live in the MCP tool list. Delete is a stronger call deferred to a separate operator decision (UQ1 below).
- **Step 1 handling:** drop the *required* `loop_describe` step and the "orient an operator" framing. Keep `loop_describe` as an *optional* hint-read the agent may use for planning context (it is no longer billed as the orient). The plan-synthesis read sequence (rules + loop-designs enumeration, drift, relationships) stays required.
  - Rationale: the redundancy the finding flags is conceptual (the agent claims to be the orient surface when `loop_describe` is the orient surface), not the loop_describe call itself. Demoting it to optional removes the claim without losing a useful planning input.

## Files to modify (bound artifacts → Rec 12 change-log each, in-PR)

- `tools/learning-loop-mastra/mastra/agents/instructions/intake-agent.js` — rewrite the `instructions` string: job description, required start-of-call sequence, output shape preamble. (bound artifact: `tools/**` source)
- `tools/learning-loop-mastra/mastra/agents-manifest.json` — update `intake_agent` description if it restates the "orient" framing (bound artifact: manifest)
- `tools/learning-loop-mastra/__tests__/legacy-mcp/mastra-code-smoke.test.cjs:85` — comment-only example mentions `ask_intake_agent`; keep (agent kept). No change unless the comment claims orient-only. (test — NOT a bound artifact; no change-log)
- `baselines/fallow/dead-code-baseline.json:61` — `duplicate_exports` entry `instructions|.../intake-agent.js|...` stays (file kept). No change. (baseline — not a bound artifact)

## Acceptance criteria

1. `intake-agent.js` instructions no longer describe the agent's job as "orient an operator into the current meta-state"; job = plan synthesis.
2. The required start-of-call sequence no longer has a mandatory `loop_describe` orient step; `loop_describe` is optional hint context.
3. Plan-synthesis outputs (rules in force, loop-designs awaiting action, drift ranked, ordered verification steps, hand-off note) preserved.
4. `ask_intake_agent` still present in the MCP tool list (smoke test passes).
5. Per-file `meta_state_log_change` recorded for each bound-artifact edit, committed in-PR (clean `git revert`).
6. Tests green: `mastra-code-smoke.test.cjs`, any intake-agent instruction test, dead-code baseline unchanged.

## Phases

- `phase-01-intake-agent-slim.md` — the single implementation phase.

## Risks / rollback

- **Risk:** an existing caller relies on `intake_agent` billing itself as the orient surface. Mitigation: `loop_describe` is the documented bound-surface orient; `intake_agent` callers get plan synthesis, which they always did. Low.
- **Rollback:** `git revert` the PR (change-logs in-PR → clean, no orphan registry entries).