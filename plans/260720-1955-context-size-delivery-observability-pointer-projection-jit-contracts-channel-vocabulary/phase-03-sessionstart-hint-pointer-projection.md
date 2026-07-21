---
phase: 3
title: "SessionStart hint pointer projection"
status: complete
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 3: SessionStart hint pointer projection

## Overview

Replace the two SessionStart hooks' long-paragraph hint emission (~11.8k chars combined) with a compact pointer projection: a header line naming the pull path + 26 `slug — suggestion` one-liners (~1.6–2k chars). Full text stays pull (sidecar + `loop_get_instruction`), unchanged. This is the steering-doctrine half of the size fix: pull, not broadcast.

## Context Links

- Research (file:line inventory): `plans/reports/research-260720-1921-hint-injection-pointer-surface.md`
- Brainstorm §4.2 (pointer projection), Fork B (B1 chosen, B2 renderer-channel rejected)
- Registry: `tools/learning-loop-mastra/core/hint-registry.js` (26 entries, all carry `slug` + `suggestion`)

## Key Insights (from research)

- Registry needs **zero schema change** — every entry already has `slug` + substantive `suggestion` (test-enforced `length > 20`).
- New builders are pure projections over `listHints` + `resolveHintText`, placed in `core/loop-introspect.js` after line 169. Process pointers mirror `buildProcessHints` skip semantics: rule-derived rows whose rule is missing/inactive/scope-filtered are DROPPED (pointers never advertise an inactive rule).
- Both `.claude` hooks are canonical-only (no shims); `.claude/settings.json` invokes them by path. Sidecar writer = discoverability hook only (lines 177-182, 238-252, 305-319) — untouched.
- `loop_get_instruction` resolves slugs against fixed registry order (`findHintBySlug`, loop-get-instruction-tool.js:51) — pointer slugs resolve unchanged, no tool change.
- Exactly **2 tests** assert emitted hint text and must be rewritten: `session-start-inject-discoverability.test.cjs:189`, `session-start-inject-process-hints.test.cjs:12`. All other ~70 hint-adjacent tests are structural or target unchanged surfaces (warm/cold tiers, renderer, sidecar).
- `loop_describe` warm/cold tiers keep FULL text via `buildHintBlocks` (loop-describe-tool.js:29-36) — out of scope (pull surface by design).

## Requirements

- Functional:
  - > **🔴 Red Team (H12 — DRY):** do NOT add two parallel builders that mirror `buildDiscoverabilityHints`/`buildProcessHints` iteration + `resolveHintText` + drop-on-null skip (lock-step duplication). Add ONE pure formatter `projectToPointers(hints)` that consumes the existing `buildDiscoverabilityHints()` / `buildProcessHints()` output and pairs each surviving entry with its `slug` (already on every registry entry). The pointer builders are then `buildDiscoverabilityPointers = () => projectToPointers(buildDiscoverabilityHints())` and `buildProcessPointers = ({rulesById}={}) => projectToPointers(buildProcessHints({rulesById}))` — skip semantics stay in ONE place (the existing builders).
  - New `buildDiscoverabilityPointers()` + `buildProcessPointers({ rulesById } = {})` in `core/loop-introspect.js`: output = header line (names pull path: full text in `.claude/session-context.json`, single hint via `loop_get_instruction({key})`) + one `${slug} — ${suggestion}` line per surviving entry (16 discoverability + up to 10 process).
  - Discoverability hook flip: `session-start-inject-discoverability.cjs:279` — `emitAdditionalContext(buildDiscoverabilityPointers(), …)`; sidecar path (line 274) and degraded/fatal marker paths unchanged.
  - Process hook flip: `session-start-inject-process-hints.cjs:32-33` — use `buildProcessPointers()` (inherits lazy rule read via cwd, same as `buildProcessHints`); degraded marker (34-37) unchanged.
  - ~~Factory hook flip — DEFERRED (Validation V4).~~ See Decision D3.1.
- Non-functional: combined `.claude` hook stdout ≤ 6,000 chars (budget); no change to sidecar payload shape or `*_source` flags; no new hooks/shims (shims-in-sync untouched).

## Decision D3.1 — factory hook DEFERRED (Validation V4)

