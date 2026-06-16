# Bash Gate Debate Infrastructure — Step 2 Shipped

**Date**: 2026-06-15 15:38
**Severity**: Medium
**Component**: learning-loop-mcp (bash-gate.js, gate-logic.js, core helpers, MCP tools, SessionStart hook)
**Status**: Resolved

## What Happened

Shipped all 5 phases of `plans/260615-1530-bash-gate-debate-stderr-override-recurrence/` on branch `260614-1259-phase-b-codegen-adoption`. The work builds on Step 1's `core/surfaces.js` helper (shipped earlier the same day) and delivers the full "bash gate debate" infrastructure: decision visibility, in-session override, cross-surface decision logging, and recurrence tracking with a new SessionStart hook.

Full test suite: 38 suites, 950 tests, 949 passed, 1 skipped. Commit SHA `9f4a389`.

## The Brutal Truth

This was a textbook case of "foundation first, then behavior." The planning-order report (brainstorm-260615-1430) nailed the dependency inversion: if we had shipped the gate debate infrastructure before `surfaces.js`, every new file would have hand-rolled `.claude/` + `.factory/` path pairs and created retrofit debt. The inversion exercise caught it before a single line of code was written. The frustrating part is that this pattern keeps recurring — we keep almost inlining cross-surface paths, then catching ourselves at the plan stage. The loop is learning, but slowly.

## Technical Details

- **Phase 1 — Decision visibility**: `bash-gate.js` now emits `hookSpecificOutput` on stdout for block/escalate decisions (matches `formatSoftWarning` contract). The ok path stays silent (no noise on happy path).
- **Phase 2 — Override marker**: `core/gate-override.js` + `tools/gate-override-tool.js` implement `.gate-override` marker files in both surfaces, read with first-valid-wins semantics (.claude -> .factory). 1-second mtime-based cache per root, matching `loadPromotedRules` pattern.
- **Phase 3 — Decision log**: `core/gate-decision-log.js` appends atomic JSON lines to `.gate-decision.log` per surface. Fail-open on write errors — gate contract (exit code) is preserved regardless of log health.
- **Phase 4 — Recurrence tracker**: `core/recurrence-tracker.js` reads the decision log, computes recurrence stats, and files meta-state findings when a command pattern repeats within threshold/window. `gate-check-recurrence-tool.js` exposes it as an MCP tool. New `recurrence-check-on-start.js` SessionStart hook (NOT `inbound-gate.js`, which is UserPromptSubmit) wires it into session startup, with `.cjs` wrappers for both surfaces.
- **Phase 5 — Planning-order report annotation**: TL;DR table updated with Step 2 shipped status + cleanup backlog appended.

**New files**: 11 (3 core, 2 tools, 1 hook, 2 wrappers, 3 test files). **Modified**: 8 (bash-gate.js, protocol-adapter.js, gate-logic.js, 2 manifests, 2 settings.json, planning-order report).

## What We Tried

The plan validation session caught 2 unverified load-bearing claims and 1 architectural error before implementation started:
- Unverified: "stderr surfaces to the model on exit-2" — no confirmation in AGENTS.md or protocol-adapter.js. Resolution: use `hookSpecificOutput` on stdout instead.
- Unverified: "Hook runtime parses stdout for `decision: 'ok'`" — current code at line 121 is silent. Resolution: ok path stays silent.
- Architectural error: Phase 4 said "wire into `inbound-gate.js`" but that file is a UserPromptSubmit hook per its comment line 4. Resolution: new SessionStart hook.

These 3 issues were resolved in a 5-question validation session before any code was written. The cost of catching them in planning vs. post-ship: approximately zero vs. a full revert + rewire.

## Root Cause Analysis

No root-cause failure here — this entry documents a successful ship. The only "why did this work" insight is the planning-order discipline: the 3 problem-solving techniques (Inversion Exercise, Simplification Cascade, Meta-Pattern Recognition) from the brainstorm report directly produced the correct execution order. The helper shipped first; the gate debate infrastructure built on it cleanly; no retrofit debt was created.

## Lessons Learned

1. **Inversion Exercise is the cheapest insurance.** Asking "what if we did it the other way?" before committing to an order surfaced the hidden dependency on `surfaces.js` in 30 seconds of thought.
2. **Validation sessions pay for themselves.** 5 questions, 5 decisions, 0 unresolved contradictions at ship time. The 15 minutes spent in validation saved hours of post-ship refactoring.
3. **SessionStart vs UserPromptSubmit matters.** The hook binding mistake (inbound-gate.js is UserPromptSubmit, not SessionStart) would have caused the recurrence check to fire on every prompt instead of once per session. Hook type is a first-class design decision, not an implementation detail.
4. **Cleanup backlog is a feature, not a bug.** Deferring cosmetic items (stale comments, weak tests, JSDoc gaps) to a single post-ship session keeps plan-of-record PRs focused. The backlog now has 10 items across Steps 1 and 2.

## Next Steps

- **Step 3** (Report 1 Plan 2 — `node -e` strip) and **Step 4** (Report 2 Phases 2-5 — runtime-agnostic rule closeout) are unblocked and can be planned in parallel. Step 3 is fully independent; Step 4 needs Step 1's helper + Step 2's new MCP tools (already rule-compliant by design).
- **Cleanup backlog**: 10 items accumulated across Steps 1 and 2. Process in a single `plans/260615-CLEANUP-batch-cleanup-after-planning-order/` plan after all 4 steps ship. See `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` "Cleanup backlog" section for the full list.
- **Docs**: `docs/system-architecture.md` and `docs/operator-guide.md` already updated by docs-manager; no further action needed.
