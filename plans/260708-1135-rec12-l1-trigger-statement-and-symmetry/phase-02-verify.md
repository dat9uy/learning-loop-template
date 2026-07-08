---
phase: 2
title: "Verify"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Verify

## Overview

Apply the trigger rule this plan ships to the plan's own edit: record the `loop-engine.md` change via `meta_state_log_change` (the recursion-bound invariant in action), then verify the doc reads as one coherent section, no dangling references remain, and no code/test/schema file was touched.

## Requirements

- **Functional:** a `meta_state_log_change` entry exists for the `loop-engine.md` edit; the promoted section reads coherently; no anchor/reference is left dangling; the diff is docs-only.
- **Non-functional:** `meta_state_log_change` is called in `LOOP_SESSION_MODE` consistent with Plan 2 (it is an open tool — runs in both `live` and `autonomous`; no `live` requirement). No test run is needed for a docs-only change, but confirm `git diff --stat` shows only `docs/loop-engine.md`.

## Architecture

The verification has two halves: (1) **record** — the loop's self-maintenance: the L1 doc edit is a bound-artifact change, so it emits a change-log via the MCP tool (a record write, logged in `meta-state.jsonl`; not another bound-artifact edit — recursion bounded). (2) **confirm** — re-read the section in context, grep for dangling references, confirm the diff scope. No test suite asserts on this prose, so verification is structural + diff-based, not test-based.

## Related Code Files

- Read: `docs/loop-engine.md` (full re-read of the promoted section in context)
- Modify (via MCP tool, not direct file write): `meta-state.jsonl` (the registry — appended to by `meta_state_log_change`)
- Create/Delete: none

## Implementation Steps

1. **Record the change-log.** Call the `meta_state_log_change` MCP tool with:
   - `change_dimension: "semantic"` (an L1 concept-doc meaning change, not a mechanical/surface edit)
   - `change_target: "docs/loop-engine.md"`
   - `change_diff: { added: ["The change-log trigger (Rec 12) section: general trigger rule + Q11 symmetry + repointed honest-framing"], removed: ["The recursion-bound statement (skills) heading"], changed: ["recursion-bound termination argument generalized; skills reframed as named instance"] }`
   - `reason: "Ship Rec 12 component (a): L1 change-log trigger rule + Q11 operator/agent symmetry; promote skills recursion-bound section to general trigger."` (≥20 chars)
   - `applies_to: { surfaces: ["meta"], schemas: ["docs/loop-engine.md"] }`
   - No `evidence_code_ref` (this is a doc edit, not a code change — `mechanism_check` defaults to false; do not set `evidence_code_ref`).
2. **Confirm the entry landed.** Call `meta_state_list({ entry_kind: "change-log", compact: true })` and confirm a change-log entry with `change_target: docs/loop-engine.md` appears at the top.
3. **Re-read the section + the role bullet in context.** Read `docs/loop-engine.md` lines ~85–95 and confirm the section reads as one coherent block: heading → general trigger → skills instance + recursion bound → symmetry → honest framing. Confirm the section's neighbors ("The 13 escape-hatch items" above, "Authoring loop-maintained skills" below) still flow. Also read the `record` role bullet (line ~40) and confirm the cross-reference to the new section reads cleanly and the bullet stays one logical line.
4. **Grep for dangling references.** `grep -rn "recursion-bound\|broadened Rec 12\|recursion-bound statement (skills)" docs/ tools/ .claude/` — the only hits for "recursion-bound" should be inside the promoted section (the concept term is retained) and in historical `docs/journals/` files (untouched). No live doc should reference the old heading as if it still exists.
5. **Confirm docs-only diff.** `git diff --stat` shows only `docs/loop-engine.md` (plus the plan dir under `plans/`, which is not product code). No `core/`, `tools/`, `schemas/`, or `__tests__/` file in the diff. `pnpm test` is not required for a docs-only change, but if run as a smoke check it must remain green (no test asserts on this prose).
6. **Update the tracker.** Edit `plans/reports/from-problem-solving-to-plan-split-260707-0812-rec12-lifecycle-pr-tracker-report.md` Plan 3 row: `Status: PLAN_CUT` → `COOKING` (or `SHIPPED` on PR merge), fill `Branch / PR`, and log any deviation from the scope in the row's note. Confirm Plan 4's `Depends on: Plan 3` is now un-blocked (Plan 4 stays `TODO` until cut).

## Success Criteria

- [ ] `meta_state_log_change` entry recorded with `change_dimension: "semantic"`, `change_target: "docs/loop-engine.md"`, reason ≥20 chars; confirmed via `meta_state_list`.
- [ ] Promoted section reads coherently in context (heading → trigger → instance + recursion bound → symmetry → honest framing); neighbor sections flow.
- [ ] `grep -rn "recursion-bound\|broadened Rec 12" docs/ tools/ .claude/` returns no dangling live reference to the old heading (historical journal hits are fine).
- [ ] `git diff --stat` shows only `docs/loop-engine.md` in the product surface (plan-dir changes under `plans/` are expected and not product code).
- [ ] Tracker Plan 3 row updated (status, branch/PR, deviation note if any); Plan 4 dependency un-block noted.

## Risk Assessment

- **Risk:** `meta_state_log_change` is called with `evidence_code_ref` set, which would default `mechanism_check: true` and create a grounding fingerprint for a doc path that has no code hash. **Mitigation:** do NOT set `evidence_code_ref` for a doc edit; the change-log is a record of a doc change, not a code mechanism. Step 1 calls this out explicitly.
- **Risk:** the change-log entry itself is a bound-artifact-adjacent write and could be misread as needing its own change-log (infinite recursion). **Mitigation:** this is exactly the recursion-bound invariant the section states — change-logs are records, records are not bound artifacts; the recursion terminates. No action needed beyond recording once.
- **Risk:** a future reader sees the general trigger and assumes detection already enforces it. **Mitigation:** the Honest-framing paragraph (repointed in Phase 1, step 6) explicitly states the detector is deferred to Plan 4 and that a violation today produces a record drift, not a hard failure.