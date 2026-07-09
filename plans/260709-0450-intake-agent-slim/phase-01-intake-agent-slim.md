# Phase 1: intake_agent slim implementation

## Context

- Plan: `plans/260709-0450-intake-agent-slim/plan.md`
- Finding: `meta-260709T0159Z`
- Current instructions: `tools/learning-loop-mastra/mastra/agents/instructions/intake-agent.js` (single `export const instructions = \`...\``)

## Requirements

1. Job description: "produce an ordered, deterministic verification plan" — drop "orient an operator into the current meta-state."
2. Required start-of-call sequence: drop the mandatory `loop_describe` orient step; relabel the read sequence as *planning inputs*. `loop_describe` becomes optional hint context.
3. Keep: bound-surface/unbound-surface invariant note, read-only contract, stop conditions, plan-synthesis output shape (a–e).
4. `agents-manifest.json` `intake_agent` description: reword if it restates "orient."

## Steps

1. Rewrite `intake-agent.js` `instructions`:
   - Preamble: "You are intakeAgent, the learning loop's plan-synthesis surface. Your job is to produce an ordered, deterministic verification plan from the current meta-state. You are READ-ONLY." (drop "orient an operator … into the current meta-state.")
   - Bound/unbound surface note: keep as-is (still correct, still load-bearing).
   - Required start-of-call sequence: rename to "Planning inputs (read-only, no exceptions)". Drop the mandatory `loop_describe` step; keep `meta_state_list({entry_kind:"rule"})` + `loop-design`, `meta_state_query_drift`, optional `meta_state_relationships`/`get_relationship`. Add: "Optionally call `mastra_loop_describe({tier:"warm"})` for discoverability hints; it is not required — `loop_describe` is the bound-surface orient, not this agent's job."
   - Tool surface list: keep `loop_describe` in the allowed list (optional use).
   - Output shape: keep (a) rules in force, (b) loop-designs awaiting action, (c) drift ranked, (d) ordered verification steps, (e) hand-off note. Drop "No prose narration between sections" only if it conflicts — keep it.
   - Stop conditions: keep; update any "orient" wording to "plan."
2. Inspect `agents-manifest.json` `intake_agent` entry; reword description if it says "orient." Keep `id`/`name`/`file`/`export`/tool list unchanged.
3. `mastra-code-smoke.test.cjs:85` — comment lists `ask_intake_agent` as an agent-wrapper example; agent is kept → no change. Verify only.
4. `dead-code-baseline.json:61` — `duplicate_exports` entry for `intake-agent.js` stays (file kept) → no change. Verify only.
5. Run tests:
   - `pnpm --filter learning-loop-mastra test -- mastra-code-smoke` (or the repo's test invocation)
   - any intake-agent instruction test (grep `intake-agent` under `__tests__`)
   - dead-code baseline test if present
6. Record `meta_state_log_change` per bound-artifact file edited (intake-agent.js, agents-manifest.json if changed), in-PR.

## Tests / validation

- Smoke test: `ask_intake_agent` still in `mcp_tool_names`; `loop_describe` + `meta_state_list` still present.
- Instruction test (if any): update pinned substring if it asserted the "orient" wording.
- No new test required (slim is a wording/framing change; behavior = same read-only plan synthesis).

## Rec 12 change-logs (in-PR)

- `intake-agent.js`: `change_dimension: "semantic"`, `change_target: "tools/learning-loop-mastra/mastra/agents/instructions/intake-agent.js"`, `change_diff: { changed: ["instructions string"] }`, reason: "Slim intake_agent: reframe job from orient+plan to plan-synthesis; loop_describe is the bound-surface orient (Rec 4 UQ1 / meta-260709T0159Z)."
- `agents-manifest.json` (if edited): same dimension, target = the manifest, reason matching.

## Risks / rollback

- Low. Rollback = `git revert` (change-logs in-PR).