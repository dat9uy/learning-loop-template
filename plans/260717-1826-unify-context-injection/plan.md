---
title: "Unify runtime context-injection — hint registry, budget renderer, rule-derived process hints"
description: "Resolve meta-260715T2300Z: collapse the 5 overlapping context-injection surfaces into one hint registry + one budget-aware renderer + thin per-runtime adapters, aligned with philosophy state-2 (deterministic injection, agentic consumption) and promotable to state-3 (rule-derived hints)."
status: pending
priority: P1
effort: "3d"
tags: [meta, context-injection, hooks, tdd, state-2]
created: 2026-07-17
---

# Unify runtime context-injection — hint registry, budget renderer, rule-derived process hints

## Overview

**Trigger:** `meta-260715T2300Z-runtime-context-injection-is-fragmented-across-overlapping-s` (open, loop-anti-pattern, warning; evidence `.factory/hooks/loop-surface-inject.cjs:14`).

Runtime context-injection is fragmented: one body of hint content lives in **2 copies** (canonical `core/loop-introspect.js` consts + LOCAL mirror in `.factory/hooks/loop-surface-inject.cjs`) and is delivered through **5 overlapping surfaces** (factory SessionStart hook, 2 universal .claude SessionStart hooks, `loop_describe` MCP pull, `loop_get_instruction` MCP pull), with `.mastracode` receiving **no** hint injection at all. A regex-based parity test (cold-session-discoverability test #7) string-compares the mirror against canonical; the H6 block in `loop-describe-tool.js:121-133` nags when an agent-checklist rule lacks a hand-mirrored PROCESS_HINTS row. One rule can be represented in 5 places; editing one without the others drifts (already caused a CI failure).

**Cascade insight (simplification-cascades):** every injection surface is the same thing — a render of one hint registry parameterized by `(channel, budget, trigger)`. The trust objection that justified the LOCAL mirror ("server hint strings not trusted at render time") is dissolved by evidence already in-repo: the universal .claude hooks `require("../../core/loop-introspect.js")` directly, and the factory hook itself already `await import`s core/meta-state.js in its failure path (`loop-surface-inject.cjs:139`). Direct core import removes the wire, the spawn, and the mirror.

**Philosophy alignment (`docs/philosophy.md` § Skills Are the Same Kind of Escape Hatch):** the unified mechanism is **state-2 by design** — deterministic injection (renderer fires at the right moment per runtime), agentic consumption (model reads prose, decides). State-2 is the permanent home for hint content. The *mechanism* becomes promotable to state-3: rule→hint derivation moves from hand-mirror + nag to deterministic projection at promotion time.

## Operator-confirmed decisions

1. **Kill the MCP probe** in the factory hook (not just the hint misuse). Counts come from direct core imports. Accepted trade-off: the probe's side-role as MCP-connection health check goes away; genuine MCP failure surfaces when the agent calls tools.
2. **Division-of-labor doc lives in `docs/architecture.md`** (new section).
3. **Keep both mechanisms, single-source the content:** agent-checklist rule entries stay the state-3 anchor (citable id, lifecycle, structured checklist); PROCESS_HINTS becomes a **projection** (standalone hints + rule-derived `hint_text`), not a hand-maintained const. `hint_text` is curated once at promotion time (explicit field, not derived from verbose `description`).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | One canonical hint source; delete the LOCAL mirror + parity test #7 + MCP probe | P1 |
| 2 | One budget-aware renderer; .claude + .factory inject via thin adapters (.mastracode stays pull-only — Validation 1) | P1 |
| 3 | Rule-derived process hints: `hint_text` on agent-checklist rules, projection replaces mirror, H6 nag removed | P1 |
| 4 | Debuggable: `hint-render.mjs` CLI prints byte-exact per-channel renders with provenance | P2 |
| 5 | Documented division of labor in `docs/architecture.md`; finding resolved with change-log | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Single-source SessionStart content (kill mirror + probe)](./phase-01-single-source-sessionstart-content.md) | Pending |
| 2 | [Unified hint registry + budget renderer + per-runtime adapters](./phase-02-unified-hint-registry-renderer-adapters.md) | Pending |
| 3 | [Rule-derived process hints (hint_text + projection)](./phase-03-rule-derived-process-hints.md) | Pending |
| 4 | [Debug CLI + architecture docs + finding closure](./phase-04-debug-cli-docs-finding-closure.md) | Pending |

Dependencies: 1 → 2 → 3 → 4 (sequential; each phase is independently shippable and leaves the suite green).

## Current-state map (verified this session)

| Surface | Trigger | Content source | Problem |
|---|---|---|---|
| `core/loop-introspect.js:107-139` | — | canonical `DISCOVERABILITY_HINTS` (16) + `PROCESS_HINTS` (10) | — |
| `.factory/hooks/loop-surface-inject.cjs:14-46` | push (SessionStart) | LOCAL mirror copies; MCP spawn (10s) for counts only | drift-prone duplicate; parity-tested not single-sourced |
| `hooks/universal/session-start-inject-discoverability.cjs` + `session-start-inject-process-hints.cjs` | push (.claude) | direct `require` of canonical core | two hooks exist solely to hand-partition the 10k `additionalContext` cap |
| `loop_describe` warm/cold (`loop-describe-tool.js:118-119,256-257`) | pull (MCP) | canonical builders | hint block identical to push — undocumented redundancy |
| `loop_get_instruction` (`loop-get-instruction-tool.js:5-65`) | pull (MCP) | canonical builders + hand-aligned `HINT_KEY_MAP`/`HINT_SUGGESTIONS` parallel arrays | index-coupled maps; rows 3-7 of `HINT_SUGGESTIONS_PROCESS` are placeholder rot |
| `.mastracode/hooks.json` SessionStart | push | recurrence-check only | no hint injection at all |

