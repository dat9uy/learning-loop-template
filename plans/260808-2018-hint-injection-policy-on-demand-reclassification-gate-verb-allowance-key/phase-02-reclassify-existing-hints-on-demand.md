---
phase: 2
title: "Reclassify existing hints on-demand"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Reclassify existing hints on-demand

## Overview

With the `tier` mechanism shipped inert in Phase 1, flip the 12 non-essential discoverability hints + both process standalone hints to `tier: "on-demand"`. Keep the 4 startup-essential hints (`loop-get-instruction`, `canonical-tool`, `surface-split`, `phase-a-reframe`) at `tier: "startup"`. This is a one-field-per-row change with no text, slug, or order edits — pure policy. The warm payload and per-turn `session-context.json` shrink to the 4 startup hints + the `hint_index`; the 12+2 full texts become fetchable via `loop_get_instruction`.

## Requirements

- Functional: set `tier: "on-demand"` on these 12 discoverability rows: `internalization-rule`, `mechanism-check`, `source-refs`, `derive-refresh`, `designs-no-code`, `status-lifecycle`, `reopens`, `rule-lifecycle`, `reopens-script`, `narrow-query`, `session-id-query`, `runtime-agnostic-features`. (16 discoverability − 4 kept = 12 moved.)
- Functional: set `tier: "on-demand"` on both process standalone rows: `pnpm-test-discipline`, `file-edit-drift-and-fingerprints`.
- Functional: keep `tier: "startup"` on exactly 4 discoverability rows: `loop-get-instruction`, `canonical-tool`, `surface-split`, `phase-a-reframe`. (Default-omitted = startup, but set explicitly for the keep-4 to survive any future default flip.)
- Functional: warm `discoverability_hints` contains exactly the 4 startup slugs' full text; `process_hints` is empty (both standalone rows on-demand; rule-derived rows are unaffected — they inject only when their rule is active, orthogonal to this phase). `hint_index` lists all 19 slugs.
- Non-functional: no slug renamed/removed/reordered; no `text`/`suggestion` edits in this phase (text dedup is Phase 3). Numeric indices 0–16 unchanged.
- Non-functional: `loop_get_instruction` still resolves every slug (startup + on-demand) — no change to the resolver.

## Architecture

Pure policy flip — the mechanism from Phase 1 does all the work. The startup set is chosen by the criterion: *"needed to prevent a wrong first action AND not adequately covered by AGENTS.md (already in context)"*:

| keep startup | reason |
|---|---|
| `loop-get-instruction` | the on-ramp + index to all on-demand hints — must stay so the agent knows what it can fetch |
| `canonical-tool` | prevents first-action `node -e`/direct-file-IO mistakes before any tool is chosen |
| `surface-split` | the do-not-duplicate rule itself — self-mandates this whole effort; keep canonical |
| `phase-a-reframe` | the 4-kind bound/unbound mental model; trimmed in Phase 3 (worst triplication) but kept as a startup orientation pointer |

