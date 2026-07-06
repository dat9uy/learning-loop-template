---
phase: 3
title: "bound-artifacts constant"
status: pending
effort: "low"
priority: P2
dependencies: []
---

# Phase 3: Extract `core/bound-artifacts.js` shared constant

## Overview

Extract the inlined bound-artifact glob set from `evaluate-write-gate.js` WRITE_GATE_RULES into a shared-core constant `core/bound-artifacts.js`, imported by the write-gate. Behavior-preserving refactor: the same globs match the same paths. The constant is the single source of truth for the simple-glob rules the write-gate matches (records, runtime-state, meta-state, file-index, schemas, build-artifacts). No new gating in this phase.

## Requirements

- Functional: `core/bound-artifacts.js` exports the bound-artifact glob set + the per-rule metadata (name, matchedRule label, reason) the write-gate needs; `evaluate-write-gate.js` imports it instead of inlining literals.
- Non-functional: every existing write-gate test stays green (same decisions, same `matched_rule`, same reasons). FCIS preserved — `core/bound-artifacts.js` has zero `@mastra/*` imports (it is pure data + glob strings). No behavior change: a path that blocks today blocks for the same `matched_rule`; a path that is ok today stays ok.

## Architecture

Today `evaluate-write-gate.js:76-128` (WRITE_GATE_RULES) inlines each rule's glob as a string literal in its `match` function (`globMatch("records/**", relPath)` etc.). The report's L3 #8 calls this out: extracting the set into `core/bound-artifacts.js` gives one source of truth for the simple-glob rules, imported by the write-gate. The constant is data-only (glob strings + labels + reasons); the `globMatch` call sites stay in `evaluate-write-gate.js` (the constant does not import `gate-logic.js` — that would reverse the dependency; the write-gate imports both).

`product/**` and `preflight-marker` are special cases (delegating to `evaluatePreflight` / `PREFLIGHT_MARKER_PATHS`), not plain bound-artifact globs. Keep them in `evaluate-write-gate.js` (not in the constant) — the constant is for the simple bound-artifact globs (`records/**`, `runtime-state.jsonl`, `meta-state.jsonl`, `file-index.jsonl`, `schemas/**`, build-artifacts). Phase 5 adds `<surface>/skills/**` to the constant.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/bound-artifacts.js`.
- Modify: `tools/learning-loop-mastra/core/evaluate-write-gate.js` (WRITE_GATE_RULES 76-128 — import from the constant).
- Test: `tools/learning-loop-mastra/core/evaluate-write-gate.test.js` (existing — must stay green); new `tools/learning-loop-mastra/__tests__/legacy-mcp/bound-artifacts.test.js` (asserts the constant is the source of truth).
- Note: `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js` enforces no hand-rolled SURFACES iteration in core/ outside surfaces.js — `bound-artifacts.js` must not iterate SURFACES (it is glob data, surface-agnostic; the per-surface expansion for skills happens in phase 5 via `getAllSurfacePaths`, not here).

## Implementation Steps

1. **Tests-first:** add `bound-artifacts.test.js` (red):
   - `BOUND_ARTIFACTS` is a frozen array; each entry has `{ name, matchedRule, glob, reason }` (or the agreed shape).
   - The set covers `records`, `runtime-state`, `meta-state`, `file-index`, `schemas`, `build-artifacts` (the 6 non-special rules).
   - **Pinned order:** `assert.deepStrictEqual(BOUND_ARTIFACTS.map(r => r.name), ["records","runtime-state","meta-state","file-index","schemas","build-artifacts"])` — first-match-wins semantics depend on order; pin it explicitly (red-team finding: order asserted in prose but unenforced is a latent reorder risk).
   - `core/bound-artifacts.js` has zero `@mastra/*` imports (FCIS) — `grep '@mastra' core/bound-artifacts.js` empty.
   - `evaluate-write-gate.js` imports `BOUND_ARTIFACTS` (assert the import; assert no inline `globMatch("records/**"` literal remains for the 6 rules).
2. Create `core/bound-artifacts.js`: export a frozen `BOUND_ARTIFACTS` array (data only — `{ name, matchedRule, glob, reason }` for the 6 simple rules) + a helper `boundArtifactMatch(relPath)` that returns the matching entry's `matchedRule` or null (optional — keep the `globMatch` call in the write-gate if cleaner; decide at implementation). Do NOT import `gate-logic.js` (avoids circular: gate-logic imports nothing from here, write-gate imports both).
3. Refactor `evaluate-write-gate.js` WRITE_GATE_RULES: build the 6 simple rules from `BOUND_ARTIFACTS` (map over the constant, `match: (relPath) => globMatch(entry.glob, relPath)`). Keep `preflight-marker` and `product` rules in place (special cases). Keep the rule ORDER identical (first-match-wins).
4. Run `pnpm test` on `core/evaluate-write-gate.test.js` (all 18+ cases green) + `legacy-mcp/bound-artifacts.test.js` + `legacy-mcp/runtime-agnostic.test.js`. Run `core/__tests__/` if it covers the write-gate.
5. Confirm `grep -n 'globMatch("records/**"\|globMatch("runtime-state.jsonl"\|globMatch("meta-state.jsonl"\|globMatch("file-index.jsonl"\|globMatch("schemas/**"' core/evaluate-write-gate.js` returns nothing (the literals moved to the constant).

## Success Criteria

- [ ] `core/bound-artifacts.js` exists; `BOUND_ARTIFACTS` frozen; covers the 6 simple rules.
- [ ] `core/bound-artifacts.js` has zero `@mastra/*` imports (FCIS preserved).
- [ ] `evaluate-write-gate.js` imports `BOUND_ARTIFACTS`; the 6 inline glob literals are gone.
- [ ] All existing `evaluate-write-gate.test.js` cases green (same decisions, `matched_rule`, reasons).
- [ ] Rule order unchanged (first-match-wins semantics identical).
- [ ] `runtime-agnostic.test.js` green (no hand-rolled SURFACES iteration added).

## Risk Assessment

Low. Pure refactor; the test suite pins behavior. The only risk is reordering WRITE_GATE_RULES (first-match-wins) — mitigated by mapping over the constant in the same order and asserting order in the test. Rollback: `git checkout core/evaluate-write-gate.js`; delete `core/bound-artifacts.js`.