Rule↔hint mirror (8 of 10 PROCESS_HINTS rows): rows 2,3,4,5,6,7,8,10 ↔ `rule-pr-body-registry-deltas`, `rule-runtime-agnostic-features`, `rule-tool-integration-same-commit-dep`, `rule-fallow-brief-on-gate-failure`, `rule-short-slug-for-risk-records`, `rule-import-chain-analysis-after-tool-deletion`, `rule-assertinvariant-at-boundary`, `rule-required-status-checks-verify-combined-status`. Standalone rows: 1 (test discipline), 9 (file-index drift).

## Success Criteria

- [ ] `LOCAL_DISCOVERABILITY_HINTS`/`LOCAL_PROCESS_HINTS` and `spawnAndCall`/`reportMcpConnectionFailure` deleted; factory hook renders canonical builders via direct core import
- [ ] Parity test #7 (regex string-compare) replaced by render tests; `pnpm test:iter` green
- [ ] `core/hint-registry.js` is the single hint source (slug-keyed entries with `suggestion`); `HINT_KEY_MAP*` parallel arrays derived, not hand-aligned
- [ ] `core/hint-renderer.js` partitions by char budget; .claude and .factory render byte-identical hint text from the same registry (.mastracode stays pull-only per Validation 1)
- [ ] Active agent-checklist rules carry `hint_text`; `buildProcessHints()` = standalone + rule-derived projection; H6 nag block deleted from `loop-describe-tool.js`
- [ ] `node tools/scripts/hint-render.mjs --channel <name>` prints byte-exact render + provenance for any channel
- [ ] `docs/architecture.md` documents push/pull-single/pull-warm/static division of labor
- [ ] `meta-260715T2300Z` resolved with a change-log entry; PR body enumerates registry deltas per `rule-pr-body-registry-deltas`

## Risk Assessment

- **ESM/CJS boundary:** hooks are CJS, core is ESM. Mitigation: proven pattern — universal hooks `require` core (Node ≥22 require(esm)), factory hook already uses `await import`. Tests run both paths.
- **Injection-content regressions are silent** (agent just behaves worse). Mitigation: TDD — render tests assert byte-content against canonical builders per channel before implementation; Phase 4 CLI gives operators a pre-session inspection surface.
- **Phase 3 mutates `meta-state.jsonl`** (backfill `hint_text` on 8 rules). Mitigation: mutations via `meta_state_patch`/promote tool only (never direct file write); PR body enumerates deltas per `rule-pr-body-registry-deltas`.
- **Hook ordering/budget:** merging the two .claude hooks into renderer-driven partitions must keep both system-reminders under the 10k cap. Mitigation: renderer test asserts per-partition byte size ≤ budget.
- **Runtime-agnostic rule:** Phase 2 touches hooks → audit with `check_runtime_agnostic` MCP tool before shipping (core-in-universal-location, shims-in-sync, protocol-adapter-i/o, cross-surface-iteration via `core/surfaces.js`).

<!-- slug: unify-context-injection -->

## Validation Log

### Verification Results (2026-07-17, Standard tier — Fact Checker + Contract Verifier)
- Claims checked: 7
- Verified: 6 | Failed: 0 | Unverified: 1 (resolved via Validation 1)
- Verified: rule schema branch `metaStateRuleEntrySchema` (`core/meta-state.js:445+`, `.shape` available); `tools/scripts/` convention; 3 existing session-start hook test files; `docs/architecture.md` 488/800 lines; test #7 parity block location; no external consumers of the MCP failure banner.
- Nuance: the parity describe block in `cold-session-discoverability.test.cjs` also asserts `HINT_SUGGESTIONS` alignment counts — those assertions re-anchor to the registry test in Phase 2 (propagated to phase-02).

### Decisions (interview, 2026-07-17)
1. **Skip .mastracode adapter.** .mastracode support for SessionStart `additionalContext` is unverified; operator chose to keep .mastracode pull-only (`loop_describe`) rather than build the adapter or degrade to sidecar+stderr. Propagated: plan goals/criteria, phase-02 scope + success criteria + risks, phase-04 docs section.
2. **Missing/inactive derived rule → skip + warn.** Renderer provenance records the skip; injection continues. (Confirmed existing phase-03 design.)
3. **Both standalone rows stay standalone.** Test-discipline + file-index drift rows remain inline registry entries with `derived_from_rule: null`; gate rules do not carry `hint_text`. (Confirmed existing phase-03 design.)
4. **Numeric indexes preserved.** `loop_get_instruction` keeps positional-index back-compat; slugs documented as canonical. (Confirmed existing phase-02 design.)

### Whole-Plan Consistency Sweep (2026-07-17)
- Swept all 5 files for stale terms post-propagation (`mastracode`, old effort figures, "all runtimes", "First time", `hooks.json`).
- Result: **zero unresolved contradictions.** Remaining `.mastracode` mentions are current-state problem description (plan.md:17,59) or explicit exclusion notes (plan goals/criteria, phase-02 scope/steps/risks, phase-04 docs bullet). Effort totals consistent (3d = 0.5+1+1+0.5). Phase-04 CLI channel list contains no mastracode channel. Phase-01 `.factory/hooks.json` reference is factory wiring, unrelated.
- Phase-03 required no edits: decisions 2-3 confirmed its existing design (skip+warn; standalone rows stay standalone).
