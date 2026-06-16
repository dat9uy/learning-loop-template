# Step 4: Runtime-Agnostic Rule Closure + Helper Extensions

**Date**: 2026-06-15 22:36
**Severity**: Medium
**Component**: tools/learning-loop-mcp/core/surfaces.js, gate-logic.js, gate-decision-log.js, gate-override.js, agent-manifest.json, AGENTS.md
**Status**: Resolved

## What Happened

Shipped Step 4 of the planning-order sequence, closing the runtime-agnostic rule and completing the Simplification Cascade thesis. 8 phases, 25 new tests, 0 regressions (982/983 pass, 1 skipped).

## The Brutal Truth

This was the cleanup step everyone knew was coming but nobody wanted to do. Step 2 shipped hand-rolled cross-surface loops in gate-decision-log.js and gate-override.js because the surfaces.js helper only had read/write — no append, no JSONL, no read-modify-write. The spec said "use the helper"; the code didn't. That drift sat for hours until the red-team review in Step 2's post-ship flagged it as spec deviation. We could have shipped Step 4 inline with Step 2, but the planning-order decision deliberately sequenced it last to keep Step 2 focused on user-visible gate debate infrastructure. The debt was real; the sequencing was correct; the fix is now done.

## Technical Details

- **3 new helpers in core/surfaces.js**: `appendToAllSurfaces` (true append, `appendFileSync` per surface), `readJsonlFromAllSurfaces` (dedup + sort across surfaces), `readModifyWriteOnAllSurfaces` (per-surface atomic RMW, opt-in `removeOnNull` default false for safety).
- **3 refactored call sites**: `gate-decision-log.js#appendDecisionLog` and `#readDecisionLog` now use `appendToAllSurfaces` / `readJsonlFromAllSurfaces`; `gate-override.js#writeGateOverride` and `#readGateOverride` now use `readModifyWriteOnAllSurfaces` / `readFromAllSurfaces`. Hand-rolled loops eliminated.
- **New pattern type**: `consult-checklist` in `core/gate-logic.js#applyPromotedRules` — design-time rule, no-op at command-time (moved before the `enforcement !== "gate"` filter after red-team Finding 8 caught it as dead code).
- **New MCP tool**: `check_runtime_agnostic` — 6-item checklist audit surface, returns structured feedback with `fix_suggestion` on failure. Extracted shared checklist module `core/runtime-agnostic-checklist.js` (used by both the tool and the regression test).
- **Rule entry**: `rule-runtime-agnostic-features` promoted via `meta_state_promote_rule` MCP tool (not direct file write — red-team Finding 6). `enforcement=agent`, `pattern_type=consult-checklist`.
- **AGENTS.md amendment**: new "Runtime-Agnostic Pattern" subsection. `loop_describe` hint updated.

## What We Tried

- Phase 1-3: red-green-refactor for each helper. Tests pinned the contract before the refactor touched call sites. Phase 3's `readModifyWriteOnAllSurfaces` was the trickiest — the modifier function contract, atomicity semantics, and fail-open behavior all needed red-team scrutiny. Finding 7 (fail-open `unlinkSync`) and Finding 10 (per-surface vs cross-surface atomicity) were caught before ship.
- Phase 5: initial `consult-checklist` branch was placed after the `enforcement !== "gate"` filter, making it unreachable. Red-team Finding 8 caught this; branch moved before the filter.
- Phase 6: path traversal in `feature_path` (Finding 5) and `EISDIR` DoS (Finding 13) both caught and fixed with `resolveFeaturePath()` enforcing relative-only, containment, exists, is-file.

## Root Cause Analysis

The fundamental issue was a partial application of the Simplification Cascade thesis. Step 1 shipped the helper with read/write only. Step 2's plan assumed the helper covered all cross-surface patterns, but the implementation didn't. The gap (append, JSONL, RMW) wasn't visible until the code reviewer compared the plan's Architecture section against the actual call sites. The sequencing decision (Step 2 ships user value first, Step 4 cleans up the debt) was intentional, but the debt should have been tracked more explicitly in the planning-order report from the start.

## Lessons Learned

1. **When a plan says "use the helper", verify the helper's API covers ALL call-site patterns BEFORE the plan is approved.** The gap between "helper exists" and "helper covers all cases" is where spec drift lives.
2. **Red-team review of the PLAN (not just the code) catches structural issues.** Findings 5-15 were all plan-level issues (test counts, cleanup item counts, branch placement, path security) that a code-only review would miss.
3. **The `removeOnNull: false` default is the right safety posture.** An earlier draft had `unlinkSync` as default behavior; red-team Finding 7 flipped it. Explicit opt-in for destructive operations is worth the extra parameter.
4. **PII-safe logging in helpers is not optional.** `console.error` in `appendToAllSurfaces` and `readModifyWriteOnAllSurfaces` now logs only `surface` + `basename(path)`, not the full user-derived subpath (Finding 14).

## Next Steps

- **CLEANUP batch** (`260615-CLEANUP-batch-cleanup-after-planning-order`): 7 remaining cosmetic/hygiene items (Step 1: 1.1-1.5, Step 2: 2.3, 2.4, 2.5). Step 4 contributes 4 new cleanup items (4.1-4.4) — checklist helper names, shim-mirror hash comparison, RMW atomicity doc, stale line numbers in plan files.
- **Post-4-step brainstorm**: reconsider MCP-mediation for `recurrence-tracker.js#checkAndEmit` (Q2 follow-up). No concrete date.
- **Planning-order report**: already annotated `status: complete` (Phase 8). All 4 steps shipped. Sequence is closed.
