---
phase: 4
title: "resolve-finding-and-journal"
status: completed
effort: ""
---

# Phase 4: Supersede finding + change-log + journal

## Overview

Mark the originating finding `meta-260712T0730Z-fallow-mcp-runtime-needs-format-json` as `superseded` via `meta_state_supersede` (gated on LOOP_SESSION_MODE=live), pointing `consolidated_into` at the new change-log entry. Write the change-log via `meta_state_log_change` capturing the rule promotion + PROCESS_HINTS row + hook mirror + parity test. Draft a journal entry capturing the shipped invariants and lessons learned.

## Requirements

- Functional: finding status flips to `superseded` with `consolidated_into` pointing at the change-log id; change-log entry has `applies_to.rules: ['rule-fallow-brief-on-gate-failure']`; journal entry written.
- Non-functional: the change-log uses `applies_to.rules` only — NOT `consolidates` field (no registry precedent per `plans/reports/journal-260628-fallow-tool-integration-rule.md` lesson); the journal captures the byte-count measurements from task 1.

## Related Code Files

- Modify: `meta-state.jsonl` (via `meta_state_supersede` + `meta_state_log_change` MCP tools; do NOT hand-edit)
- Create: `plans/reports/journal-260714-fallow-brief-discovery.md` (NEW; mirrors the structure of `plans/reports/journal-260628-fallow-tool-integration-rule.md`)

## Implementation Steps

1. **Verify `LOOP_SESSION_MODE === "live"`** before any registry write. `meta_state_supersede` (`meta-state-supersede-tool.js:19-21`) is live-gated. If not live, STOP and surface to operator. **There is NO `meta_state_patch` fallback** — `IMMUTABLE_PATCH_FIELDS` (`core/meta-state.js:392-405`) blocks both `status` and `consolidated_into`, making the fallback physically unreachable.
2. Call `meta_state_log_change` MCP tool with:
   ```
   change_dimension: 'semantic'
   change_target: 'meta-state.jsonl#rule-fallow-brief-on-gate-failure + tools/learning-loop-mastra/core/loop-introspect.js#PROCESS_HINTS row #5 + .factory/hooks/loop-surface-inject.cjs#LOCAL_PROCESS_HINTS row #5'
   # change_target has no schema length limit (meta-state.js:208-209 is z.string().min(1) only — keep full audit context)
   change_diff: {
     added: [
       'rule-fallow-brief-on-gate-failure (consult-checklist, 1 item)',
       'PROCESS_HINTS row #5 in tools/learning-loop-mastra/core/loop-introspect.js',
       'LOCAL_PROCESS_HINTS row #5 in .factory/hooks/loop-surface-inject.cjs',
       'gate-logic-consult-checklist-fallow-brief.test.js (2 tests)'
     ],
     removed: [],
     changed: [
       'meta-260712T0730Z-fallow-mcp-runtime-needs-format-json: status open → superseded (consolidated into this change-log)'
     ]
   }
   reason: 'Encode the fallow:gate-failure → fallow:brief trigger→action mapping as a consult-checklist rule. The originating finding was based on a 2026-07-12 measurement that no longer matches fallow 3.3.0 behavior on this codebase; the right primitive is `--brief --format compact`. PROCESS_HINTS row surfaces the hint at session start; cold-session parity test enforces mirror alignment. PROCESS_HINTS row was appended BEFORE the rule was promoted so the H6 ordering gate never fired.'
   applies_to: { rules: ['rule-fallow-brief-on-gate-failure'], statuses: ['superseded', 'active'] }
   # No tools/surfaces fields — the surfaces field on applies_to is decorative for
   # consult-checklist rules (gate-logic.js:750-755, 757); tools/surfaces omitted
   # from the change-log for parity with rule-tool-integration-same-commit-dep.
   ```
   Capture the new change-log id from the response.
3. Call `meta_state_supersede` MCP tool with:
   ```
   id: 'meta-260712T0730Z-fallow-mcp-runtime-needs-format-json'
   consolidated_into: '<change-log id from step 2>'
   resolution: 'Encoded as rule-fallow-brief-on-gate-failure (consult-checklist, 1 item). The originating finding\'s empirical claim about fallow output token cost was based on a 2026-07-12 measurement that does not match fallow 3.3.0 behavior on this codebase today. The right primitive is `--brief --format compact` — a one-line-per-finding CSV stream that replaces the gate\'s decorated human report. PROCESS_HINTS row #5 surfaces the hint at session start; cold-session parity test enforces mirror alignment. See reports/byte-size-measurements.md for Phase 1 measurement data.'
   ```
   Note: the `resolution` text is qualitative and references the measured report. Avoid quoting specific byte counts unless they come from `reports/byte-size-measurements.md` — persisted registry text is high-trust and future operators will reproduce against it.
