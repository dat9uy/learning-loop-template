# Phase 1 report: injection-policy mechanism + gate-verb-allowance key

Plan: plans/260808-2018-hint-injection-policy-on-demand-reclassification-gate-verb-allowance-key
Branch: plan/hint-injection-policy-on-demand (not committed — controller handles commits)

## What changed

Source:
- `core/hint-registry.js` — `tier` injection-policy field added to schema doc (default `"startup"` when omitted); `listHints({kind, tier})` with `tier` defaulting to `undefined` (no filter, never `"startup"`); shared `pointerFields` projection; exported `projectToPointers` (moved from loop-introspect); new `buildHintIndex({rulesById})` returning `[{slug, suggestion}]` for all registry rows + merged rule-derived process slugs (first-wins dedupe); new `gate-verb-allowance` discoverability entry at index 16 with `tier: "on-demand"` carrying the full incantation: `gate_mark_preflight({surface:"runtime-state"})`, `runtime_state_record` with `<verb>` placeholders, `id MUST equal affected_system`, sentinel `source_ref:"local:meta-state:gate-verb-allowance"` (noted non-resolving), 30-min expiry, and "the promoted-rule denylist still applies during the allowance window".
- `core/loop-introspect.js` — `buildDiscoverabilityHints({tier})` / `buildDiscoverabilityPointers({tier})` / `buildProcessHints({rulesById, tier})` / `buildProcessPointers({rulesById, tier})`; re-exports `projectToPointers` + `buildHintIndex`. Local `projectToPointers` deleted (single projection now lives in the registry).
- `tools/handlers/loop-describe-tool.js` — `buildHintBlocks(promotedRules, {tier})`: warm passes `{tier:"startup"}` and adds `hint_index`; cold passes no tier (unfiltered, no `hint_index`).
- `hooks/universal/session-start-inject-discoverability.cjs` — sidecar payload gains `hint_index` (+ `_source`/`_error` flags; fatal path carries the same keys per the BOTH-write-sites invariant); startup-tier pointers only; `rulesById` loaded so the index merges rule-derived slugs.
- `hooks/universal/session-start-inject-process-hints.cjs` — startup-tier pointers.
- `.factory/hooks/loop-surface-inject.cjs` — startup-tier hints + emits a `--- hint_index ---` block (slug — suggestion lines + loop_get_instruction pointer) via `formatBlock`.
- Not touched (per spec): `core/hint-renderer.js` (unfiltered), `tools/handlers/loop-get-instruction-tool.js`, AGENTS.md, CLAUDE.md.

Tests (TDD: red confirmed before implementation):
- `__tests__/hint-registry.test.cjs` — slug set now 17 (gate-verb-allowance appended); counts 16→17 / 18→19; new "injection-policy tier" describe: index-16 placement, inert default, startup/on-demand filter counts, no-filter-default pin, numeric indices 0–15 unchanged, findHintBySlug/resolveHintText, incantation substring pin, shared-substring pin against `evaluate-bash-gate.js` block message, buildHintIndex coverage/shape/degraded.
- `__tests__/legacy-mcp/loop-get-instruction.test.js` — slug + numeric-16 resolution of gate-verb-allowance incl. denylist sentence; stale `k - 16` comment now uses `discoverabilityLen`.
- `__tests__/legacy-mcp/loop-describe-warm-tier.test.js` — warm excludes on-demand text / hint_index includes it; cold stays unfiltered; cold carries no hint_index; renderer stays unfiltered (17); buildDiscoverabilityHints 17 unfiltered / 16 startup.
- `__tests__/hint-renderer.test.cjs` — provenance 18→19, sidecar channel 16→17.
- `__tests__/rule-derived-process-hints.test.cjs` — degraded sidecar count 16→17.
- `__tests__/legacy-mcp/cold-session-discoverability.test.cjs` — 6KB byte budget now measured against the startup-tier view (the actual session-start payload; on-demand rows are not injected and must not count against it).
- `__tests__/factory-hook-single-source.test.cjs` — canonical comparison set is the startup-tier view.
- `.factory/hooks/__tests__/loop-surface-inject.test.cjs` + `loop-surface-inject-format-block.test.cjs` — hint_index block emitted, on-demand row listed, on-demand full text not auto-injected, summary tier suppresses the index.

## Test results

- `pnpm test:one` green: hint-registry (20), loop-get-instruction (12), loop-describe-warm-tier (13), hint-renderer (12), session-start-inject-discoverability (11), session-start-inject-process-hints (2), session-start-inject-degraded-sources (8), factory loop-surface-inject (9) + format-block (4), factory-hook-single-source (5), rule-derived-process-hints (13), cold-session-discoverability (6), claude-code-mcp-loading (4), mcp-protocol-e2e (5), loop-describe (23), cold-tier-regression (1).
- `pnpm exec vitest --changed`: 362 tests / 94 suites, 0 failures.
- `check_runtime_agnostic`: 6/6 on all three changed core/handler files. The two universal hooks score 3/6 and 4/6 — verified identical failures at HEAD (pre-existing baseline, not a regression from this phase). The audit has the known `.factory/hooks/` blind spot; the `.factory` tests above are the proof for that runtime.

## Deviations

1. **Cold-tier count is 17, not the "stays at 16" the phase text states.** The plan's load-bearing invariants (append-only append at index 16; `listHints` no-filter returns all 17; cold passes no tier) make unfiltered cold = 17; the "16" in the phase/plan prose is a stale count inconsistent with those invariants. Implemented cold = unfiltered = 17, matching the renderer 18→19 bump logic.
2. Two extra test files needed count updates beyond the phase's named list (`rule-derived-process-hints.test.cjs`, `cold-session-discoverability.test.cjs`) — both are test files under the allowed globs; the byte-budget change measures the startup-tier view, preserving the budget's intent.
3. `runtime-state.jsonl` carries new rows from running the canonical gate-verb:node allowance 2-call flow (needed to run the MCP-only `check_runtime_agnostic` handler via `node -e`). Left uncommitted for the controller.

## Notes for later phases

- Warm `hint_index` with live rules = 17 discoverability + 13 process-view slugs (30 total); without rules it degrades to the 19 registry rows.
- Phase 2 tier flips will shrink warm `discoverability_hints` 16→4 and warm `process_hints` to empty; the structural rewrite of the 16-element destructure in loop-describe-warm-tier.test.js is still ahead (untouched here).
