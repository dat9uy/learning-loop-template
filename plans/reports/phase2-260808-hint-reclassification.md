# Phase 2 report: reclassify existing hints on-demand

Plan: plans/260808-2018-hint-injection-policy-on-demand-reclassification-gate-verb-allowance-key
Branch: plan/hint-injection-policy-on-demand (not committed — controller handles commits)

## What changed

Source (policy flip only — no slug/text/suggestion/order edits):
- `core/hint-registry.js` — `tier: "on-demand"` added to the 12 named discoverability rows (internalization-rule, mechanism-check, source-refs, derive-refresh, designs-no-code, status-lifecycle, reopens, rule-lifecycle, reopens-script, narrow-query, session-id-query, runtime-agnostic-features) and both standalone process rows (pnpm-test-discipline, file-edit-drift-and-fingerprints); `tier: "startup"` set explicitly on the 4 keepers (canonical-tool, surface-split, loop-get-instruction, phase-a-reframe). 18 tier-field insertions, nothing else.

Tests (TDD: red confirmed pre-flip — `canonical-tool must carry explicit tier:"startup"` was the first failing assertion):

- `__tests__/hint-registry.test.cjs` — tier describe rewritten: keep-4 explicit-startup + 12 on-demand per-row pin; `listHints` startup = the 4 keepers in registry order / on-demand = 13 slugs / unfiltered = 17; process startup = [] / on-demand = the 2 standalone slugs; buildHintIndex degraded length pinned at 19. Inclusion loop restructured (structural rewrite): unfiltered `disc.includes` loop kept (17), plus a startup-tier view block — startup entries included, on-demand entries excluded but still resolving full text via findHintBySlug + resolveHintText.
- `__tests__/legacy-mcp/loop-describe-warm-tier.test.js` — 16-element destructure rewritten (structural): warm `discoverability_hints` destructures exactly the 4 startup hints (registry order: canonical-tool, surface-split, loop-get-instruction, phase-a-reframe) with their substring pins; the 12 on-demand hints' documented substrings now asserted via `loop_get_instruction({key})`. Warm count 16→4; warm `process_hints` now asserted empty; pnpm-test-discipline substrings moved behind loop_get_instruction; buildDiscoverabilityHints startup 16→4; hint_index coverage extended to all 19 registry slugs.
- `__tests__/legacy-mcp/loop-get-instruction.test.js` — new regression test: the 12 moved slugs each resolve by slug AND by their unchanged numeric indices (0–7, 10, 12, 14, 15), numeric === slug result.
- `__tests__/rule-derived-process-hints.test.cjs` — new: warm `buildProcessHints({rulesById: new Map(), tier:"startup"})` is empty (unfiltered same call = 2); regression test per the Risk section — every active agent-checklist rule's `hint_text` still appears in the startup-tier process view (rule-derived rows carry no tier → unaffected), while the on-demand standalone row stays out.
- `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` — structural rewrite: `evidence_code_ref` citation hint now asserted via `mastra_loop_get_instruction({key:"internalization-rule"})` instead of warm discoverability_hints.
- `__tests__/legacy-mcp/session-start-inject-discoverability.test.cjs` — inline additionalContext now asserted against the canonical `buildDiscoverabilityPointers({tier:"startup"})` (4 pointers, numbered 1..4, on-demand slugs absent) instead of hardcoded 1..16 + on-demand slugs.
- `__tests__/legacy-mcp/session-start-inject-process-hints.test.cjs` — same treatment against `buildProcessPointers({tier:"startup"})` (rule-derived pointers present; pnpm-test-discipline / file-edit-drift-and-fingerprints absent; dynamic 1..N numbering).
- `__tests__/legacy-mcp/cold-session-discoverability.test.cjs` — startup-view well-formedness count `>= 10` → `=== 4`; content anchors moved to the unfiltered corpus (the anchors live in on-demand rows; they remain part of the fetchable hint corpus, not the injected payload); 6KB byte budget still measured on the startup-tier view.
- `__tests__/hint-render-cli.test.cjs` — stale provenance-count comment corrected (renderer unfiltered: 17 discoverability + 13 process-view = 30 with the live registry; `>= 26` floor retained).

Not touched (per spec): loop-introspect.js, loop-describe-tool.js, hooks, hint-renderer.js, loop-get-instruction-tool.js, AGENTS.md, CLAUDE.md, docs, records/**.

## Test results

- `pnpm test:one` green: hint-registry (21), loop-describe-warm-tier (13), loop-get-instruction (13), rule-derived-process-hints (15), session-start-inject-discoverability (11), session-start-inject-process-hints (2), session-start-inject-degraded-sources (8), claude-code-mcp-loading (4), cold-session-discoverability (6), hint-renderer (12), hint-render-cli (13), factory loop-surface-inject (9) + format-block (4), factory-hook-single-source (5).
- `pnpm exec vitest --changed`: 396 tests / 51 suites, 0 failures.
- `check_runtime_agnostic`: 6/6 on `core/hint-registry.js` (the only changed core file; data-only tier field). Run via the canonical gate-verb:node allowance 2-call flow.

## Deviations

1. **Warm `process_hints` is empty, and was already standalone-only at HEAD.** The warm payload's rules map comes from `listPromotedRules`, whose projection drops `hint_text`, so rule-derived rows never rendered in the warm `loop_describe` payload even before this phase (they inject via the session-start hooks, which load full rule objects). The pre-existing "process_hints ≥ 1" test passed only because of the 2 standalone rows. After the flip it is asserted `=== 0`, matching the phase success criterion ("process_hints standalone = 0"). The rule-derived-still-inject regression coverage lives in rule-derived-process-hints.test.cjs against the real builder path.
2. **Two hook test files + cold-session test needed updates beyond the phase's named three structural rewrites** (session-start-inject-discoverability, session-start-inject-process-hints, cold-session-discoverability) — all are test files; the updates assert against the canonical builders instead of hardcoded counts/slugs, so future tier flips don't require test edits.
3. **`cold-tier-regression` failed once under `vitest --changed`** with a drift-stale signal on finding `meta-260808T1614Z` (evidence_code_ref = hint-registry.js, mechanism_check) — expected: this phase edits the cited file. Resolved by the canonical re-seed (`node .../seed-file-index.mjs`); file-index.jsonl is an untracked regen artifact. Suite then green.
4. `runtime-state.jsonl` carries new rows from the gate-verb:node allowance 2-call flow (needed for the MCP-only `check_runtime_agnostic`). Left uncommitted for the controller, same as Phase 1.

## Notes for later phases

- Post-flip warm payload: `discoverability_hints` = 4 startup full texts; `process_hints` = []; `hint_index` = 19 registry slugs + merged rule-derived process slugs (30 total with live rules).
- The documented tradeoff stands: `internalization-rule` is on-demand; if a post-merge citation regression appears (meta_state_report rows missing evidence_code_ref), flip it back to `tier:"startup"` (one field).
- Phase 3 can now trim hint text + CLAUDE.md/AGENTS.md against the dedup audit without touching tier logic.
