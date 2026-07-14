---
phase: 2
title: "add-process-hints-and-hook-mirror"
status: completed
effort: ""
---

# Phase 2: Promote rule + add PROCESS_HINTS + hook mirror

## Overview

Promote `rule-fallow-brief-on-gate-failure` via `meta_state_promote_rule` (idempotent), append row #5 to PROCESS_HINTS in `tools/learning-loop-mastra/core/loop-introspect.js`, mirror the same row byte-for-byte in `.factory/hooks/loop-surface-inject.cjs` LOCAL_PROCESS_HINTS.

## Requirements

- Functional: rule entry appears in `meta_state_list({ entry_kind: 'rule' })`; PROCESS_HINTS row count goes 4 → 5; LOCAL_PROCESS_HINTS row count goes 4 → 5; row text is byte-identical between the two surfaces; `loop_describe({tier: 'warm'})` returns 5 process_hints rows and empty warnings array.
- Non-functional: `meta_state_promote_rule` succeeds without re-writing the originating finding's `description` (per `meta-state-promote-rule-tool.js:172` — the tool hard-codes the description; any custom text we want lives in the rule body JSON, NOT the description field).

## Related Code Files

- Modify: `meta-state.jsonl` (append 1 rule entry via `meta_state_promote_rule` MCP tool; do NOT hand-edit)
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` (append row #5 to `PROCESS_HINTS` array, between current row #4 and the closing `]);`)
- Modify: `.factory/hooks/loop-surface-inject.cjs` (append row #5 to `LOCAL_PROCESS_HINTS` array, mirroring PROCESS_HINTS row #5 byte-for-byte)
- Create: (none yet; Phase 3 adds the regression test)

## Implementation Steps

> **Order matters.** Steps are reversed from natural "promote then append" order to avoid the H6 ordering-gate warning window (`loop-describe-tool.js:94-106`). Append rows FIRST; promote the rule LAST.

1. **Verify `LOOP_SESSION_MODE === "live"`** before any registry write. `meta_state_promote_rule` (`meta-state-promote-rule-tool.js:57-67`) is live-gated. If not live, STOP and surface to operator.
2. Read `tools/learning-loop-mastra/core/loop-introspect.js` lines **126-127** to identify the exact insertion point: end of line 126 is the closing `"` of row #4 (Tool integration checklist) followed by `,`; line 127 is `]);`. The new row text comes from `plan.md` Appendix B verbatim.
3. Edit `core/loop-introspect.js` to append row #5 between line 126 and line 127. Preserve trailing comma on row #4 (the multi-element `Object.freeze([...])` requires it).
4. **Verify step 2-3 landed atomically**: `node -c tools/learning-loop-mastra/core/loop-introspect.js` (syntax check); `awk '/PROCESS_HINTS = Object.freeze/,/]);/' tools/learning-loop-mastra/core/loop-introspect.js | grep -c '^  "'` should report 5 row-opening quote-prefixed strings.
5. Read `.factory/hooks/loop-surface-inject.cjs` lines **39-40** to find the matching insertion point.
6. Edit `.factory/hooks/loop-surface-inject.cjs` to mirror row #5 byte-for-byte between line 39 and line 40. The cold-session parity test (Phase 3) catches any drift.
7. **Verify step 5-6 landed atomically**: `node -c .factory/hooks/loop-surface-inject.cjs` (syntax check).
8. **Intermediate gate** — call `loop_describe({ tier: 'warm' })` MCP tool BEFORE promoting the rule. The H6 ordering gate does NOT yet fire (no promoted rule exists), so this is a sanity check that the rows were appended correctly. Expected: 4 process_hints rows returned (the new PROCESS_HINTS row is not yet exposed to the runtime because the file is loaded lazily — but the assertion here is that `loop_describe` does not error and that the warm-tier response shape is unchanged).
9. Call `meta_state_promote_rule` MCP tool with:
   ```
   id: 'meta-260712T0730Z-fallow-mcp-runtime-needs-format-json'
   rule_id: 'rule-fallow-brief-on-gate-failure'
   enforcement: 'agent'
   pattern_type: 'consult-checklist'
   pattern: '<JSON-encoded 1-item checklist from Appendix A>'
   # No applies_to field — consult-checklist rules carry no surface gate
   # (verified: gate-logic.js:750-755 short-circuits consult-checklist;
   # line 757 skips enforcement !== 'gate'; surfaces field is decorative)
   ```
   Capture the response; the rule entry should appear at the next `meta_state_list({ entry_kind: 'rule', id: 'rule-fallow-brief-on-gate-failure' })`.
