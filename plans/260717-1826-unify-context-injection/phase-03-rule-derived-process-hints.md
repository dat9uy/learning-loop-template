---
phase: 3
title: "Rule-derived process hints (hint_text + projection)"
status: pending
priority: P1
effort: "1d"
dependencies: [2]
---

# Phase 3: Rule-derived process hints (hint_text + projection)

## Overview

Move the 8 hand-mirrored PROCESS_HINTS rows onto their agent-checklist rule entries as a curated `hint_text` field, make `buildProcessHints()` a projection (standalone registry hints + rule-derived rows), and delete the H6 nag gate. Promotion of an agent-checklist rule becomes one tool call — the mechanism-level state-3 move: rule→hint derivation is deterministic, while hint consumption stays agentic (state-2).

## Requirements

- Functional:
  - Rule entry schema (`core/meta-state.js`, rule branch near `:451`): add optional `hint_text` (string, min 20 chars). Persisted on the rule entry; patchable via `meta_state_patch` (verify the per-kind patch schema admits it — it derives from the same zod branch, so it should; test it).
  - `meta_state_promote_rule` (`meta-state-promote-rule-tool.js`): add optional `hint_text` param; when `pattern_type === "agent-checklist"` and `preview === false`, **require** it — reject with `hint_text_required_for_agent_checklist` and a one-line explanation (actionable rejection, per the empty-patch lesson). Non-agent-checklist promotions may carry it optionally (gate rules are state-3-enforced and normally don't need injection).
  - Backfill: set `hint_text` on the 8 active agent-checklist rules from the current PROCESS_HINTS rows (verbatim prose — it is already operator-curated and injection-tuned): `rule-pr-body-registry-deltas` ← row 2, `rule-runtime-agnostic-features` ← row 3, `rule-tool-integration-same-commit-dep` ← row 4, `rule-fallow-brief-on-gate-failure` ← row 5, `rule-short-slug-for-risk-records` ← row 6, `rule-import-chain-analysis-after-tool-deletion` ← row 7, `rule-assertinvariant-at-boundary` ← row 8, `rule-required-status-checks-verify-combined-status` ← row 10. Mutations via `meta_state_patch` only (never direct file write).
  - Registry (`core/hint-registry.js` from Phase 2): the 8 rule-shaped process entries lose their inline `text` and gain `derived_from_rule: "<rule_id>"`. The 2 standalone process rows (test discipline, file-index drift) stay inline with `derived_from_rule: null`.
  - Projection: `buildProcessHints()` = for each process-kind registry entry in order: standalone → `text`; rule-derived → `hint_text` of the active rule (read via `loadPromotedRules`). Rule-derived entries whose rule is missing/inactive are **skipped with a stderr-visible warning in the renderer's provenance**, not rendered stale. Note: projection now does registry I/O — update the `buildProcessHints` JSDoc ("Pure function — no I/O" is no longer true) and thread `root` through callers.
  - Delete the H6 nag block (`loop-describe-tool.js:121-133`). Coverage is by construction; an invariant test replaces the nag.
  - Renderer provenance marks rule-derived rows as `source: "rule:<rule_id>"` — this is the debuggability hook for "where did this injected line come from."
- Non-functional:
  - Injected SessionStart prose is byte-identical before/after the backfill (projection of the same curated strings). Test-asserted.
  - No new hand-maintained alignment points: adding an agent-checklist rule with `hint_text` automatically appears in the next session's injection (registry order = rule-append order for derived rows... see ordering note below).

## Architecture

```
finding --meta_state_promote_rule(hint_text)--> rule entry (hint_text persisted)   [state-3 anchor]
                                                        │
hint-registry process entries: standalone {text} | derived {derived_from_rule}     [single source]
                                                        │
buildProcessHints(root) = map(entries): text ?? lookup(rule.hint_text)             [projection, deterministic]
                                                        │
                                          hint-renderer → all channels             [state-2 injection]
```

Ordering: registry array order is canonical. Rule-derived entries keep their current positions (the 8 entries stay where the mirrored rows were), so injection order is unchanged by the backfill. A *new* agent-checklist rule promoted later appends a derived registry entry — the promote tool returns a `next_step` note telling the operator to add the one-line registry entry `{ slug, kind: "process", derived_from_rule: "<rule_id>" }` (code edit, one line, no prose duplication). This is the deliberate residual human step: the rule owns the prose; the registry owns the ordering.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (rule schema branch: `hint_text`)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js` (param + required-guard + next_step note)
- Modify: `tools/learning-loop-mastra/core/hint-registry.js` (8 entries → `derived_from_rule`)
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (`buildProcessHints` projection + JSDoc)
- Modify: `tools/learning-loop-mastra/core/hint-renderer.js` (rule-derived resolution + provenance source tagging)
- Modify: `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` (delete H6 block)
- Modify: `meta-state.jsonl` (8 rule backfills via `meta_state_patch` — registry delta, enumerate in PR body per `rule-pr-body-registry-deltas`)
- Create: `tools/learning-loop-mastra/__tests__/rule-derived-process-hints.test.cjs`

## Implementation Steps (TDD)

1. **Tests first** (`rule-derived-process-hints.test.cjs`):
   - Schema: rule entry with `hint_text` validates; without it validates (optional); `meta_state_patch` can set it on a rule entry.
   - Promote guard: `meta_state_promote_rule` with `pattern_type: "agent-checklist"` and no `hint_text` → `promoted: false, reason: "hint_text_required_for_agent_checklist"`; with `hint_text` → persists on the rule entry. (Temp GATE_ROOT + `LOOP_SESSION_MODE=live` per existing promote-tool tests.)
   - Projection: with a fixture rule carrying `hint_text`, `buildProcessHints(root)` includes the rule's text at the derived entry's position; inactive/missing rule → row skipped + provenance warning.
   - Invariant (replaces H6): every active agent-checklist rule in the real registry has non-empty `hint_text` AND a registry entry with `derived_from_rule` === its id — and vice versa (no orphan derived entries).
   - Byte-identity: post-backfill `buildProcessHints(root)` deep-equals the pre-change PROCESS_HINTS order/content.
   - `loop_describe` warm tier contains no `H6 ordering gate` warning.
   - Red.
2. Schema change in `core/meta-state.js` (rule branch). Verify patch-tool per-kind schema picks it up (it derives from the same branch).
3. Promote-tool: `hint_text` param + guard + `next_step` note in the success payload.
4. Registry: flip the 8 entries to `derived_from_rule`; loop-introspect projection; renderer provenance tagging.
5. Backfill the 8 rules via `meta_state_patch` (one call per rule; record the session_id).
6. Delete the H6 block from `loop-describe-tool.js`.
7. `pnpm test:one` the new test + promote-tool tests + loop-describe tests → green; `pnpm test:iter` → green.

## Success Criteria

- [ ] 8 active agent-checklist rules carry `hint_text`; invariant test passes in both directions
- [ ] Promote of agent-checklist rule without `hint_text` rejected with actionable reason
- [ ] H6 nag block deleted; `loop_describe` warm shows no H6 warning
- [ ] SessionStart injected process-hint prose byte-identical to pre-change (render test)
- [ ] `pnpm test:iter` green; PR body enumerates the 8 patched rule entries per `rule-pr-body-registry-deltas`

## Risk Assessment

- **Risk:** projection I/O on the SessionStart hot path (registry read per render). **Mitigation:** hooks already read the registry for stale-dispatch hints in the same process (`loadRegistry` in the discoverability hook); reuse that snapshot — the renderer accepts an optional preloaded `rules` array.
- **Risk:** `hint_text` on the rule + registry entry with `derived_from_rule` is still two artifacts per rule. **Accepted deliberately:** the registry entry is one line with no prose (ordering only); the prose lives only on the rule. The invariant test locks the pair.
- **Risk:** operators edit `hint_text` directly in meta-state.jsonl. **Mitigation:** write gate blocks direct registry writes already; document the `meta_state_patch` path in the tool description.
- **Risk:** wire-format coercion of the new `hint_text` param (recurring MCP issue meta-260709T1316Z). **Mitigation:** plain optional string — the coercion class affected arrays/booleans, not strings; promote-tool tests assert persistence.
