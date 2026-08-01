---
phase: 3
title: "Finalize allowlist and resolve finding"
status: complete
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Finalize allowlist and resolve finding

## Overview
With the allowlist empty, the Phase 1 set-diff semantics are already a total ban (any current match is "new" ⇒ fail). Confirm that, update the rule's hint_text to drop the "once added" hedge, log a change-log entry, and resolve the source finding.

## Requirements
- Functional: the stable-artifacts test fails on any single plan-ID comment with an empty allowlist (verified by the negative check).
- Non-functional: rule hint reflects the shipped test; registry records the resolution.

## Architecture
- **Allowlist state:** empty array `[]` in the sidecar. The test's `currentMatches - allowlist` assertion now fails on any match — total ban, no code change to the test needed (KISS: the set-diff semantics generalize). Add an explicit assertion `expect(allowlist).toEqual([])` so the empty state is intentional, not accidental.
- **Rule hint update:** `meta_state_patch` on `rule-no-plan-ids-in-stable-code-artifacts` (entry_kind `rule`) → replace hint_text's "Regression test (once added): ..." with "Regression test: tools/learning-loop-mastra/__tests__/stable-artifacts-no-plan-ids.test.js (total ban; allowlist empty)." Keep the rest of the rule pattern/items.
- **Change-log:** `meta_state_log_change` (`change_dimension: convention`, `change_target: tools/learning-loop-mastra/__tests__/stable-artifacts-no-plan-ids.test.js`, reason: "Plan-ID/phase-number lineage swept from stable code artifacts; regression test enforces a total ban.") — makes the convention change loop-citable.
- **Resolve finding:** `meta_state_resolve({ id: "meta-260721T2300Z-agent-runtime-embeds-plan-ids-phase-numbers-and-finding-code", resolution: "Fixed: prevention test (stable-artifacts-no-plan-ids.test.js) enforces a total ban; 69 plan-ID/phase-number instances swept to invariant descriptions; rule hint_text updated." })`. Before resolving, run `meta_state_derive_status` (per the derive-refresh rule). The finding's `evidence_code_ref` is `core/bound-artifacts.js:5`, which Phase 2 rewrote — the file hash drifts; that drift is the expected signal the cited code changed, so do NOT `meta_state_refresh_file_index` to mask it (resolving is the correct terminal step, not re-grounding).

## Related Code Files
- Modify: `tools/learning-loop-mastra/__tests__/stable-artifacts-no-plan-ids.allowlist.json` (empty array + the explicit-empty assertion may live in the test file from Phase 1).
- Mutate via tools: `meta-state.jsonl` (rule patch, change-log append, finding resolve) — all via `loop.mjs` CLI, never direct writes.

## Implementation Steps
1. Confirm allowlist sidecar is `[]`; add `expect(allowlist).toEqual([])` to the test if not already present.
2. Negative check: add a temp `// Phase 9 of plans/999999-xxxx` to a core file; run `pnpm test`; confirm the stable-artifacts test FAILS; revert.
3. `meta_state_derive_status` on the finding → confirm drifted (bound-artifacts.js changed).
4. `meta_state_patch` the rule hint_text (drop "once added").
5. `meta_state_log_change` the convention change-log entry.
6. `meta_state_resolve` the finding.
7. Full `pnpm test` + `pnpm fallow:gate` green.

## Success Criteria
- [ ] Empty allowlist; test fails on any plan-ID comment (negative check passes).
- [ ] Rule hint_text no longer contains "once added"; points at the shipped test as a total ban.
- [ ] Change-log entry recorded; finding `meta-260721T2300Z-...` status `resolved`.
- [ ] `pnpm test` and `pnpm fallow:gate` green.

## Risk Assessment
- **Resolving before the sweep is truly complete** — if any of the 69 was missed, the allowlist still has an entry and the finding should not resolve. Mitigation: the Phase 2 exit criterion (grep returns nothing) gates Phase 3; the empty-allowlist assertion makes a partial sweep visible.
- **Re-grounding the finding's evidence_code_ref by accident** — `meta_state_refresh_file_index` on `bound-artifacts.js` would mask the drift and make the finding look "grounded" against code that no longer matches the original claim. Do not refresh; resolve instead. (Documented above to prevent the reflex.)
- **Rule hint patch shape** — `meta_state_patch` must target `entry_kind: "rule"` and patch only `hint_text`. Validate via `meta_state_list({ id: ["rule-no-plan-ids-in-stable-code-artifacts"] })` after patching.