10. **Final gate** — call `loop_describe({ tier: 'warm' })` again. Assert: `process_hints` array has 5 entries; entry #5 references the literal `rule-fallow-brief-on-gate-failure` substring; `warnings` array is empty (no H6 ordering gate warning). If `warnings` is non-empty, the row text does not contain the literal rule id and Phase 3 will fail — STOP and re-check the PROCESS_HINTS row text against Appendix B.

## Success Criteria

- [ ] `LOOP_SESSION_MODE === "live"` verified at step 1.
- [ ] `meta_state_list({ id: 'rule-fallow-brief-on-gate-failure' })` returns 1 entry with `entry_kind: 'rule'`, `pattern_type: 'consult-checklist'`, `status: 'active'`.
- [ ] `tools/learning-loop-mastra/core/loop-introspect.js` PROCESS_HINTS has 5 rows; row #5 begins with `"Fallow gate triage.` and includes the literal substring `rule-fallow-brief-on-gate-failure`.
- [ ] `.factory/hooks/loop-surface-inject.cjs` LOCAL_PROCESS_HINTS has 5 rows; row #5 begins with `"Fallow gate triage.` (byte-identical to PROCESS_HINTS row #5).
- [ ] `loop_describe({ tier: 'warm' })` returns 5 process_hints entries AND empty `warnings` array (H6 ordering gate is silent).
- [ ] `meta_state_patch({ id: 'rule-fallow-brief-on-gate-failure', entry_kind: 'rule', patch: { affected_system: 'gate-logic' } })` succeeds (records that this rule affects the gate-logic system).

## Risk Assessment

- **Risk:** `LOOP_SESSION_MODE` is not live — `meta_state_promote_rule` returns `live_session_required`. **Mitigation:** Phase 1 step 1 verifies; Phase 2 step 1 re-verifies; if not live, STOP and surface to operator.
- **Risk:** Editing `core/loop-introspect.js` accidentally changes the structure of `Object.freeze([...])` (e.g., drops the trailing comma, breaks the array literal). **Mitigation:** after each edit, run `node -c tools/learning-loop-mastra/core/loop-introspect.js` to syntax-check; run `awk '/PROCESS_HINTS = Object.freeze/,/]);/' tools/learning-loop-mastra/core/loop-introspect.js | grep -c '^  "'` to verify row count.
- **Risk:** Hook mirror drift between PROCESS_HINTS and LOCAL_PROCESS_HINTS. **Mitigation:** byte-for-byte copy; Phase 3 parity test enforces it.
- **Risk:** Mid-rollout drift — partial edit between PROCESS_HINTS and LOCAL_PROCESS_HINTS leaves the H6 ordering gate silent until parity test runs. **Mitigation:** Phase 2 step 8 (intermediate gate) and step 10 (final gate) run `loop_describe({tier: warm})` and assert `warnings` is empty BEFORE proceeding. The cold-session parity test alone does NOT detect "rule has no PROCESS_HINTS row" (it only checks array equality per `cold-session-discoverability.test.cjs:359-379`).
- **Risk:** Duplicate rule id via retry after transient failure — `meta-state-promote-rule-tool.js:143-157` uniqueness check fires only when an existing entry has `status: 'active'`, so a stale `superseded`/inactive rule with the same id would silently be overwritten. **Mitigation:** before calling `meta_state_promote_rule`, run `meta_state_list({ entry_kind: 'rule', id: 'rule-fallow-brief-on-gate-failure', compact: true })` to confirm no existing entry (active OR inactive).