✅ **VALIDATION V4 RESOLVED — defer.** Phase 3 ships the two `.claude` hooks ONLY. The `.factory/hooks/loop-surface-inject.cjs` pointer flip is a separate cross-surface alignment plan (the size budget is `.claude`-only; the doctrine-consistency argument doesn't earn its test-rewrite cost here). Phase 5 must record this deferral: mark the factory-hook channel as "pointer projection deferred (D3.1 — separate plan)" in the `docs/architecture.md` channel table and add a deferral entry to the Phase 5 report. `<!-- Updated: Validation Session 1 - D3.1 factory hook deferred -->`

Historical red-team note (H9, retained for the follow-on plan): `factory-hook-single-source.test.cjs:118,127` are full-text content assertions (`assert.ok(block.includes(h))` against canonical hint text of `h.length` chars), NOT "alignment checks" — the follow-on plan must rewrite them to pointer-form slug coverage, not full-text containment.

## Related Code Files

| File | Action | Rough size | Test impact |
|---|---|---|---|
| `tools/learning-loop-mastra/core/loop-introspect.js` | Modify: add `projectToPointers(hints)` formatter + 2 thin wrappers (`buildDiscoverabilityPointers`/`buildProcessPointers`) after line 169 (🔴 H12: DRY — do not duplicate iteration/skip) | +~25 lines | new unit tests |
| `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs` | Modify: line 279 emit call only | 1-line logic change | rewrite test :189 |
| `tools/learning-loop-mastra/hooks/universal/session-start-inject-process-hints.cjs` | Modify: lines 32-33 | 2-line change | rewrite test :12 |
| ~~`.factory/hooks/loop-surface-inject.cjs`~~ | ~~Modify~~ — **DEFERRED (Validation V4)** to a separate cross-surface plan | — | — |
| `tools/learning-loop-mastra/__tests__/hint-pointer-builders.test.cjs` (new) | Create | — | — |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/session-start-inject-discoverability.test.cjs` | Modify: :189 test → pointer-format assertions (slug presence, header kept, ≤10k, numbering 1..16) | — | — |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/session-start-inject-process-hints.test.cjs` | Modify: :12 test → pointer assertions (1..10) | — | — |

**Function/interface checklist:** `buildDiscoverabilityHints`/`buildProcessHints` (unchanged — warm/cold tiers + tests consume); `listHints({kind})`, `resolveHintText(entry, rulesById)` (reused); `emitAdditionalContext` (unchanged signature); `buildContextPayload`/`writeContext` (untouched); `loadCoreHints` (untouched — sidecar keeps full text).

## Dependency Map

- Independent of Phase 2 (disjoint files). Phase 1 baseline required for before/after char counts. Feeds Phase 6 budgets (≤6,000 chars) and Phase 5 docs (pointer line vocabulary).

## Implementation Steps (TDD)

### Step A — Tests Before
1. New `hint-pointer-builders.test.cjs` (RED): format `${slug} — ${suggestion}`; counts (16 discoverability; process ≤10); drop-on-null skip semantics for process pointers (inactive rule → row absent); header names pull paths.
2. Rewrite the two hook tests to pointer expectations (RED against current full-text output).

### Step B — Refactor
3. Add the `projectToPointers` formatter + 2 thin wrappers in `core/loop-introspect.js` (mirror existing builder patterns; JSDoc noting pointer contract + skip semantics).
4. Flip discoverability hook line 279; flip process hook lines 32-33.
~~5. Flip factory hook builder calls (D3.1).~~ — **DEFERRED (Validation V4).**

### Step C — Tests After
5. A-tests GREEN; run adjacent suites: `hint-registry.test.cjs`, `rule-derived-process-hints.test.cjs`, `hint-renderer.test.cjs`, `session-start-inject-degraded-sources.test.cjs`, `loop-describe-warm-tier.test.js`, `loop-get-instruction.test.js`, `cold-session-discoverability.test.cjs`. (Factory-hook suites are out of scope — V4 deferred.)
6. Re-run `measure-context-surfaces.mjs`; record hook stdout char counts; diff sidecar shape vs Phase 1 snapshot (must be identical incl. `*_source`).

### Step D — Regression gate
- `pnpm test:iter` green; combined hook stdout ≤ 6,000 chars measured; sidecar diff empty.

## Test Scenario Matrix

| Scenario | Criticality | Covered by |
|---|---|---|
| Pointer output = header + 26 `slug — suggestion` lines | critical | A1 |
| Process pointer drops row when rule inactive/missing/no hint_text | critical | A1 |
| Hook stdout ≤6,000 chars combined | critical | measurement script |
| Sidecar payload + `*_source` flags byte-identical semantics | critical | existing sidecar tests + Phase-1 diff |
| Degraded/fatal marker paths unchanged | high | existing degraded tests |
| `loop_get_instruction` resolves every emitted slug | high | A1 (cross-check against `findHintBySlug`) |
| Warm/cold tiers still full text | medium | existing warm-tier test |
| ~~Factory hook emits pointers (if D3.1 confirmed)~~ | ~~high~~ — **DEFERRED (Validation V4)** | — |

## Success Criteria

- [x] Both `.claude` hooks emit pointer projection; combined stdout ≤ 6,000 chars (measured: 5,120 chars combined)
- [x] Sidecar full-text payload unchanged (shape + flags diff vs Phase 1 snapshot = empty)
- [x] Only the inventoried text-asserting tests changed; everything else green untouched
- [x] `check_runtime_agnostic` clean (no new hooks/shims; universal edits only)

## Risk Assessment

- **Less guidance in-channel** → that IS the design (pull); full text one `loop_get_instruction` away; header line names the pull paths.
- **Skip-semantics divergence** (pointers advertise an inactive rule) → mirror `buildProcessHints` drop-on-null exactly; A1 tests pin it.
- **Two-hook re-merge temptation** (10k cap rationale now moot at ~2k) → YAGNI; brainstorm explicitly retains the split. Not in scope.
