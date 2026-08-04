---
phase: 2
title: "Flake-Claim Steering Checklist"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 2: Flake-Claim Steering Checklist

## Overview

Promote an agent-checklist rule that steers runtimes away from unverified "pre-existing flake" claims — the behavioral half of Block + steer. Independent of Phase 1 (different rule, different finding origin), but shipped in the same plan.

## Requirements

- Functional: active agent-checklist rule with `hint_text` (≥20 chars), `hint_suggestion` (single line, 20-200 chars), and `pattern` = JSON string `{version:1,items:[{id,description}]}` describing the flake-claim discipline (schema: `core/meta-state.js:578-616,663-674`).
- Functional: rule appears in `buildProcessView` and SessionStart process hints (`.claude/session-context.json` on next session).
- Non-functional: satisfies the live-registry invariant test (`__tests__/rule-derived-process-hints.test.cjs:159-197`).
- **Locked-test ownership (red-team Critical):** promoting this rule derives a 13th process slug and breaks two live-registry locked tests unless they are updated in the same commit: `__tests__/hint-registry.test.cjs:73-94` (hardcoded 12-slug `deepStrictEqual` — its own comment requires conscious update) and possibly `__tests__/hint-renderer.test.cjs:63-88` (partition-count lock "exactly 3 partitions … all 28 hints" — flips if the new hint pushes a partition past `STD_CHAR_BUDGET`). Choose `hint_order` consciously: the view sorts `byOrderThenSlug`, so an unset order appends by slug and may land mid-array, breaking the locked set on ORDER, not just membership. Pick `hint_order` to place the rule deliberately (near the other verification/hygiene hints) and update the locked array to match.

## Architecture

`enforcement:"agent"`, `pattern_type:"agent-checklist"`. Projection: `buildProcessView` (`core/hint-registry.js:227-270`) derives a process row at read time (slug defaults to rule id minus `rule-`), consumed by `loop_describe` / `loop_get_instruction` and injected at SessionStart by `hooks/universal/session-start-inject-process-hints.cjs`. No code changes.

**Draft checklist content** (refine at promotion):

- item id `reproduce-at-parent` — "Before claiming a pre-existing flake, reproduce the failure at the parent commit AND at HEAD. A failure present only at HEAD is caused by your change."
- item id `compare-failing-test-set` — "Compare the failing-test SET against the documented baseline list, never pass/fail COUNTS. Baseline misses hide new regressions."
- item id `no-verify-is-gated` — "`git commit --no-verify` / `-n` and destructive `core.hooksPath` overrides are gate-denied (combined short flags like `-an` are NOT — do not use them either). The correct path for intentional derived-snapshot changes is `-u` refresh + clean commit; file observe-and-defer (Channel B) for genuine pre-existing failures."

`hint_text`: names the discipline + why (a false flake claim masked a self-caused regression and bypassed the gate). `hint_suggestion`: one-line actionable form, e.g. "Flake claim? Reproduce at parent commit, diff the failing-test set vs baseline, never bypass hooks."

Rule id: `rule-flake-claim-verification`. Origin finding: same escalate finding (`meta-260804T1600Z`), which is `category:"loop-anti-pattern"` ✓.

## Related Code Files

- Modify: `meta-state.jsonl` (via `loop.mjs meta_state_promote_rule` only)
- Modify: `tools/learning-loop-mastra/__tests__/hint-registry.test.cjs` — locked slug set (add the derived slug at its `byOrderThenSlug` position)
- Modify (conditional): `tools/learning-loop-mastra/__tests__/hint-renderer.test.cjs` — partition-count lock if the new hint flips the count
- Reference: `core/hint-registry.js`, `core/meta-state.js:578-674`, `meta-state.jsonl:275` (canonical example rule)

## Implementation Steps

1. **RED:** run `pnpm test:one tools/learning-loop-mastra/__tests__/hint-registry.test.cjs` and `pnpm test:one tools/learning-loop-mastra/__tests__/hint-renderer.test.cjs` — both green (baseline).
2. Promote `rule-flake-claim-verification` via `loop.mjs meta_state_promote_rule` with the draft items/hints and a consciously chosen `hint_order`.
3. **Expected red:** re-run both locked tests — `hint-registry.test.cjs` fails on the locked slug set (this is the test working as designed: "a promotion/deactivation must update it consciously").
4. Update the locked slug array in `hint-registry.test.cjs` to include `flake-claim-verification` at its `byOrderThenSlug` position; if `hint-renderer.test.cjs` flipped partition count, either shorten hint text to stay in budget or consciously bump the locked count (prefer staying in budget).
5. Re-run both + the invariant test `rule-derived-process-hints.test.cjs` — green.
6. Verify projection: `loop.mjs loop_get_instruction '{"key":"flake-claim-verification"}'` returns the hint; `loop.mjs loop_describe '{"tier":"warm"}'` lists it.
7. Run `pnpm test:unit` — green.

## Todo

- [ ] Rule promoted with valid items + hint fields + deliberate `hint_order`
- [ ] Locked slug set updated; partition lock green (or consciously bumped)
- [ ] Invariant test green
- [ ] loop_get_instruction / loop_describe show the hint
- [ ] `pnpm test:unit` green

## Success Criteria

- [ ] `rule-flake-claim-verification` active, enforcement agent, hint fields present
- [ ] Rule-derived process hint retrievable by slug
- [ ] Both locked live-registry tests updated in the same commit and green

## Risk Assessment

- Hint wording drifts into plan-specific narrative (plan IDs etc. — banned in stable artifacts; hints are registry data, but keep wording invariant-focused anyway).
- Checklist text must stay truthful about gate coverage (`-n` IS gated after Phase 1; combined `-an` is not) — mirror Phase 1's final pattern, update text if the pattern changes in preview.
- Low enforcement power alone — by design; the Phase 1 gate rule is the floor.
