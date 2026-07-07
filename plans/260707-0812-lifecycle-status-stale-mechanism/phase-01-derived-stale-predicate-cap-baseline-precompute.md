---
phase: 1
title: "Derived-stale predicate + cap-baseline precompute"
status: pending
priority: P2
dependencies: []
---

# Phase 1: Derived-stale predicate + cap-baseline precompute

## Overview

Ship the `isOpen` / `isStaleView` helpers + a shared `STALENESS_WINDOW_MS` constant, and re-baseline the cap test against the derived stale view computed over the live registry — **while `stale` is still a status**. This is the de-risking phase: it establishes the new threshold and the predicate before any enum change, so phase 2 has a safety net.

## Requirements

- Functional: a pure `isOpen(finding)` predicate (status not in `{resolved, superseded, archived}` — tolerates legacy `active`/`reported`/`stale` as open); a pure `isStaleView(finding)` predicate (`isOpen` AND (age > `STALENESS_WINDOW_MS` from `last_verified_at`/`created_at` OR hash drift via `file-index.jsonl`)); a `derivedStaleSet(entries)` selector. The cap test asserts the derived-stale `mechanism_check` population ≤ a precomputed threshold.
- Non-functional: helpers are pure functions (no registry writes); the existing `status:"stale"` cap assertion stays green alongside the new derived assertion during this phase.

## Architecture

New module `tools/learning-loop-mastra/core/stale-view.js` exports `isOpen`, `isStaleView`, `derivedStaleSet`, and re-exports `STALENESS_WINDOW_MS` (sourced from `META_STATE_STALENESS_WINDOW_MS` env, default 7d — the same source `sweep`'s `checkStaleness` uses today, extracted so the derived view and the (soon read-only) sweep can't diverge). Hash drift is read from `file-index.jsonl` via the existing `core/file-index.js` reader (the path-keyed fingerprint index shipped by plan 260702-1933). The cap test (`__tests__/legacy-mcp/cold-tier-regression.test.js:72-77`) gains a derived-predicate assertion at the precomputed threshold; the old `status:"stale"` assertion stays during phase 1 (removed in phase 4 once the migration lands).

## Related Code Files

- Create: `tools/learning-loop-mastra/core/stale-view.js`
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/stale-view.test.js`
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` (add derived-predicate cap assertion + precompute)
- Read (reference): `tools/learning-loop-mastra/core/file-index.js` (hash-drift input), `tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js:23-32` (`checkStaleness` — the `STALENESS_WINDOW_MS` source to extract)

## Implementation Steps (TDD — tests first)

1. **Write `stale-view.test.js`** first. Cases: `isOpen` returns true for `open`/`active`/`reported`/`stale`/`null-status`, false for `resolved`/`superseded`/`archived`; `isStaleView` true for an open finding older than the window OR with a drifted `evidence_code_ref` hash, false for a freshly-verified open finding or a terminal finding; `derivedStaleSet` returns the right subset of a fixture.
2. **Implement `core/stale-view.js`** to pass. Extract `STALENESS_WINDOW_MS` from the same env expression `meta-state-sweep-tool.js:23-32` uses (don't duplicate the literal — import or share a constant; if a shared constants module doesn't exist, create `core/constants.js` and have both import it — decide in-step, prefer the smaller touch).
3. **Compute the derived cap baseline over the live registry.** Read `meta-state.jsonl` (read-only); compute `derivedStaleSet` ∩ `mechanism_check ∈ {true, null}`; record the count. Set the new cap threshold = derived count + headroom (headroom = 2, matching the existing 12-vs-10 headroom convention).
4. **Add the derived-predicate assertion to `cold-tier-regression.test.js`** alongside the existing `status:"stale"` ≤12 assertion: assert `derivedStaleSet(current.all_findings).filter(mechanism_check).length <= <precomputed threshold>`. Both assertions pass during phase 1.
5. Run `pnpm test --filter stale-view` + `pnpm test --filter cold-tier-regression`; both green.

## Success Criteria

- [ ] `core/stale-view.js` exports `isOpen`, `isStaleView`, `derivedStaleSet`, `STALENESS_WINDOW_MS`; `stale-view.test.js` green.
- [ ] `isOpen` tolerates legacy `active`/`reported`/`stale` as open (key transition property).
- [ ] Cap test has a derived-predicate assertion at a precomputed threshold (count recorded in the plan/phase); old `status:"stale"` assertion still passes.
- [ ] `STALENESS_WINDOW_MS` sourced from the same env as sweep's `checkStaleness` (no literal duplication).
- [ ] No registry writes; no enum change; `stale` still a status.

## Risk Assessment

Low. Additive only — no existing behavior changes. The risk is a wrong derived count (mis-computed age or drift), mitigated by computing over the live registry in-step and recording the count. If the derived count is wildly larger than 12 (e.g. ~100), that confirms the 0958 report's "possibly by an order of magnitude" note and validates the re-baseline gate — not a failure.