The 12 moved on-demand are reference recipes the agent fetches when performing that specific operation (status manipulation, re-grounding, cross-refs, query hygiene, test-running, file-index drift, etc.). They remain fully discoverable via `hint_index`.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/hint-registry.js` (only the `tier` field on the named rows — no other edits)
- No change: `loop-introspect.js`, `hint-renderer.js`, session-start hooks (the Phase 1 filter already honors `tier`)
- No change: `loop-get-instruction-tool.js`

## Implementation Steps (TDD — tests first)

1. **Write failing tests** in `__tests__/hint-registry.test.cjs`:
   - `listHints({kind:"discoverability", tier:"startup"})` returns exactly 4 slugs in order: `loop-get-instruction`, `canonical-tool`, `surface-split`, `phase-a-reframe`.
   - `listHints({kind:"discoverability", tier:"on-demand"})` returns 13 slugs (12 moved + `gate-verb-allowance` from Phase 1). `listHints({kind:"discoverability", tier:"startup"})` returns 4. `listHints({kind:"discoverability"})` (unfiltered) returns 17.
   - `listHints({kind:"process", tier:"startup"})` returns 0 standalone rows; both standalone process rows are on-demand.
   - `buildHintIndex()` returns all 19 entries (17 discoverability + 2 process standalone) regardless of tier.
2. **Write failing tests** in `__tests__/legacy-mcp/loop-describe-warm-tier.test.js` + `__tests__/rule-derived-process-hints.test.cjs`:
   - warm `discoverability_hints.length === 4`; the 4 texts are the startup set's.
   - warm `process_hints` (with empty rulesById) is empty (both standalone rows on-demand).
   - `hint_index.length === 19`.
3. **Write a regression test** asserting `loop_get_instruction` still resolves each of the 12 moved slugs by name and by their unchanged numeric index (0–15) — proving on-demand does not break lookup.
4. Run → red. Implement: add `tier: "on-demand"` to the 12 discoverability rows + 2 process rows; add `tier: "startup"` explicitly to the 4 keepers. No other edits.
5. Update count assertions across the test files flagged by the scout (broaden grep to `=== 16|18|12|17|19`): `hint-registry.test.cjs` (discoverability startup=4, on-demand=13, all=17; process standalone startup=0, on-demand=2), `hint-renderer.test.cjs` (warm `discoverability_hints.length === 4`; degraded provenance keeps all-rows counts at the full registry size — renderer is unfiltered), `hint-render-cli.test.cjs` (comment + counts), `rule-derived-process-hints.test.cjs` (warm `discoverability_hints.length === 4`; standalone process rows on-demand).
6. **Structural test rewrites (NOT count bumps — red-team #5, #6, #7):**
   - `loop-describe-warm-tier.test.js:32-98` — the 16-element positional destructure CRASHES after Phase 2 (only 4 warm hints remain → `undefined.includes(...)` TypeError). Rewrite: destructure only the 4 startup hints and assert their substrings; test the 13 on-demand hints via `loop_get_instruction({key})`, not warm `discoverability_hints`.
   - `hint-registry.test.cjs:154-157` — the inclusion loop `for (e of HINT_REGISTRY.filter(kind==="discoverability")) assert.ok(disc.includes(e.text))` fails for the 13 on-demand rows (`disc` has 4). Restructure: iterate only `tier==="startup"` entries for `disc.includes`; assert on-demand entries resolve via `findHintBySlug` + `resolveHintText`.
   - `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:49-50` — asserts `warm.discoverability_hints.find(h => h.includes("evidence_code_ref"))`; only `internalization-rule` carries it and is now on-demand. Update to assert via `loop_get_instruction({key:"internalization-rule"})` instead of warm.
7. Run `pnpm test:one` on the affected suites → green. Then `pnpm exec vitest --changed`.
8. `check_runtime_agnostic` — no change (registry only; the field is data, the filter is shared).

## Success Criteria

- [ ] Warm `discoverability_hints` = exactly 4 startup slugs; `process_hints` standalone = 0.
- [ ] `hint_index` = all 19 slugs (4 startup + 13 on-demand discoverability + 2 on-demand process standalone).
- [ ] `loop_get_instruction` resolves all 19 slugs; discoverability numeric indices 0–16 unchanged (process offset 16→17, documented).
- [ ] No slug/order/text/suggestion edits — only `tier` fields changed.
- [ ] The 3 structural test rewrites (destructure, inclusion loop, `evidence_code_ref` test) done.
- [ ] `pnpm test:one` green for the affected suites; `vitest --changed` green.

## Risk Assessment

- **Risk: `internalization-rule` on-demand causes citation regression (red-team #16, keep-4 tradeoff).** `internalization-rule` is the `evidence_code_ref` pattern used by every `meta_state_report`; moving it on-demand risks sessions forgetting to cite evidence. *Signal:* post-merge `meta_state_report` calls omit `evidence_code_ref`. *Response:* keep-4 decision stands (per user); `internalization-rule` rides on `hint_index` + the `loop-get-instruction` startup pointer. This is an accepted, documented tradeoff — if citation regression appears post-merge, promote `internalization-rule` back to `tier:"startup"` (one field flip; that becomes keep-5). The regression is detectable: audit `meta_state_report` rows missing `evidence_code_ref`.
- **Risk: a moved-on-demand hint was load-bearing for first actions.** *Signal:* a downstream session makes a wrong first meta-state action. *Response:* the hint is one `loop_get_instruction` call away and listed in `hint_index`; if a specific hint regresses repeatedly, flip it back to `tier:"startup"`. The 4 keepers cover the highest-leverage first-action guidance.
- **Risk: rule-derived process hints interact with the standalone `tier` filter.** *Signal:* `buildProcessView` produces rows whose `tier` is unset (rule-derived entries have no `tier`). *Response:* rule-derived entries are unaffected — they inject when their rule is active regardless of `tier`; only the 2 standalone rows carry `tier`. Test that rule-derived rows still appear in `process_hints` when their rule is active.
- **Risk: Phase 2 is NOT "no logic changes."** (red-team #6, #7) *Signal:* the operator attempts count bumps on `loop-describe-warm-tier.test.js:32-98` / `hint-registry.test.cjs:154-157` and gets TypeErrors / inclusion failures. *Response:* step 6 calls these out as structural rewrites; do not attempt count bumps there.