4. Verify with `meta_state_list({ id: 'meta-260712T0730Z-fallow-mcp-runtime-needs-format-json', compact: false })` — should return `status: 'superseded'` with `consolidated_into` pointing at the new change-log id.
5. Write `plans/reports/journal-260714-fallow-brief-discovery.md` modeled on `plans/reports/journal-260628-fallow-tool-integration-rule.md`. Required sections:
   - **What shipped:** rule id, PROCESS_HINTS row text (verbatim), parity-test result, +2 test delta, byte-size measurements reference.
   - **Files modified:** table of paths + change summary.
   - **Lessons:** at minimum 5 entries:
     - The `meta_state_promote_rule` tool hard-codes `description` (line 172); custom text lives in the rule body JSON, not the description field.
     - The H6 ordering gate (`loop-describe-tool.js:94-106`) uses substring match against `rule.id`; PROCESS_HINTS row text must include the literal rule id token, AND the row must exist BEFORE the rule is promoted (reverse the natural order).
     - The cold-session parity test (lines 359-379 of `cold-session-discoverability.test.cjs`) enforces byte-for-byte parity; any drift fails loudly. It does NOT detect "rule has no PROCESS_HINTS row" (that's the H6 gate's job).
     - `applies_to.surfaces` is decorative for `consult-checklist` rules with `enforcement: 'agent'` — verified at `gate-logic.js:750-755, 757` short-circuits. Mirror `rule-tool-integration-same-commit-dep` shape (no `applies_to` field).
     - **Dead code path learned:** documenting a `meta_state_patch` fallback for `meta_state_supersede` looks safe but is structurally unreachable due to `IMMUTABLE_PATCH_FIELDS` (`core/meta-state.js:392-405`). Always prefer gate the prerequisite (`LOOP_SESSION_MODE=live`) over patching around the gate.
   - **Followups:** (a) file a separate finding for `.factory/hooks/**` missing from `CHANGE_LOG_BOUND_PATHS` (Rec 12 gap-detection ignores drift on this path); (b) file a separate finding for `rule.pattern` JSON-validation schema gap (`pattern: z.string()` allows malformed patterns to reach `JSON.parse` at runtime); (c) consider adding a Phase 3 regression test that verifies every active `consult-checklist` rule has a matching PROCESS_HINTS row (closes the runtime gap between H6 gate firing and cold-session parity holding).
6. Run `pnpm test` one final time — should still be +2 over baseline.

## Success Criteria

- [ ] `meta_state_list({ id: 'meta-260712T0730Z-fallow-mcp-runtime-needs-format-json', compact: false })` returns `status: 'superseded'` with non-null `consolidated_into`.
- [ ] `meta_state_list({ id: 'rule-fallow-brief-on-gate-failure', compact: false })` returns the rule with `promoted_at` timestamp set and `origin: 'meta-260712T0730Z-fallow-mcp-runtime-needs-format-json'`.
- [ ] New change-log entry exists with `applies_to.rules: ['rule-fallow-brief-on-gate-failure']` (NOT `consolidates`).
- [ ] `plans/reports/journal-260714-fallow-brief-discovery.md` exists with sections: What shipped, Files modified, Lessons (≥3), Followups.
- [ ] `pnpm test` test count delta is still exactly +2.

## Risk Assessment

- **Risk:** `meta_state_supersede` requires `LOOP_SESSION_MODE=live`; if not live, the tool returns `{ superseded: false, reason: 'live_session_required' }`. **Mitigation:** Step 1 verifies live mode. There is no `meta_state_patch` fallback — `IMMUTABLE_PATCH_FIELDS` (`core/meta-state.js:392-405`) blocks both `status` and `consolidated_into`. Plan terminates without Phase 4 landing if not live.
- **Risk:** The change-log's `change_target` is interpreted as long by future readers and triggers accidental truncation. **Mitigation:** none — there is no schema length limit on `change_target` (`meta-state.js:208-209` is `z.string().min(1)` only; the 200-char cap is on `operation_envelope.target`, a different field). Keep the full compound string for audit-trail completeness; shorten would damage `Rec 12 closed-loop backfill` path matching.
- **Risk:** The journal's "Lessons" section is too thin to be useful for future agents. **Mitigation:** cross-reference specific line numbers and tool names; the 260628 journal's lesson structure is the model.